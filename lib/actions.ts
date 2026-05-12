'use server'

import { Recipe } from './types'

// ── Image → base64 ────────────────────────────────────────

/** A warm-gray placeholder SVG (utensils) returned when image fetch fails */
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

async function fetchImageAsBase64(imageUrl: string, pageUrl: string): Promise<string> {
  try {
    const resolved = imageUrl.startsWith('http')
      ? imageUrl
      : new URL(imageUrl, pageUrl).href

    const res = await fetch(resolved, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)' },
      signal: AbortSignal.timeout(6_000),
    })
    if (!res.ok) return PLACEHOLDER_IMAGE

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return PLACEHOLDER_IMAGE

    // Skip images > 600 KB to stay within localStorage limits
    const size = parseInt(res.headers.get('content-length') ?? '0')
    if (size > 600_000) return PLACEHOLDER_IMAGE

    const buf = await res.arrayBuffer()
    if (buf.byteLength > 600_000) return PLACEHOLDER_IMAGE

    return `data:${contentType.split(';')[0]};base64,${Buffer.from(buf).toString('base64')}`
  } catch {
    return PLACEHOLDER_IMAGE
  }
}

// ── Helpers ────────────────────────────────────────────────

/** Convert ISO-8601 duration (PT1H30M, P0DT1H30M, etc.) → "1 hr 30 min" */
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

/** Strip HTML tags from a string */
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

      // Normalise: handle @graph arrays or bare objects
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

        // Ingredients
        const ingredients = (item.recipeIngredient as string[] | undefined) ?? []

        // Instructions
        let instructions: string[] = []
        const raw_inst = item.recipeInstructions
        if (Array.isArray(raw_inst)) {
          instructions = raw_inst
            .map((s: unknown) => {
              if (typeof s === 'string') return stripTags(s)
              const obj = s as Record<string, unknown>
              // HowToSection → itemListElement
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

        // Servings
        const yieldRaw = item.recipeYield
        const yieldStr = Array.isArray(yieldRaw)
          ? String(yieldRaw[0])
          : String(yieldRaw ?? '')
        const servings = parseInt(yieldStr) || undefined

        // Image
        const imgRaw = item.image
        const image =
          typeof imgRaw === 'string'
            ? imgRaw
            : Array.isArray(imgRaw)
            ? (imgRaw[0] as Record<string, string>)?.url ?? imgRaw[0]
            : (imgRaw as Record<string, string> | undefined)?.url

        return {
          id: crypto.randomUUID(),
          title: String(item.name || 'Untitled Recipe'),
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
  // Title: og:title > h1 > <title>
  const title =
    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    'Imported Recipe'

  // Image: og:image first
  const image =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]

  // Ingredients: look for li/span elements whose class mentions "ingredient"
  const ingMatches = html.match(
    /class="[^"]*ingredient[^"]*"[^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/gi,
  ) ?? []
  const ingredients = ingMatches
    .map((m) => stripTags(m))
    .filter((s) => s.length > 1 && s.length < 200)
    .slice(0, 40)

  // Steps: look for li/p whose class mentions step|instruction|direction
  const stepMatches = html.match(
    /class="[^"]*(?:step|instruction|direction)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|p|div)>/gi,
  ) ?? []
  const instructions = stepMatches
    .map((m) => stripTags(m))
    .filter((s) => s.length > 10 && s.length < 2000)
    .slice(0, 30)

  return {
    id: crypto.randomUUID(),
    title: stripTags(title).split('|')[0].split('–')[0].trim(),
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
      if (res.status === 403) {
        return {
          error:
            'This website blocks automatic import. Try a different recipe URL or paste the ingredients and instructions manually.',
        }
      }
      return { error: `The page returned an error (HTTP ${res.status}). Try another URL.` }
    }

    const html = await res.text()

    const recipe = extractJsonLd(html) ?? extractHtmlFallback(html)
    recipe.sourceUrl = url

    // Convert hero image to base64 so it never breaks in localStorage
    recipe.image = recipe.image
      ? await fetchImageAsBase64(recipe.image, url)
      : PLACEHOLDER_IMAGE

    return { recipe }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { error: `Could not fetch the page: ${msg}` }
  }
}
