'use server'

import { Recipe } from './types'
import { supabaseAdmin } from './supabase-admin'

// ── Placeholder SVG ───────────────────────────────────────
// Shown in-memory when image fetch/upload fails. Never stored in the DB.

const PLACEHOLDER_IMAGE = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <rect width="800" height="450" fill="#E8E5DF"/>
    <g transform="translate(400,225)" fill="none" stroke="#B0A89E" stroke-width="4"
       stroke-linecap="round" stroke-linejoin="round">
      <line x1="-28" y1="-70" x2="-28" y2="70"/>
      <line x1="-40" y1="-70" x2="-40" y2="-20"/>
      <line x1="-16" y1="-70" x2="-16" y2="-20"/>
      <path d="M-40,-20 Q-28,-6 -16,-20"/>
      <line x1="28" y1="-70" x2="28" y2="70"/>
      <path d="M28,-70 Q50,-44 28,4"/>
    </g>
  </svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
})()

// ── Image → Supabase Storage ──────────────────────────────

/**
 * Downloads an image from a URL and uploads it to the `recipe-images`
 * Supabase Storage bucket. Returns the public URL on success, or
 * undefined on failure (caller falls back to PLACEHOLDER_IMAGE).
 */
async function uploadImageToStorage(
  imageUrl: string,
  pageUrl: string,
  recipeId: string,
): Promise<string | undefined> {
  try {
    const resolved = imageUrl.startsWith('http')
      ? imageUrl
      : new URL(imageUrl, pageUrl).href

    const res = await fetch(resolved, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)' },
      signal: AbortSignal.timeout(6_000),
    })
    if (!res.ok) return undefined

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return undefined

    const size = parseInt(res.headers.get('content-length') ?? '0')
    if (size > 600_000) return undefined

    const buf = await res.arrayBuffer()
    if (buf.byteLength > 600_000) return undefined

    const mimeType = contentType.split(';')[0]
    const ext      = mimeType.split('/')[1] ?? 'jpg'
    const fileName = `${recipeId}.${ext}`

    const { error } = await supabaseAdmin.storage
      .from('recipe-images')
      .upload(fileName, buf, { contentType: mimeType, upsert: true })

    if (error) return undefined

    const { data } = supabaseAdmin.storage
      .from('recipe-images')
      .getPublicUrl(fileName)

    return data.publicUrl
  } catch {
    return undefined
  }
}

// ── Fetch image for manual paste form ────────────────────

/**
 * Called from the manual paste form after Grok extracts an image URL.
 * Uploads the image to Supabase Storage and returns the public URL.
 */
export async function fetchRecipeImage(
  imageUrl: string,
  recipeId: string,
): Promise<{ url?: string }> {
  const url = await uploadImageToStorage(imageUrl, imageUrl, recipeId)
  return { url }
}

// ── Lazy migration: base64 → Storage ─────────────────────

/**
 * Called by RecipeView when an old recipe (image_base64 only) is opened.
 * Uploads the stored base64 blob to Storage, writes image_url, clears
 * image_base64 to free up DB space. Fire-and-forget safe.
 */
export async function migrateRecipeImage(
  recipeId: string,
): Promise<{ url?: string }> {
  try {
    const { data } = await supabaseAdmin
      .from('recipes')
      .select('image_base64')
      .eq('id', recipeId)
      .maybeSingle()

    if (!data?.image_base64) return {}

    const base64     = data.image_base64 as string
    const contentType = base64.match(/^data:(image\/[^;]+);/)?.[1] ?? 'image/jpeg'
    const raw        = base64.replace(/^data:image\/[^;]+;base64,/, '')
    const buffer     = Buffer.from(raw, 'base64')
    const ext        = contentType.split('/')[1] ?? 'jpg'
    const fileName   = `${recipeId}.${ext}`

    const { error } = await supabaseAdmin.storage
      .from('recipe-images')
      .upload(fileName, buffer, { contentType, upsert: true })

    if (error) return {}

    const { data: urlData } = supabaseAdmin.storage
      .from('recipe-images')
      .getPublicUrl(fileName)

    const url = urlData.publicUrl

    // Persist URL, clear the base64 blob
    await supabaseAdmin
      .from('recipes')
      .update({ image_url: url, image_base64: null })
      .eq('id', recipeId)

    return { url }
  } catch {
    return {}
  }
}

// ── Helpers ────────────────────────────────────────────────

function parseDuration(d: string): string {
  if (!d) return ''
  const m = d.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/)
  if (!m || (!m[1] && !m[2] && !m[3])) return d
  const h = parseInt(m[1] || '0') * 24 + parseInt(m[2] || '0')
  const min = parseInt(m[3] || '0')
  if (h && min) return `${h} hr ${min} min`
  if (h) return `${h} hr`
  if (min) return `${min} min`
  return d
}

function cleanRecipeTitle(raw: string): string {
  return raw
    .replace(/^\{[^}]+\}\s*/g, '')
    .replace(/\s*\{[^}]+\}$/g, '')
    .replace(/^\(\d+[^)]*\)\s*/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .split('|')[0].split('–')[0].trim()
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

// ── JSON-LD Extraction ─────────────────────────────────────

function extractJsonLd(html: string): Recipe | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim())

      const candidates: unknown[] = Array.isArray(data['@graph'])
        ? data['@graph']
        : Array.isArray(data)
        ? data
        : [data]

      for (const raw of candidates) {
        const item = raw as Record<string, unknown>
        const type = item['@type']
        const isRecipe =
          type === 'Recipe' ||
          (Array.isArray(type) && type.includes('Recipe'))

        if (!isRecipe) continue

        const ingredients = (item.recipeIngredient as string[] | undefined) ?? []

        let instructions: string[] = []
        const raw_inst = item.recipeInstructions
        if (Array.isArray(raw_inst)) {
          instructions = raw_inst
            .map((s: unknown) => {
              if (typeof s === 'string') return stripTags(s)
              const obj = s as Record<string, unknown>
              if (Array.isArray(obj.itemListElement)) {
                return (obj.itemListElement as Record<string, unknown>[])
                  .map((step) => stripTags(String(step.text || step.name || '')))
                  .join(' ')
              }
              return stripTags(String(obj.text || obj.name || ''))
            })
            .filter(Boolean)
        } else if (typeof raw_inst === 'string') {
          instructions = [stripTags(raw_inst)]
        }

        const yieldRaw = item.recipeYield
        const yieldStr = Array.isArray(yieldRaw)
          ? String(yieldRaw[0])
          : String(yieldRaw ?? '')
        const servings = parseInt(yieldStr) || undefined

        const imgRaw = item.image
        const image =
          typeof imgRaw === 'string'
            ? imgRaw
            : Array.isArray(imgRaw)
            ? (imgRaw[0] as Record<string, string>)?.url ?? imgRaw[0]
            : (imgRaw as Record<string, string> | undefined)?.url

        return {
          id: crypto.randomUUID(),
          title: cleanRecipeTitle(String(item.name || 'Untitled Recipe')),
          image: typeof image === 'string' ? image : undefined,
          prepTime: parseDuration(String(item.prepTime || '')),
          cookTime: parseDuration(String(item.cookTime || '')),
          servings,
          ingredients,
          instructions,
        }
      }
    } catch {
      // malformed JSON-LD → try next script tag
    }
  }

  return null
}

// ── HTML Fallback ──────────────────────────────────────────

function extractHtmlFallback(html: string): Recipe {
  const title =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    'Imported Recipe'

  const image =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]

  const ingMatches = html.match(
    /class="[^"]*ingredient[^"]*"[^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/gi,
  ) ?? []
  const ingredients = ingMatches
    .map((m) => stripTags(m))
    .filter((s) => s.length > 1 && s.length < 200)
    .slice(0, 40)

  const stepMatches = html.match(
    /class="[^"]*(?:step|instruction|direction)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|p|div)>/gi,
  ) ?? []
  const instructions = stepMatches
    .map((m) => stripTags(m))
    .filter((s) => s.length > 10 && s.length < 2000)
    .slice(0, 30)

  return {
    id: crypto.randomUUID(),
    title: cleanRecipeTitle(stripTags(title)),
    image,
    ingredients: ingredients.length
      ? ingredients
      : ['Could not parse ingredients — visit the original URL for the full recipe.'],
    instructions: instructions.length
      ? instructions
      : ['Could not parse instructions — visit the original URL for the full recipe.'],
  }
}

// ── Public Server Action ───────────────────────────────────

export async function importRecipe(
  url: string,
): Promise<{ recipe?: Recipe; error?: string }> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { error: 'Please enter a valid URL starting with http:// or https://' }
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      if (res.status === 402 || res.status === 403) {
        return {
          error: `This website blocks automatic import (HTTP ${res.status}). No worries — you can paste the recipe manually below.`,
        }
      }
      return { error: `The page returned an error (HTTP ${res.status}). Try another URL.` }
    }

    const html   = await res.text()
    const recipe = extractJsonLd(html) ?? extractHtmlFallback(html)
    recipe.sourceUrl = url

    // Upload image to Supabase Storage; fall back to in-memory placeholder
    recipe.image = recipe.image
      ? (await uploadImageToStorage(recipe.image, url, recipe.id)) ?? PLACEHOLDER_IMAGE
      : PLACEHOLDER_IMAGE

    return { recipe }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { error: `Could not fetch the page: ${msg}` }
  }
}
