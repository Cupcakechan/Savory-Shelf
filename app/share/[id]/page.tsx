import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ChefHat } from 'lucide-react'
import type { Metadata } from 'next'
import { fromDbRecipe, type DbRecipe } from '@/lib/supabase'
import type { Recipe } from '@/lib/types'
import RecipeView from '@/components/RecipeView'

// ── Data fetch (deduped across generateMetadata + page render) ─────────────
// React's cache() ensures both generateMetadata() and the page component
// hit Supabase only once per request, even though they each call getRecipe().

const getRecipe = cache(async (id: string): Promise<Recipe | null> => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data } = await supabase
    .from('recipes')
    .select(
      // Explicit allowlist — never expose user_id or other internal columns
      // on the public share route, even if new columns are added to the table.
      'id, title, image_url, image_base64, prep_time, cook_time, servings, ' +
      'ingredients, instructions, notes, source_url, created_at, tags, is_public'
    )
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()

  if (!data) return null
  return fromDbRecipe(data as unknown as DbRecipe)
})

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

function buildDescription(recipe: Recipe): string {
  // Prefer user notes — most distinctive, varies per recipe (good for SEO).
  if (recipe.notes?.trim()) return truncate(recipe.notes, 160)

  const timeBits = [
    recipe.prepTime && `${recipe.prepTime} prep`,
    recipe.cookTime && `${recipe.cookTime} cook`,
  ].filter(Boolean).join(' · ')

  const servingsLine = recipe.servings ? ` Serves ${recipe.servings}.` : ''

  if (timeBits) {
    return truncate(`${recipe.title} — ${timeBits}.${servingsLine}`, 160)
  }
  return truncate(
    `A clean, scalable recipe for ${recipe.title}.${servingsLine}`,
    160,
  )
}

/**
 * Parses our internal time strings ("1 hr 30 min", "45 minutes", "20 min")
 * into hours + minutes. Returns null when nothing parses, which signals
 * the caller to omit the corresponding ISO 8601 field from JSON-LD.
 *
 * Alternation orders longest-first so "minutes" matches before "min" and
 * "hours" before "hr"/"h". Trailing \b prevents false matches like "hot"
 * being read as "h".
 */
function parseTimeParts(t?: string): { h: number; m: number } | null {
  if (!t) return null
  const h = parseInt(t.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i)?.[1] || '0')
  const m = parseInt(t.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i)?.[1] || '0')
  if (!h && !m) return null
  return { h, m }
}

function toIso8601(time: { h: number; m: number } | null): string | undefined {
  if (!time) return undefined
  return `PT${time.h ? `${time.h}H` : ''}${time.m ? `${time.m}M` : ''}`
}

function buildJsonLd(recipe: Recipe, url: string | undefined, description: string) {
  // Only emit https image URLs — base64 data URLs aren't usable by
  // search engines or social previews.
  const image = recipe.image?.startsWith('https://') ? recipe.image : undefined
  const prep  = parseTimeParts(recipe.prepTime)
  const cook  = parseTimeParts(recipe.cookTime)
  const total = prep || cook
    ? { h: (prep?.h ?? 0) + (cook?.h ?? 0), m: (prep?.m ?? 0) + (cook?.m ?? 0) }
    : null

  return {
    '@context': 'https://schema.org',
    '@type':    'Recipe',
    name:       recipe.title,
    description,
    ...(image && { image: [image] }),
    ...(url   && { url }),
    author: {
      '@type': 'Organization',
      name:    'SavoryShelf by Cocolito Collective',
    },
    ...(recipe.savedAt   && { datePublished: recipe.savedAt }),
    ...(toIso8601(prep)  && { prepTime:  toIso8601(prep)  }),
    ...(toIso8601(cook)  && { cookTime:  toIso8601(cook)  }),
    ...(toIso8601(total) && { totalTime: toIso8601(total) }),
    ...(recipe.servings  && { recipeYield: String(recipe.servings) }),
    ...(recipe.tags?.length && { keywords: recipe.tags.join(', ') }),
    recipeIngredient: recipe.ingredients,
    recipeInstructions: recipe.instructions.map(text => ({
      '@type': 'HowToStep',
      text,
    })),
  }
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id }   = await params
  const recipe   = await getRecipe(id)

  if (!recipe) {
    return {
      title:  'Recipe not found · SavoryShelf',
      robots: { index: false, follow: false },
    }
  }

  const description = buildDescription(recipe)
  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const ogImage     = recipe.image?.startsWith('https://') ? recipe.image : undefined

  return {
    title: `${recipe.title} · SavoryShelf`,
    description,
    ...(siteUrl && { metadataBase: new URL(siteUrl) }),
    alternates: { canonical: `/share/${id}` },
    openGraph: {
      title:    recipe.title,
      description,
      url:      `/share/${id}`,
      siteName: 'SavoryShelf',
      type:     'article',
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
    twitter: {
      card:  ogImage ? 'summary_large_image' : 'summary',
      title: recipe.title,
      description,
      ...(ogImage && { images: [ogImage] }),
    },
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id }  = await params
  const recipe  = await getRecipe(id)

  if (!recipe) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center px-4">
        <span className="text-5xl mb-5 select-none">🔍</span>
        <h2 className="font-display text-2xl font-bold text-text mb-2">Recipe not found</h2>
        <p className="text-sm text-muted mb-6 max-w-xs leading-relaxed">
          This recipe may have been removed or made private by its owner.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <ChefHat size={14} />
          Go to SavoryShelf
        </Link>
      </div>
    )
  }

  // Per-request nonce so the inline JSON-LD script passes the strict
  // script-src policy applied in middleware.ts (same pattern as layout.tsx).
  const nonce       = (await headers()).get('x-nonce') ?? undefined
  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const url         = siteUrl ? `${siteUrl}/share/${id}` : undefined
  const description = buildDescription(recipe)
  const jsonLd      = buildJsonLd(recipe, url, description)

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // Defang any "</script>" sequences that could appear inside
        // user-supplied strings (title, ingredients, instructions, notes).
        // JSON parsers treat \u003c as "<", so structured-data crawlers
        // still receive the correct payload.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <RecipeView recipe={recipe} readOnly={true} />
    </>
  )
}
