'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChefHat, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('savoryshelf-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('savoryshelf-theme', 'light')
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

export default function Nav() {
  const path = usePathname()

  const linkCls = (href: string) =>
    `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ` +
    (path === href
      ? 'bg-surface text-text'
      : 'text-muted hover:text-text hover:bg-surface/60')

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <ChefHat size={15} className="text-white" strokeWidth={2.5} />
          </span>
          <span className="font-display font-bold text-base text-text tracking-tight">
            SavoryShelf
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-1">
            <Link href="/" className={linkCls('/')}>Import</Link>
            <Link href="/my-recipes" className={linkCls('/my-recipes')}>My Recipes</Link>
          </nav>
          <div className="w-px h-5 bg-border mx-1" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
