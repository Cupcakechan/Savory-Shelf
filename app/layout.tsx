import type { Metadata } from 'next'
import { Lora, DM_Sans } from 'next/font/google'
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
  title: 'SavoryShelf',
  description: 'Save and organise recipes from anywhere — by Cocolito Collective.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lora.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var t=localStorage.getItem('savoryshelf-theme');
            if(t==='light'){document.documentElement.classList.remove('dark')}
            else{document.documentElement.classList.add('dark')}
          })()
        `}} />
      </head>
      <body className="min-h-screen bg-bg font-body antialiased flex flex-col">
        <Nav />
        <main className="px-4 max-w-2xl mx-auto flex-1 w-full">{children}</main>
        <footer className="border-t border-border py-5 text-center mt-8">
          <p className="text-xs text-subtle">by Cocolito Collective</p>
        </footer>
      </body>
    </html>
  )
}
