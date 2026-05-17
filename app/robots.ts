import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

  if (!siteUrl) {
    console.warn('[robots] NEXT_PUBLIC_SITE_URL is not set — Sitemap directive omitted.')
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow:     '/',
        // /auth/callback is transient (magic-link ?code=…) and must never
        // be indexed. The other three are middleware-protected and 302 to /
        // for anon users — listing them here saves crawler budget.
        disallow: [
          '/auth/callback',
          '/my-recipes',
          '/my-pantry',
          '/shopping-list',
        ],
      },
    ],
    // Pointing crawlers at the sitemap from robots.txt lets them discover
    // every public share URL automatically — no Search Console step needed.
    ...(siteUrl && { sitemap: `${siteUrl}/sitemap.xml` }),
  }
}
