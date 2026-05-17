'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Sun, Moon, Link2, BookOpen, Carrot, ListChecks } from 'lucide-react'
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
  const [user, setUser]           = useState<User | null>(null)
  const [showAuth, setShowAuth]   = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // When the magic-link callback tab signals via localStorage, pick up the
  // new session, close the auth modal, and navigate to the main app so the
  // user lands somewhere useful without any manual interaction.
  useEffect(() => {
    const handler = async (e: StorageEvent) => {
      if (e.key !== 'savoryshelf-auth-success' || !e.newValue) return
      try { localStorage.removeItem('savoryshelf-auth-success') } catch (_) {}
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      if (session?.user) {
        setShowAuth(false)
        router.push('/my-recipes')
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [router])

  // Bottom tab bar dispatches this when a logged-out user taps a gated tab
  // (Pantry / Shopping). Opens the same modal as tapping "Sign in" directly.
  useEffect(() => {
    const handler = () => setShowAuth(true)
    window.addEventListener('savoryshelf:show-auth', handler)
    return () => window.removeEventListener('savoryshelf:show-auth', handler)
  }, [])

  const handleSignOut = async () => {
    if (signingOut) return          // prevent double-clicks
    setSigningOut(true)
    await supabase.auth.signOut()   // awaited — clears session cookie reliably
    setSigningOut(false)
    router.push('/')                // land on a clean page immediately
    router.refresh()                // bust the Next.js router cache
  }

  if (user) return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted hidden sm:block max-w-[100px] truncate">{user.email}</span>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="text-xs font-medium text-muted hover:text-text border border-border hover:border-accent/40 px-2.5 py-2 sm:py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
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

// ── Bottom tab bar (mobile only) ──────────────────────────
//
// Renders a fixed bar pinned to the bottom of the viewport, < sm only.
// Four primary destinations get equal-width thumb targets (~25% each).
// Logged-out users still see all four tabs — tapping a gated one fires
// 'savoryshelf:show-auth' which AuthSection above turns into a modal open.
// Logged-out users CAN tap Import and (currently) My Recipes freely.

function BottomTabs() {
  const path = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  // Independent auth subscription so the tab bar knows whether to gate.
  // Same pattern as AuthSection; the overhead is negligible and keeps each
  // component self-contained without a state-lifting refactor.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const tabs = [
    { href: '/',              icon: Link2,      label: 'Import',   gated: false, isMyRecipes: false },
    { href: '/my-recipes',    icon: BookOpen,   label: 'Recipes',  gated: false, isMyRecipes: true  },
    { href: '/my-pantry',     icon: Carrot,     label: 'Pantry',   gated: true,  isMyRecipes: false },
    { href: '/shopping-list', icon: ListChecks, label: 'Shopping', gated: true,  isMyRecipes: false },
  ] as const

  type Tab = (typeof tabs)[number]

  const handleTap = (tab: Tab) => {
    // Gate first — logged-out user tapping Pantry/Shopping opens auth modal
    if (tab.gated && !user) {
      window.dispatchEvent(new CustomEvent('savoryshelf:show-auth'))
      return
    }
    // Mirror the desktop nav's "tap My Recipes while already on it returns
    // to the list" behaviour so the two paths feel identical.
    if (tab.isMyRecipes && path === '/my-recipes') {
      window.dispatchEvent(new CustomEvent('savoryshelf:back-to-list'))
      return
    }
    if (tab.isMyRecipes) router.refresh()
    router.push(tab.href)
  }

  return (
    <nav
      aria-label="Primary"
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-bg/80 backdrop-blur-md border-t border-border"
    >
      <div className="flex items-stretch">
        {tabs.map(tab => {
          const active = path === tab.href
          const Icon = tab.icon
          return (
            <button
              key={tab.href}
              onClick={() => handleTap(tab)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors touch-manipulation select-none ${
                active ? 'text-text' : 'text-muted hover:text-text'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.25 : 2} />
              <span className="text-xs font-medium leading-none">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ── Nav ───────────────────────────────────────────────────

export default function Nav() {
  const path   = usePathname()
  const router = useRouter()

  // whitespace-nowrap keeps every label on a single line — without it,
  // longer labels like "Shopping List" wrap and visually misalign with
  // the shorter single-line tabs next to them.
  const linkCls = (href: string) =>
    `text-sm font-medium px-3 py-2 sm:py-1.5 rounded-lg transition-colors cursor-pointer touch-manipulation select-none whitespace-nowrap ` +
    (path === href ?
      'bg-surface text-text' : 'text-muted hover:text-text hover:bg-surface/60')

  return (
    <>
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border">
        {/*
          On mobile (< sm) the inline nav links hide — primary navigation
          moves to <BottomTabs /> at the bottom of the viewport. Top header on
          mobile shows only AuthSection + ThemeToggle, anchored right via
          justify-end. Desktop layout is unchanged.
        */}
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-end">
          <div className="flex items-center gap-1">
            <nav className="hidden sm:flex items-center gap-0.5">
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

              {/* Shopping Lists — top-level CRUD page; item editing lives at /shopping-list/[id] */}
              <Link href="/shopping-list" className={linkCls('/shopping-list')}>
                Shopping List
              </Link>
            </nav>
            <div className="hidden sm:block w-px h-5 bg-border mx-1" />
            <AuthSection />
            <div className="w-px h-5 bg-border mx-1" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <BottomTabs />
    </>
  )
}
