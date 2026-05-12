'use server'

import { generateText } from 'ai'
import { createXai } from '@ai-sdk/xai'
import type { Recipe } from './types'

// ─────────────────────────────────────────────────────────────
// Required environment variable: XAI_API_KEY
//   • Local dev:  add  XAI_API_KEY=xai-...  to .env.local
//   • Vercel:     Settings → Environment Variables → XAI_API_KEY
//
// Use XAI_API_KEY (NOT NEXT_PUBLIC_XAI_API_KEY).
// This file runs server-side only — the key never reaches the browser.
// Get your key at: https://console.x.ai
// ─────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────

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

// ── Server Actions ────────────────────────────────────────

export async function translateRecipe(
  recipe: Recipe,
): Promise<{ result?: TranslateResult; error?: string }> {
  try {
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
      error:
        'Translation failed — please check your XAI_API_KEY in Vercel settings or try again later.',
    }
  }
}

export async function suggestSubstitutes(
  recipe: Recipe,
): Promise<{ result?: SubstitutesResult; error?: string }> {
  try {
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
      error:
        'Could not generate substitutes — please check your XAI_API_KEY in Vercel settings or try again later.',
    }
  }
}
