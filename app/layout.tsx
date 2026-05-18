import type { Metadata } from 'next'
import { Lora, DM_Sans } from 'next/font/google'
import { headers } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import Nav from '@/components/Nav'

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

// Canonical site URL — used to absolute-ify every relative URL in metadata
// (canonical link, OG url, Twitter url, share-page links). Set this in
// Vercel → Environment Variables as NEXT_PUBLIC_SITE_URL=https://www.savoryshelf.com
// (no trailing slash). When unset, metadataBase is omitted and Next.js falls
// back to Host-header inference at request time, which causes silent canonical
// drift across hostnames (the bug that triggered the Apr 2026 GSC indexing
// failure — see docs/seo-canonical-fix.md if/when written).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

export const metadata: Metadata = {
  ...(siteUrl && { metadataBase: new URL(siteUrl) }),
  title: 'SavoryShelf | by Cocolito Collective',
  description: 'Save and organise recipes from anywhere — by Cocolito Collective.',
  // Homepage canonical. Inherited by sub-routes that don't override:
  //   • /share/[id] → overrides with its own dynamic canonical (see app/share/[id]/page.tsx)
  //   • /my-recipes, /my-pantry, /shopping-list → disallowed in robots.ts AND
  //     middleware-redirect to '/' for anon users, so the inherited '/' is correct
  //   • /auth/callback → disallowed in robots.ts; transient redirect target
  // If you add a NEW public sub-route in future, override canonical in its
  // own page metadata so it doesn't silently inherit '/'.
  alternates: { canonical: '/' },
  openGraph: {
    title:       'SavoryShelf | by Cocolito Collective',
    description: 'Save and organise recipes from anywhere — by Cocolito Collective.',
    siteName:    'SavoryShelf',
    type:        'website',
    url:         '/',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the per-request nonce injected by middleware.ts.
  // Applying it to the theme-init script lets us remove 'unsafe-inline'
  // from the Content-Security-Policy's script-src directive.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="en" className={`${lora.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Theme initialisation must run synchronously before first paint to
          prevent a flash of the wrong colour scheme. The external script is
          served from /public; the nonce allows it under the strict CSP.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script nonce={nonce} src="/theme-init.js" />
      </head>
      <body className="min-h-screen bg-bg font-body antialiased flex flex-col">
        <Nav />
        <main className="px-4 max-w-2xl mx-auto flex-1 w-full">{children}</main>
        {/*
          mb-20 sm:mb-0 — on mobile the fixed BottomTabs bar (in Nav.tsx) is
          ~60px tall and pinned to viewport bottom. The margin keeps the
          footer text from sitting underneath it once the user scrolls to
          the document end. Desktop is unchanged.
        */}
        <footer className="border-t border-border py-5 text-center mt-8 mb-20 sm:mb-0 space-y-3">
          {/*
            Cocolito Collective brand mark. Transparent PNGs whose visible
            elements (cat / wordmark colour) are pre-tuned per theme; bg shows
            through so there's nothing to colour-match.
          */}
          <img
            src="/brand/cocolito-light.png"
            alt="Cocolito Collective"
            width={96}
            height={96}
            className="block dark:hidden w-24 h-24 mx-auto"
          />
          <img
            src="/brand/cocolito-dark.png"
            alt="Cocolito Collective"
            width={96}
            height={96}
            className="hidden dark:block w-24 h-24 mx-auto"
          />
          <p className="text-xs text-subtle">
            Have a feature in mind or encountered a bug?{' '}
            <a
              href="mailto:Cocolitocollective@savoryshelf.com"
              className="text-muted hover:text-accent transition-colors"
            >
              Cocolitocollective@savoryshelf.com
            </a>
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  )
}
