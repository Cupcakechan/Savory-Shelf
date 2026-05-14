'use server'

import { generateText } from 'ai'
import { createXai } from '@ai-sdk/xai'
import type { Recipe } from './types'
import { getRateLimitKey, checkRateLimit } from './rate-limit'

// ── Model ─────────────────────────────────────────────────

function getModel() {
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not set. Add it to your Vercel environment variables.')
  }
  const xai = createXai({ apiKey: process.env.XAI_API_KEY })
  return xai('grok-3')
}

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(cleaned) as T
}

// ── System prompts ────────────────────────────────────────

const TRANSLATE_SYSTEM = `\
You are a professional chef, culinary instructor, and translator fluent in all major languages. \
Your role is to translate recipe text into clear, natural English while preserving culinary authenticity.

Guidelines:
- Translate the title, all ingredients, and all instructions naturally and accurately
- For cooking techniques or terms with no direct English equivalent, translate and add a brief parenthetical explanation
- Preserve original measurements but add common equivalents in parentheses when helpful (e.g. "200g (7 oz)")
- Maintain the recipe's authentic voice — do not simplify, modernise, or alter the recipe itself
- If the recipe is already in English, return it unchanged

Return ONLY a valid JSON object — no markdown, no code fences, no commentary outside the JSON:
{"title":"...","ingredients":["..."],"instructions":["..."]}`

const SUBSTITUTES_SYSTEM = `\
You are a professional chef and culinary expert with encyclopedic knowledge of global ingredients \
and practical kitchen substitutions.

Your task: review the ingredient list and identify any uncommon, regional, specialty, or hard-to-find \
ingredients. For each, suggest 1–3 practical supermarket alternatives with a brief note on how the swap \
affects flavour or texture.

Guidelines:
- Only flag ingredients that may genuinely be hard to find in a typical Western supermarket
- Be specific and practical (e.g. "Thai basil → regular basil + a few mint leaves (slightly different floral note)")
- If all ingredients are universally available, say so warmly and optionally suggest a quality upgrade or two
- Keep each note to one short sentence maximum

Return ONLY a valid JSON object — no markdown, no code fences, no commentary outside the JSON:
{"substitutes":[{"original":"ingredient name","substitutes":["swap 1 (note)","swap 2 (note)"]}],"note":"overall tip or empty string"}`

const PARSE_RECIPE_SYSTEM = `\
You are a professional chef. Extract structured recipe data from raw text — this may be a copied web page, \
a photo transcript, a screenshot, or hand-typed notes. Be thorough and accurate.

Guidelines:
- title: the recipe name
- ingredients: every ingredient line exactly as written, as an array of strings
- instructions: every step as a separate string in an array
- servings: integer if mentioned (e.g. "Serves 4", "Makes 12"), otherwise null
- prepTime: extract if the text contains a prep/preparation time label such as \
  "Prep Time:", "Prep:", "Preparation Time:", "Preparation:", or similar. \
  Return as a concise human-readable string like "15 min", "30 minutes", "1 hr", or null if absent.
- cookTime: extract if the text contains a cook/bake/roast time label such as \
  "Cook Time:", "Cooking Time:", "Bake Time:", "Baking Time:", "Roasting Time:", \
  "Fry Time:", "Simmer Time:", or similar. \
  Return as a concise human-readable string like "30 min", "1 hr 15 min", or null if absent. \
  Do NOT use "Total Time" as cookTime — only use an explicit cook/bake label.
- imageUrl: if the text contains a full, absolute image URL that represents the main recipe \
  photo (e.g. from an og:image tag, a src= attribute, or a clearly labelled photo URL), \
  return it as a string. Only return absolute URLs starting with https://. Otherwise null.

Return ONLY a valid JSON object — no markdown, no code fences, no commentary outside the JSON:
{"title":"...","ingredients":["..."],"instructions":["..."],"servings":null,"prepTime":null,"cookTime":null,"imageUrl":null}`

const PANTRY_MATCH_SYSTEM = `\
You are a culinary expert. Given a list of pantry staple ingredients, determine which recipes can \
mostly be made from those staples.

Matching rules:
- Be smart about synonyms and equivalents: "pasta" covers spaghetti/penne/fusilli/rigatoni; \
"oil" covers olive oil/vegetable oil/canola oil; "sugar" covers white/brown/caster/icing sugar; \
"flour" covers plain/all-purpose flour; "butter" covers unsalted/salted butter; etc.
- Minor quantities of specialty herbs/spices that most people have (salt, pepper, garlic, onion) \
should be counted as covered even if not explicitly in the pantry
- A recipe is a pantry match (true) if ≥ 60% of its non-trivial ingredients are covered

Return ONLY a valid JSON object mapping each recipe ID to a boolean — no markdown, no code fences:
{"recipeId1": true, "recipeId2": false}`

const PANTRY_SCORE_SYSTEM = `\
You are a culinary expert. Given a list of available ingredients, score each recipe by what \
percentage of its ingredients are covered by what's available.

Scoring rules:
- Score = percentage of the recipe's non-trivial ingredients that are covered (integer 0–100).
- The following basics are ALWAYS assumed to be available regardless of what the user listed: \
salt, water, oil (any type — olive oil, vegetable oil, etc.), pepper (any type — black, white, etc.). \
Never count these against the match score; treat them as already covered.
- "Non-trivial" means also exclude generic seasonings that virtually everyone has.
- Be smart about synonyms: "pasta" covers spaghetti/penne/fusilli/rigatoni; \
"oil" covers olive oil/vegetable oil/canola oil; "sugar" covers white/brown/caster/icing sugar; \
"flour" covers plain/all-purpose flour; "butter" covers salted/unsalted; \
"milk" covers whole/semi/skimmed; "stock" covers broth; "chicken" covers chicken breast/thigh; etc.
- Partial coverage counts: "chicken breast" in pantry covers a recipe calling for "diced chicken".
- Round to the nearest integer.

Return ONLY a valid JSON object mapping each recipe ID to its integer score (0–100) — no markdown, no code fences:
{"recipeId1": 85, "recipeId2": 42, "recipeId3": 100}`

// ── Exported types ────────────────────────────────────────

export interface TranslateResult {
  title: string
  ingredients: string[]
  instructions: string[]
}

export interface SubstituteItem {
  original: string
  substitutes: string[]
}

export interface SubstitutesResult {
  substitutes: SubstituteItem[]
  note?: string
}

export interface ParsedRecipeResult {
  title: string
  ingredients: string[]
  instructions: string[]
  servings?: number | null
  prepTime?: string | null
  cookTime?: string | null
  imageUrl?: string | null
}

// ── Server Actions ────────────────────────────────────────

export async function translateRecipe(
  recipe: Recipe,
): Promise<{ result?: TranslateResult; error?: string }> {
  try {
    const key = await getRateLimitKey()
    if (checkRateLimit(key, 8)) return { error: 'Too many requests — please wait a moment and try again.' }

    const prompt =
      `Translate this recipe into English.\n\n` +
      `Title: ${recipe.title}\n\n` +
      `Ingredients:\n${recipe.ingredients.join('\n')}\n\n` +
      `Instructions:\n${recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`

    const { text } = await generateText({
      model: getModel(),
      system: TRANSLATE_SYSTEM,
      prompt,
    })

    return { result: parseJson<TranslateResult>(text) }
  } catch (err) {
    console.error('[translateRecipe] error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('XAI_API_KEY')) return { error: msg }
    return {
      error: 'Translation failed — please check your XAI_API_KEY in Vercel settings or try again later.',
    }
  }
}

export async function suggestSubstitutes(
  recipe: Recipe,
): Promise<{ result?: SubstitutesResult; error?: string }> {
  try {
    const key = await getRateLimitKey()
    if (checkRateLimit(key, 8)) return { error: 'Too many requests — please wait a moment and try again.' }

    const prompt =
      `Recipe: "${recipe.title}"\n\n` +
      `Ingredients:\n${recipe.ingredients.join('\n')}\n\n` +
      `Please suggest easy supermarket substitutes for any uncommon or hard-to-find ingredients.`

    const { text } = await generateText({
      model: getModel(),
      system: SUBSTITUTES_SYSTEM,
      prompt,
    })

    return { result: parseJson<SubstitutesResult>(text) }
  } catch (err) {
    console.error('[suggestSubstitutes] error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('XAI_API_KEY')) return { error: msg }
    return {
      error: 'Could not generate substitutes — please check your XAI_API_KEY in Vercel settings or try again later.',
    }
  }
}

/** Extract structured recipe fields from raw pasted text using Grok. */
export async function parseRecipeText(
  text: string,
): Promise<{ result?: ParsedRecipeResult; error?: string }> {
  try {
    const key = await getRateLimitKey()
    if (checkRateLimit(key, 8)) return { error: 'Too many requests — please wait a moment and try again.' }

    const { text: raw } = await generateText({
      model: getModel(),
      system: PARSE_RECIPE_SYSTEM,
      prompt: `Extract the recipe from this text:\n\n${text.slice(0, 8000)}`,
    })

    return { result: parseJson<ParsedRecipeResult>(raw) }
  } catch (err) {
    console.error('[parseRecipeText] error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('XAI_API_KEY')) return { error: msg }
    return {
      error: 'Could not parse the recipe — please fill in the fields manually.',
    }
  }
}

/**
 * Batch-check which recipes are "pantry friendly" given a list of staple ingredients.
 * Uses Grok for synonym-aware matching (pasta ↔ spaghetti, oil ↔ olive oil, etc.)
 * Returns a map of { recipeId: boolean }.
 */
export async function checkPantryMatchBatch(
  recipes: Array<{ id: string; ingredients: string[] }>,
  pantry: string[],
): Promise<{ result?: Record<string, boolean>; error?: string }> {
  if (recipes.length === 0 || pantry.length === 0) {
    return { result: Object.fromEntries(recipes.map(r => [r.id, false])) }
  }

  try {
    const key = await getRateLimitKey()
    if (checkRateLimit(key, 8)) return { error: 'Too many requests — please wait a moment and try again.' }

    const recipeList = recipes
      .map(r => `- ${r.id} | ${r.ingredients.slice(0, 20).join(', ')}`)
      .join('\n')

    const prompt =
      `Pantry staples: ${pantry.join(', ')}\n\n` +
      `Recipes (format: "- id | ingredients"):\n${recipeList}`

    const { text } = await generateText({
      model: getModel(),
      system: PANTRY_MATCH_SYSTEM,
      prompt,
    })

    return { result: parseJson<Record<string, boolean>>(text) }
  } catch (err) {
    console.error('[checkPantryMatchBatch] error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('XAI_API_KEY')) return { error: msg }
    return { error: 'Pantry check failed — please try again later.' }
  }
}

/**
 * Score each recipe 0–100 based on how many of its ingredients the user
 * currently has. Used by the "What I Have" pantry matching page.
 * Returns a map of { recipeId: score } where score is an integer 0–100.
 */
export async function scoreRecipesByPantry(
  recipes: Array<{ id: string; ingredients: string[] }>,
  pantry: string[],
): Promise<{ result?: Record<string, number>; error?: string }> {
  if (recipes.length === 0 || pantry.length === 0) {
    return { result: Object.fromEntries(recipes.map(r => [r.id, 0])) }
  }

  try {
    const key = await getRateLimitKey()
    if (checkRateLimit(key, 8)) return { error: 'Too many requests — please wait a moment and try again.' }

    const recipeList = recipes
      .map(r => `- ${r.id} | ${r.ingredients.slice(0, 20).join(', ')}`)
      .join('\n')

    const prompt =
      `Available ingredients: ${pantry.join(', ')}\n\n` +
      `Recipes (format: "- id | ingredients"):\n${recipeList}`

    const { text } = await generateText({
      model: getModel(),
      system: PANTRY_SCORE_SYSTEM,
      prompt,
    })

    const raw = parseJson<Record<string, number>>(text)
    // Clamp all values to 0–100 integers in case the model drifts
    const result = Object.fromEntries(
      Object.entries(raw).map(([id, score]) => [
        id,
        Math.max(0, Math.min(100, Math.round(Number(score) || 0))),
      ])
    )
    return { result }
  } catch (err) {
    console.error('[scoreRecipesByPantry] error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('XAI_API_KEY')) return { error: msg }
    return { error: 'Pantry scoring failed — please try again later.' }
  }
}
