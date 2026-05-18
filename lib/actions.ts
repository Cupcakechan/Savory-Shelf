'use server'

import { Recipe } from './types'
import { supabaseAdmin } from './supabase-admin'
import { getRateLimitKey, checkRateLimit } from './rate-limit'
import { RATE_POLICY } from './rate-limit-policy'
import { secLog } from './sec-log'
import { createSupabaseServerClient } from './supabase-server'
import { verifyOrigin } from './verify-origin'
import { parseRecipeText } from './ai'
import { promises as dns } from 'dns'

// ── SSRF guard ────────────────────────────────────────────

/**
 * Returns true only for safe, publicly-routable HTTPS URLs.
 * Blocks http://, private IPv4 ranges, localhost, and IPv6 private ranges.
 */
function isSafeUrl(raw: string): boolean {
  let url: URL
  try { url = new URL(raw) } catch { return false }
  if (url.protocol !== 'https:') return false

  const h = url.hostname.toLowerCase()

  if (h === 'localhost' || h === '0.0.0.0') return false

  // Private / reserved IPv4
  if (
    /^127\./.test(h) ||                                    // loopback
    /^10\./.test(h) ||                                     // RFC 1918
    /^192\.168\./.test(h) ||                              // RFC 1918
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) ||           // RFC 1918
    /^169\.254\./.test(h) ||                              // link-local
    /^0\./.test(h) ||                                      // "this" network
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || // CGNAT 100.64/10
    /^(22[4-9]|23\d)\./.test(h) ||                       // multicast 224/4
    /^192\.0\.2\./.test(h) ||                            // TEST-NET-1 (docs)
    /^198\.51\.100\./.test(h) ||                         // TEST-NET-2 (docs)
    /^203\.0\.113\./.test(h) ||                          // TEST-NET-3 (docs)
    /^198\.1[89]\./.test(h) ||                            // benchmark 198.18/15
    h === '255.255.255.255'                                 // broadcast
  ) return false

  // IPv6 loopback / unique-local / link-local / multicast / documentation
  if (
    h === '::1'              ||   // loopback
    h === '::'               ||   // unspecified
    /^\[?fc/i.test(h)        ||   // unique-local fc00::/7
    /^\[?fd/i.test(h)        ||   // unique-local fd00::/8
    /^\[?fe[89ab]/i.test(h)  ||   // link-local fe80::/10
    /^\[?ff/i.test(h)        ||   // multicast ff00::/8
    /^\[?2001:db8:/i.test(h)      // documentation 2001:db8::/32
  ) return false

  return true
}

/**
 * Resolves a hostname to its A/AAAA records and checks every resolved IP
 * against the same private-range rules as isSafeUrl. Prevents DNS-rebinding
 * attacks where a hostname passes the string check but resolves to an
 * internal address.
 *
 * Returns false (unsafe) if the hostname cannot be resolved or any
 * resolved IP is in a private/reserved range.
 */
async function isDnsResolutionSafe(hostname: string): Promise<boolean> {
  const ips: string[] = []
  try { ips.push(...await dns.resolve4(hostname)) } catch (_) {}
  try { ips.push(...await dns.resolve6(hostname)) } catch (_) {}

  if (ips.length === 0) {
    secLog('warn', { event: 'ssrf_dns_unresolvable', hostname })
    return false
  }

  for (const ip of ips) {
    // Wrap IPv6 in brackets for URL-constructor compatibility
    const candidate = ip.includes(':') ? `https://[${ip}]/` : `https://${ip}/`
    if (!isSafeUrl(candidate)) {
      secLog('warn', { event: 'ssrf_dns_blocked', hostname, resolved_to: ip })
      return false
    }
  }
  return true
}


async function safeFetch(
  url: string,
  options: Omit<RequestInit, 'redirect'>,
  maxRedirects = 3,
  timeoutMs = 10_000,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs)
  let current = url

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafeUrl(current)) {
      secLog('warn', { event: 'ssrf_blocked', url: (() => { try { return new URL(current).hostname } catch { return current } })() })
      throw new Error(`Blocked unsafe URL: ${new URL(current).hostname}`)
    }

    // DNS resolution check — validates the actual IP targets, not just the
    // hostname string. Catches DNS-rebinding / crafted-domain attacks.
    const hostname = new URL(current).hostname
    if (!(await isDnsResolutionSafe(hostname))) {
      throw new Error(`DNS resolution blocked for: ${hostname}`)
    }
    const res = await fetch(current, { ...options, redirect: 'manual', signal })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('Redirect with no Location header')
      current = new URL(loc, current).href   // resolve relative redirects
    } else {
      return res
    }
  }
  throw new Error('Too many redirects')
}

// ── MIME allowlist ────────────────────────────────────────

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
])

// ── Max sizes ─────────────────────────────────────────────

const MAX_HTML_BYTES  = 5_000_000  // 5 MB — sane cap for recipe pages
const MAX_IMAGE_BYTES =   600_000  // 600 KB — unchanged from before

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

    // safeFetch validates the URL (SSRF) and follows up to 3 redirects
    const res = await safeFetch(
      resolved,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)' } },
      3,
      6_000,
    )
    if (!res.ok) return undefined

    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) return undefined

    const size = parseInt(res.headers.get('content-length') ?? '0')
    if (size > MAX_IMAGE_BYTES) return undefined

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_IMAGE_BYTES) return undefined

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
  if (!await verifyOrigin()) return {}

  // Auth check — service-role operations must only run for authenticated users
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return {}

  // Ownership check — verify the recipe belongs to the caller before any
  // privileged storage operation
  const { data: owned } = await serverClient
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!owned) return {}

  const key = await getRateLimitKey(user.id)
  const fp = RATE_POLICY.IMAGE_FETCH
  if (await checkRateLimit(key, fp.max, fp.windowMs, fp.strict)) return {}   // silent fail — image is optional
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
  if (!await verifyOrigin()) return {}

  // Auth check — must be an authenticated user
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return {}

  // Ownership check — verify before reading base64 blob or writing to storage
  const { data: owned } = await serverClient
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!owned) return {}

  // Rate-limit migrations under the same IMAGE_FETCH policy as fetchRecipeImage.
  // Each recipe migrates at most once (image_base64 is cleared on success), but
  // a logged-in user with many legacy recipes could still burst service-role
  // storage writes. Silent return keeps the fire-and-forget UI flow clean —
  // the recipe will continue to display via its image_base64 fallback and
  // retry on the next visit.
  const key = await getRateLimitKey(user.id)
  const fp  = RATE_POLICY.IMAGE_FETCH
  if (await checkRateLimit(key, fp.max, fp.windowMs, fp.strict)) return {}

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
    // Decode entities FIRST so encoded markup like &lt;div&gt; becomes a
    // real tag that the next pass can strip rather than surviving as text.
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Convert a full HTML page into clean plain text suitable for AI parsing.
// Used by reparseRecipeWithAi as the input to parseRecipeText. Preserves
// line breaks at block-level boundaries so Grok can see ingredient and
// instruction rows as distinct lines rather than one flattened blob.
function htmlToPlainText(html: string): string {
  let text = html
    // Drop noise blocks entirely — scripts, styles, comments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  // Convert block-closing tags to newlines so recipe rows stay on their
  // own lines after stripping (ingredient <li> per line, step <p> per line).
  text = text
    .replace(/<\/(?:p|div|li|h[1-6]|tr|article|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  // Decode the common entities (mirror stripTags + numeric refs).
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCharCode(parseInt(code, 10)) } catch { return ' ' }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try { return String.fromCharCode(parseInt(code, 16)) } catch { return ' ' }
    })

  // Normalise whitespace — collapse runs of spaces/tabs, then runs of
  // blank lines, trimming the outer edges.
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── JSON-LD Extraction ─────────────────────────────────────

// Walk an arbitrary JSON-LD value looking for the first object whose
// `@type` is (or includes) 'Recipe'. Handles the three shapes publishers
// commonly emit:
//   • top-level Recipe object
//   • top-level @graph array containing Recipe
//   • Recipe nested inside another node (e.g. Yoast's WebPage → mainEntity,
//     which is how Love and Lemons and many WordPress sites emit it)
function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item)
      if (found) return found
    }
    return null
  }
  const obj = node as Record<string, unknown>
  const type = obj['@type']
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
    return obj
  }
  for (const value of Object.values(obj)) {
    const found = findRecipeNode(value)
    if (found) return found
  }
  return null
}

function extractJsonLd(html: string): Recipe | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim())

      const item = findRecipeNode(data)
      if (!item) continue

      // stripTags handles publishers that inline affiliate <a> tags inside
      // ingredient strings (Love and Lemons does this for Target/Amazon links).
      const ingredients = ((item.recipeIngredient as unknown[] | undefined) ?? [])
        .map((s) => (typeof s === 'string' ? stripTags(s) : ''))
        .filter(Boolean)

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
    // Anchored to <tagname so the full opening tag is in the match and
    // stripTags can remove it. Without the anchor, class="..." text
    // starts the match and survives stripTags because it has no leading <.
    /<(?:li|span|p|div)[^>]*class="[^"]*ingredient[^"]*"[^>]*>([\s\S]*?)<\/(?:li|span|p|div)>/gi,
  ) ?? []
  const ingredients = ingMatches
    .map((m) => stripTags(m))
    .filter((s) => s.length > 1 && s.length < 200)
    .slice(0, 40)

  const stepMatches = html.match(
    /<(?:li|p|div|span)[^>]*class="[^"]*(?:step|instruction|direction)[^"]*"[^>]*>([\s\S]*?)<\/(?:li|p|div|span)>/gi,
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
  // Auto-upgrade http → https for convenience, then validate
  const target = url.trim().startsWith('http://')
    ? 'https://' + url.trim().slice(7)
    : url.trim()

  if (!isSafeUrl(target)) {
    secLog('warn', { event: 'invalid_import_url', url: target })
    return { error: 'Please enter a valid https:// recipe URL from a public website.' }
  }

  if (!await verifyOrigin()) {
    return { error: 'Request origin not allowed.' }
  }

  // Auth check — determines rate-limit tier and storage eligibility.
  // Unauthenticated users may still import (URL fetch + parse) but we skip
  // the service-role storage upload so anonymous callers cannot drive
  // bandwidth/storage costs via the admin client.
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  const isAuthenticated = !!user

  // Strict fail-closed rate limit — importRecipe triggers external fetches
  // and (for authenticated users) Supabase Storage writes, so it must not
  // fail open when the rate-limit backend is unavailable.
  // Anonymous callers get a tighter cap (5/min vs 10/min).
  const key = await getRateLimitKey(user?.id)
  const policy = isAuthenticated ? RATE_POLICY.IMPORT_AUTHENTICATED : RATE_POLICY.IMPORT_ANONYMOUS
  if (await checkRateLimit(key, policy.max, policy.windowMs, policy.strict)) {
    return { error: 'Too many import requests — please wait a minute and try again.' }
  }

  try {
    const res = await safeFetch(
      target,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'max-age=0',
          'Upgrade-Insecure-Requests': '1',
        },
        cache: 'no-store',
      },
      3,
      10_000,
    )

    if (!res.ok) {
      if (res.status === 402 || res.status === 403) {
        return {
          error: `This website blocks automatic import (HTTP ${res.status}). No worries — you can paste the recipe manually below.`,
        }
      }
      return { error: `The page returned an error (HTTP ${res.status}). Try another URL.` }
    }

    // Reject non-HTML responses (PDFs, images, APIs, etc.)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) {
      secLog('warn', { event: 'import_non_html', url: target, content_type: ct })
      return { error: 'That URL doesn\'t appear to be a recipe page. Try another URL.' }
    }

    // Guard against oversized pages before reading the body
    const cl = parseInt(res.headers.get('content-length') ?? '0')
    if (cl > MAX_HTML_BYTES) {
      secLog('warn', { event: 'import_oversized_header', url: target, bytes: cl })
      return { error: 'That page is too large to import. Try another URL.' }
    }

    const html = await res.text()
    if (html.length > MAX_HTML_BYTES) {
      secLog('warn', { event: 'import_oversized_body', url: target, bytes: html.length })
      return { error: 'That page is too large to import. Try another URL.' }
    }

    const recipe = extractJsonLd(html) ?? extractHtmlFallback(html)
    recipe.sourceUrl = target

    // Upload image to Supabase Storage (authenticated users only).
    // Anonymous callers skip the service-role upload — they still see the
    // placeholder in the preview, and the image is stored when they save.
    recipe.image = (isAuthenticated && recipe.image)
      ? (await uploadImageToStorage(recipe.image, target, recipe.id)) ?? PLACEHOLDER_IMAGE
      : PLACEHOLDER_IMAGE

    return { recipe }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Blocked unsafe URL')) {
      return { error: 'That URL points to a restricted address and cannot be imported.' }
    }
    if (msg.includes('Too many redirects')) {
      secLog('warn', { event: 'import_too_many_redirects', url: target })
      return { error: 'That URL redirects too many times. Try the final destination URL directly.' }
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      secLog('warn', { event: 'import_timeout', url: target })
      return { error: 'The page took too long to respond. Please try again.' }
    }
    // Generic fallback — preserve the full raw error in the security log so we
    // can debug, but return a coarse, user-friendly message so we don't leak
    // network/DNS/fetch-internal detail that could aid targeted probing.
    secLog('warn', { event: 'import_generic_error', url: target, error: msg })
    return { error: 'Could not fetch the page. Please try again or check the URL.' }
  }
}

// ── AI Re-parse Server Action ─────────────────────────────
//
// User-triggered escape hatch when importRecipe produces a bad result on
// a site whose JSON-LD or HTML structure our deterministic extractors
// can't handle cleanly. Visible as a "Re-parse with AI" banner on the
// fresh-import preview in RecipeView.
//
// Protection layers (defense in depth — all must pass):
//   1. isSafeUrl  — same SSRF/scheme guard as importRecipe
//   2. verifyOrigin — CSRF guard (log-only mode for now per existing policy)
//   3. IMPORT-tier rate limit (strict / fail-closed) — caps the URL fetch.
//      Anonymous callers get the tighter ANONYMOUS bucket.
//   4. safeFetch — DNS resolution check, redirect limit, 10s timeout,
//      MIME + size enforcement, MAX_HTML_BYTES cap.
//   5. AI-tier rate limit (inside parseRecipeText → aiPreflight) — caps the
//      Grok call independently of the import bucket. One re-parse costs the
//      user one slot in BOTH buckets.
//   6. prioritiseRecipeContent (inside parseRecipeText) — caps text sent
//      to Grok at 8000 chars, so HTML page size cannot drive token cost.
//
// Net effect: a re-parse costs at most one URL fetch + one Grok call per
// allowed slot; abuse beyond that hits the strict rate-limit ceiling.
export async function reparseRecipeWithAi(
  url: string,
): Promise<{ recipe?: Recipe; error?: string }> {
  const target = url.trim().startsWith('http://')
    ? 'https://' + url.trim().slice(7)
    : url.trim()

  if (!isSafeUrl(target)) {
    secLog('warn', { event: 'invalid_reparse_url', url: target })
    return { error: 'Invalid URL.' }
  }

  if (!await verifyOrigin()) {
    return { error: 'Request origin not allowed.' }
  }

  // Determines rate-limit tier. parseRecipeText is anonymous-callable so
  // we mirror that here — but anonymous callers get tighter IMPORT bucket.
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  const isAuthenticated = !!user

  // First gate: IMPORT bucket (covers the URL fetch cost).
  // parseRecipeText will independently gate the AI bucket downstream.
  const key = await getRateLimitKey(user?.id)
  const policy = isAuthenticated ? RATE_POLICY.IMPORT_AUTHENTICATED : RATE_POLICY.IMPORT_ANONYMOUS
  if (await checkRateLimit(key, policy.max, policy.windowMs, policy.strict)) {
    return { error: 'Too many requests — please wait a minute and try again.' }
  }

  try {
    const res = await safeFetch(
      target,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'max-age=0',
          'Upgrade-Insecure-Requests': '1',
        },
        cache: 'no-store',
      },
      3,
      10_000,
    )

    if (!res.ok) {
      if (res.status === 402 || res.status === 403) {
        return { error: `This website blocks automatic fetches (HTTP ${res.status}).` }
      }
      return { error: `The page returned an error (HTTP ${res.status}).` }
    }

    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) {
      secLog('warn', { event: 'reparse_non_html', url: target, content_type: ct })
      return { error: 'That URL doesn\'t appear to be a recipe page.' }
    }

    const cl = parseInt(res.headers.get('content-length') ?? '0')
    if (cl > MAX_HTML_BYTES) {
      secLog('warn', { event: 'reparse_oversized_header', url: target, bytes: cl })
      return { error: 'That page is too large to re-parse.' }
    }

    const html = await res.text()
    if (html.length > MAX_HTML_BYTES) {
      secLog('warn', { event: 'reparse_oversized_body', url: target, bytes: html.length })
      return { error: 'That page is too large to re-parse.' }
    }

    // Hand cleaned text to the existing AI parser. parseRecipeText runs its
    // own origin / auth / AI-rate-limit checks via aiPreflight.
    const plain = htmlToPlainText(html)
    const ai = await parseRecipeText(plain)
    if (ai.error || !ai.result) {
      return { error: ai.error ?? 'AI parsing failed — please try again.' }
    }
    const parsed = ai.result

    const recipe: Recipe = {
      id: crypto.randomUUID(),
      title: cleanRecipeTitle(parsed.title || 'Imported Recipe'),
      ingredients: parsed.ingredients ?? [],
      instructions: parsed.instructions ?? [],
      servings: parsed.servings ?? undefined,
      prepTime: parsed.prepTime ?? undefined,
      cookTime: parsed.cookTime ?? undefined,
      image: undefined,
      sourceUrl: target,
    }

    // Image handling mirrors importRecipe: authenticated users get a
    // Supabase Storage upload of whatever URL Grok extracted (if any);
    // anonymous callers get the placeholder either way.
    const imgFromAi = parsed.imageUrl
    if (isAuthenticated && imgFromAi && typeof imgFromAi === 'string') {
      recipe.image = (await uploadImageToStorage(imgFromAi, target, recipe.id)) ?? PLACEHOLDER_IMAGE
    } else {
      recipe.image = PLACEHOLDER_IMAGE
    }

    return { recipe }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('Blocked unsafe URL')) {
      return { error: 'That URL points to a restricted address and cannot be fetched.' }
    }
    if (msg.includes('Too many redirects')) {
      secLog('warn', { event: 'reparse_too_many_redirects', url: target })
      return { error: 'That URL redirects too many times.' }
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      secLog('warn', { event: 'reparse_timeout', url: target })
      return { error: 'The page took too long to respond. Please try again.' }
    }
    // Generic fallback — full raw error stays in the security log; client
    // receives a coarse message. Same posture as importRecipe.
    secLog('warn', { event: 'reparse_generic_error', url: target, error: msg })
    return { error: 'Could not re-parse the page. Please try again.' }
  }
}
