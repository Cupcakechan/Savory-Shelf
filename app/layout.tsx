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

export const metadata: Metadata = {
  title: 'SavoryShelf | by Cocolito Collective',
  description: 'Save and organise recipes from anywhere — by Cocolito Collective.',
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
        <footer className="border-t border-border py-5 text-center mt-8 space-y-1.5">
          <p className="text-xs text-subtle">SavoryShelf by Cocolito Collective</p>
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
