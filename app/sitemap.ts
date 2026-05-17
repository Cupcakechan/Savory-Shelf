import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

// Regenerate at most once per hour. Public-recipe additions show up in the
// sitemap within an hour without hammering Supabase on every Googlebot fetch.
export const revalidate = 3600

// Google's sitemap protocol allows up to 50,000 URLs per sitemap file.
// Far above current scale, but explicit to prevent silent truncation later.
const MAX_URLS = 50_000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

  // No site URL configured → emit an empty sitemap rather than throwing.
  // /sitemap.xml stays reachable; Googlebot will retry on next crawl.
  if (!siteUrl) {
    console.warn('[sitemap] NEXT_PUBLIC_SITE_URL is not set — sitemap will be empty.')
    return []
  }

  const entries: MetadataRoute.Sitemap = [
    // Home / import page — the only public, indexable non-share route.
    // /my-recipes, /my-pantry, /shopping-list are middleware-protected
    // (redirect anon users to /), and /auth/callback is transient.
    { url: siteUrl, lastModified: new Date() },
  ]

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // RLS already allows anon SELECT on rows where is_public = true
    // (see docs/security-contracts.md). No service-role key needed.
    const { data, error } = await supabase
      .from('recipes')
      .select('id, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(MAX_URLS)

    if (error) {
      console.error('[sitemap] Supabase error:', error.message)
    } else if (data) {
      for (const row of data as { id: string; created_at: string | null }[]) {
        entries.push({
          url:          `${siteUrl}/share/${row.id}`,
          lastModified: row.created_at ? new Date(row.created_at) : new Date(),
        })
      }
    }
  } catch (err) {
    // Don't break the sitemap if Supabase is unreachable — Googlebot will
    // still see the home page entry and retry on the next crawl cycle.
    console.error('[sitemap] Failed to fetch public recipes:', err)
  }

  return entries
}
