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
  description: 'Import any recipe from the web. Clean, beautiful, distraction-free.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lora.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Set theme before paint to avoid flash. Default: dark. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var t=localStorage.getItem('savoryshelf-theme');
            if(t==='light'){document.documentElement.classList.remove('dark')}
            else{document.documentElement.classList.add('dark')}
          })()
        `}} />
      </head>
      <body className="min-h-screen bg-bg font-body antialiased">
        <Nav />
        <main className="px-4 max-w-2xl mx-auto">{children}</main>
      </body>
    </html>
  )
}
