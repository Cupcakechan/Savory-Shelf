'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChefHat, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import AuthModal from './AuthModal'

// ── Theme toggle ──────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(true)
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')) }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('savoryshelf-theme', next ? 'dark' : 'light')
  }
  return (
    <button onClick={toggle} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="p-2.5 sm:p-2 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors">
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

// ── Auth section ──────────────────────────────────────────

function AuthSection() {
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // When the magic-link callback tab writes the session cookie and signals via
  // localStorage, pick up the new session here without requiring a page reload.
  useEffect(() => {
    const handler = async (e: StorageEvent) => {
      if (e.key !== 'savoryshelf-auth-success' || !e.newValue) return
      try { localStorage.removeItem('savoryshelf-auth-success') } catch (_) {}
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      if (session?.user) setShowAuth(false)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  if (user) return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted hidden sm:block max-w-[100px] truncate">{user.email}</span>
      <button
        onClick={() => supabase.auth.signOut()}
        className="text-xs font-medium text-muted hover:text-text border border-border hover:border-accent/40 px-2.5 py-2 sm:py-1.5 rounded-lg transition-colors"
      >
        Sign out
      </button>
    </div>
  )

  return (
    <>
      <button
        onClick={() => setShowAuth(true)}
        className="text-xs font-semibold bg-accent text-white px-3 py-2 sm:py-1.5 rounded-lg hover:bg-accent/90 transition-colors"
      >
        Sign in
      </button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}

// ── Nav ───────────────────────────────────────────────────

export default function Nav() {
  const path   = usePathname()
  const router = useRouter()

  const linkCls = (href: string) =>
    `text-sm font-medium px-3 py-2 sm:py-1.5 rounded-lg transition-colors ` +
    (path === href ? 'bg-surface text-text' : 'text-muted hover:text-text hover:bg-surface/60')

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <ChefHat size={15} className="text-white" strokeWidth={2.5} />
          </span>
          <div className="flex-col leading-tight hidden sm:flex">
            <span className="font-display font-bold text-sm text-text tracking-tight">SavoryShelf</span>
            <span className="text-[10px] text-subtle">by Cocolito Collective</span>
          </div>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-0.5">
            <Link href="/" className={linkCls('/')}>Import</Link>

            {/*
              router.refresh() busts the Next.js client-side router cache so the
              My Recipes page always remounts and re-fetches the latest recipes.
            */}
            <button
              onClick={() => {
                if (path === '/my-recipes') {
                  // Already on this route — router.push would be a no-op.
                  // Dispatch a custom event so MyRecipesPage can clear its
                  // selected-recipe state and return to the list.
                  window.dispatchEvent(new CustomEvent('savoryshelf:back-to-list'))
                } else {
                  router.refresh()
                  router.push('/my-recipes')
                }
              }}
              className={linkCls('/my-recipes')}
            >
              My Recipes
            </button>

            {/* My Pantry — always visible so users can manage staples from anywhere */}
            <Link href="/my-pantry" className={linkCls('/my-pantry')}>
              Pantry
            </Link>
          </nav>
          <div className="w-px h-5 bg-border mx-1" />
          <AuthSection />
          <div className="w-px h-5 bg-border mx-1" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
