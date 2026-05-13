'use client'

import { useState, useEffect, useMemo } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Recipe } from '@/lib/types'
import { supabase, fromDbRecipe } from '@/lib/supabase'
import RecipeCard from '@/components/RecipeCard'
import RecipeView from '@/components/RecipeView'
import AuthModal from '@/components/AuthModal'

// ── Skeleton ──────────────────────────────────────────────

function RecipeGridSkeleton() {
  return (
    <div className="py-8">
      <div className="flex items-baseline justify-between mb-5">
        <div className="h-7 w-28 bg-surface rounded-xl animate-pulse" />
        <div className="h-4 w-14 bg-surface rounded-full animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl overflow-hidden animate-pulse">
            <div className="aspect-[4/3] bg-border" />
            <div className="p-4 space-y-2.5">
              <div className="h-3.5 bg-border rounded-full w-3/4" />
              <div className="h-3 bg-border rounded-full w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function MyRecipesPage() {
  const [recipes, setRecipes]     = useState<Recipe[]>([])
  const [user, setUser]           = useState<User | null>(null)
  const [selected, setSelected]   = useState<Recipe | null>(null)
  const [showAuth, setShowAuth]   = useState(false)
  const [loading, setLoading]     = useState(true)
  const [activeTag, setActiveTag] = useState<string>('all')
  const [search, setSearch]       = useState('')

  const loadRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRecipes(data.map(fromDbRecipe))
  }

  useEffect(() => {
    loadRecipes().finally(() => setLoading(false))
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser(session.user)
        await loadRecipes()
      } else {
        setUser(null)
        setRecipes([])
      }
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // All unique tags across saved recipes, sorted alphabetically
  const allTags = useMemo(
    () => [...new Set(recipes.flatMap(r => r.tags ?? []))].sort(),
    [recipes],
  )

  // Reset active tag if it no longer exists after a recipe refresh
  useEffect(() => {
    if (activeTag !== 'all' && !allTags.includes(activeTag)) {
      setActiveTag('all')
    }
  }, [allTags, activeTag])

  // Step 1 — filter by active tag
  const tagFilteredRecipes = useMemo(
    () => activeTag === 'all'
      ? recipes
      : recipes.filter(r => r.tags?.includes(activeTag)),
    [recipes, activeTag],
  )

  // Step 2 — narrow further by search query (title or any ingredient)
  const displayedRecipes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tagFilteredRecipes
    return tagFilteredRecipes.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.ingredients.some(ing => ing.toLowerCase().includes(q)),
    )
  }, [tagFilteredRecipes, search])

  const handleDelete = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  const handleBack = () => {
    setSelected(null)
    loadRecipes()
  }

  if (loading) return <RecipeGridSkeleton />

  if (selected) {
    return <RecipeView recipe={selected} onBack={handleBack} initialSaved={true} />
  }

  if (!user) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12 text-center">
          <span className="text-5xl mb-6 select-none">🔒</span>
          <h2 className="font-display text-2xl font-bold text-text mb-2">Sign in to view your recipes</h2>
          <p className="text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Your saved recipes live in the cloud — sign in to access them from any device.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all"
          >
            Sign in with magic link
          </button>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    )
  }

  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12 text-center">
        <span className="text-5xl mb-6 select-none">📋</span>
        <h2 className="font-display text-2xl font-bold text-text mb-2">No saved recipes yet</h2>
        <p className="text-muted text-sm mb-6 max-w-xs">Import a recipe and tap the bookmark icon to save it here.</p>
        <Link href="/" className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all">
          <BookOpen size={16} />Import your first recipe
        </Link>
      </div>
    )
  }

  const searchActive = search.trim().length > 0

  return (
    <div className="py-8">

      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-display text-2xl font-bold text-text">My Recipes</h1>
        <span className="text-sm text-muted">
          {searchActive
            ? `${displayedRecipes.length} result${displayedRecipes.length !== 1 ? 's' : ''}`
            : activeTag === 'all'
              ? `${recipes.length} saved`
              : `${tagFilteredRecipes.length} of ${recipes.length}`}
        </span>
      </div>

      {/* ── Search bar ───────────────────────────────────── */}
      <div className="flex items-center gap-2.5 bg-surface border border-border rounded-xl px-3.5 py-3 mb-5 focus-within:border-accent/50 transition-colors">
        <Search size={15} className="text-muted flex-shrink-0" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title or ingredient…"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none min-w-0"
        />
        {searchActive && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="flex-shrink-0 text-muted hover:text-text transition-colors rounded p-0.5"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Tag filter pills ─────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => setActiveTag('all')}
            className={`flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 transition-all ${
              activeTag === 'all'
                ? 'bg-accent text-white'
                : 'bg-surface border border-border text-muted hover:border-accent/40 hover:text-text'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? 'all' : tag)}
              className={`flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 capitalize transition-all ${
                activeTag === tag
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-border text-muted hover:border-accent/40 hover:text-text'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── Recipe grid ──────────────────────────────────── */}
      {displayedRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {searchActive ? (
            <>
              <span className="text-4xl mb-4 select-none">🔍</span>
              <p className="text-muted text-sm">
                No recipes match{' '}
                <span className="text-text font-medium">"{search.trim()}"</span>
              </p>
              <button
                onClick={() => setSearch('')}
                className="mt-3 text-xs text-accent hover:underline transition-colors"
              >
                Clear search
              </button>
            </>
          ) : (
            <>
              <span className="text-4xl mb-4 select-none">🏷️</span>
              <p className="text-muted text-sm">
                No recipes in{' '}
                <span className="text-text font-medium capitalize">{activeTag}</span> yet.
              </p>
              <button
                onClick={() => setActiveTag('all')}
                className="mt-3 text-xs text-accent hover:underline transition-colors"
              >
                Show all recipes
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {displayedRecipes.map(r => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onClick={() => setSelected(r)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
