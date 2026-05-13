'use client'

import { useState, useEffect, useMemo } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Recipe } from '@/lib/types'
import { supabase, fromDbRecipe } from '@/lib/supabase'
import { checkPantryMatchBatch } from '@/lib/ai'
import RecipeCard from '@/components/RecipeCard'
import RecipeView from '@/components/RecipeView'
import AuthModal from '@/components/AuthModal'

// ── Types ─────────────────────────────────────────────────

interface PantryCache {
  pantryHash: string
  results: Record<string, boolean>
}

const MAX_PANTRY = 10

// image_url is a short string (~100 chars) — fine to include in list queries.
// image_base64 is excluded (can be 200-500 KB per recipe).
const LIST_COLUMNS =
  'id, title, image_url, prep_time, cook_time, servings, ingredients, instructions, notes, source_url, created_at, tags'

// ── Pantry Modal ──────────────────────────────────────────

function PantryModal({
  pantry,
  onUpdate,
  onClose,
}: {
  pantry: string[]
  onUpdate: (staples: string[]) => Promise<void>
  onClose: () => void
}) {
  const [items, setItems] = useState([...pantry])
  const [input, setInput] = useState('')
  const [busy, setBusy]   = useState(false)

  const persist = async (next: string[]) => {
    setItems(next)
    setBusy(true)
    await onUpdate(next)
    setBusy(false)
  }

  const add = () => {
    const val = input.trim().toLowerCase()
    if (!val || items.includes(val) || items.length >= MAX_PANTRY) return
    persist([...items, val])
    setInput('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl select-none">🥬</span>
            <h2 className="font-display text-lg font-bold text-text">My Pantry</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-muted mb-5 leading-relaxed">
          Staples you always have on hand. Grok checks recipes against these for Pantry Friendly badges.
        </p>

        <div className="flex flex-wrap gap-2 mb-5 min-h-[2rem]">
          {items.length === 0 ? (
            <p className="text-xs text-subtle italic">No staples yet — add some below.</p>
          ) : (
            items.map(item => (
              <span key={item} className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full pl-3 pr-2 py-1.5 capitalize">
                {item}
                <button onClick={() => persist(items.filter(i => i !== item))} aria-label={`Remove ${item}`} className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-500/20 transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))
          )}
        </div>

        {items.length < MAX_PANTRY ? (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
              placeholder="e.g. olive oil, butter…"
              className="flex-1 bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text placeholder:text-subtle outline-none focus:border-accent/50 transition-colors"
              autoFocus
            />
            <button onClick={add} disabled={!input.trim() || busy} className="flex-shrink-0 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-all active:scale-[.97]">
              Add
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted text-center mb-4">Maximum {MAX_PANTRY} staples reached.</p>
        )}

        {items.length > 0 && (
          <button onClick={() => persist([])} className="w-full text-xs text-muted hover:text-highlight transition-colors py-2 rounded-lg hover:bg-surface">
            Clear all staples
          </button>
        )}

        <div className="border-t border-border mt-3 pt-3 text-center">
          <Link href="/my-pantry" onClick={onClose} className="text-xs text-accent hover:underline transition-colors">
            Manage full pantry →
          </Link>
        </div>
      </div>
    </div>
  )
}

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
  const [recipes, setRecipes]             = useState<Recipe[]>([])
  const [user, setUser]                   = useState<User | null>(null)
  const [selected, setSelected]           = useState<Recipe | null>(null)
  const [showAuth, setShowAuth]           = useState(false)
  const [loading, setLoading]             = useState(true)
  const [activeTag, setActiveTag]         = useState<string>('all')
  const [search, setSearch]               = useState('')
  const [pantry, setPantry]               = useState<string[]>([])
  const [pantryCache, setPantryCache]     = useState<PantryCache | null>(null)
  const [pantryMatches, setPantryMatches] = useState<Record<string, boolean>>({})
  const [showPantry, setShowPantry]       = useState(false)

  // ── Data loaders ────────────────────────────────────────

  const loadRecipes = async (): Promise<Recipe[]> => {
    const { data } = await supabase
      .from('recipes')
      .select(LIST_COLUMNS)
      .order('created_at', { ascending: false })
    const loaded = data ? data.map(fromDbRecipe) : []
    setRecipes(loaded)
    return loaded
  }

  const loadPantry = async (userId: string): Promise<{ staples: string[]; cache: PantryCache | null }> => {
    const { data } = await supabase
      .from('pantry')
      .select('staples, match_cache')
      .eq('user_id', userId)
      .maybeSingle()
    const staples = data?.staples ?? []
    const rawCache = data?.match_cache
    const cache: PantryCache | null =
      rawCache && typeof rawCache === 'object' && 'pantryHash' in rawCache
        ? (rawCache as PantryCache)
        : null
    setPantry(staples)
    setPantryCache(cache)
    return { staples, cache }
  }

  const savePantry = async (staples: string[]) => {
    if (!user) return
    setPantry(staples)
    setPantryCache(null)
    setPantryMatches({})
    await supabase.from('pantry').upsert({ user_id: user.id, staples, match_cache: {} })
  }

  // ── Grok pantry match (with Supabase cache) ─────────────

  const runPantryCheck = async (
    recipeList: Recipe[],
    staples: string[],
    userId: string,
    cache: PantryCache | null,
  ) => {
    if (staples.length === 0 || recipeList.length === 0) {
      setPantryMatches({})
      return
    }

    const hash = [...staples].sort().join('|')

    if (cache?.pantryHash === hash) {
      const uncached = recipeList.filter(r => !(r.id in cache.results))
      if (uncached.length === 0) {
        setPantryMatches(cache.results)
        return
      }
      setPantryMatches(cache.results)
      const { result } = await checkPantryMatchBatch(
        uncached.map(r => ({ id: r.id, ingredients: r.ingredients })),
        staples,
      )
      if (result) {
        const merged = { ...cache.results, ...result }
        setPantryMatches(merged)
        supabase.from('pantry')
          .update({ match_cache: { pantryHash: hash, results: merged } })
          .eq('user_id', userId)
      }
      return
    }

    const { result } = await checkPantryMatchBatch(
      recipeList.map(r => ({ id: r.id, ingredients: r.ingredients })),
      staples,
    )
    if (result) {
      setPantryMatches(result)
      const newCache: PantryCache = { pantryHash: hash, results: result }
      setPantryCache(newCache)
      supabase.from('pantry')
        .update({ match_cache: newCache })
        .eq('user_id', userId)
    }
  }

  // ── Mount ───────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      loadRecipes(),
      supabase.auth.getSession(),
    ]).then(async ([loaded, { data: { session } }]) => {
      setLoading(false)
      setUser(session?.user ?? null)

      if (session?.user) {
        const { staples, cache } = await loadPantry(session.user.id)
        if (staples.length > 0) {
          runPantryCheck(loaded, staples, session.user.id, cache)
        }
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser(session.user)
        loadPantry(session.user.id)
        await loadRecipes()
      } else {
        setUser(null)
        setRecipes([])
        setPantry([])
        setPantryMatches({})
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pantryFingerprint = useMemo(() => [...pantry].sort().join('|'), [pantry])
  useEffect(() => {
    if (!user || pantry.length === 0 || recipes.length === 0) return
    runPantryCheck(recipes, pantry, user.id, pantryCache)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pantryFingerprint, recipes.length])

  // ── Derived state ────────────────────────────────────────

  const allTags = useMemo(
    () => [...new Set(recipes.flatMap(r => r.tags ?? []))].sort(),
    [recipes],
  )

  useEffect(() => {
    if (activeTag !== 'all' && !allTags.includes(activeTag)) setActiveTag('all')
  }, [allTags, activeTag])

  const tagFilteredRecipes = useMemo(
    () => activeTag === 'all' ? recipes : recipes.filter(r => r.tags?.includes(activeTag)),
    [recipes, activeTag],
  )

  const displayedRecipes = useMemo(() => {
    const terms = search.split(/[\s,]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
    if (terms.length === 0) return tagFilteredRecipes
    return tagFilteredRecipes.filter(r => {
      const haystack = [r.title, ...r.ingredients].join(' ').toLowerCase()
      return terms.every(term => haystack.includes(term))
    })
  }, [tagFilteredRecipes, search])

  // ── Handlers ─────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  const handleBack = () => {
    setSelected(null)
    loadRecipes()
  }

  // ── Render guards ────────────────────────────────────────

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
          <button onClick={() => setShowAuth(true)} className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all">
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

      <div className="flex gap-2 mb-5">
        <div className="flex-1 flex items-center gap-2.5 bg-surface border border-border rounded-xl px-3.5 py-3 focus-within:border-accent/50 transition-colors">
          <Search size={15} className="text-muted flex-shrink-0" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or ingredient…"
            className="flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none min-w-0"
          />
          {searchActive && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="flex-shrink-0 text-muted hover:text-text transition-colors rounded p-0.5">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowPantry(true)}
          title="My Pantry"
          className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-3 text-sm font-medium border transition-all active:scale-[.97] ${
            pantry.length > 0
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15'
              : 'bg-surface border-border text-muted hover:border-accent/40 hover:text-text'
          }`}
        >
          <span className="text-base leading-none select-none">🥬</span>
          {pantry.length > 0 && <span className="text-xs font-bold tabular-nums">{pantry.length}</span>}
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => setActiveTag('all')}
            className={`flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 transition-all ${
              activeTag === 'all' ? 'bg-accent text-white' : 'bg-surface border border-border text-muted hover:border-accent/40 hover:text-text'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? 'all' : tag)}
              className={`flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-1.5 capitalize transition-all ${
                activeTag === tag ? 'bg-accent text-white' : 'bg-surface border border-border text-muted hover:border-accent/40 hover:text-text'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {displayedRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {searchActive ? (
            <>
              <span className="text-4xl mb-4 select-none">🔍</span>
              <p className="text-muted text-sm">No recipes match <span className="text-text font-medium">"{search.trim()}"</span></p>
              <button onClick={() => setSearch('')} className="mt-3 text-xs text-accent hover:underline transition-colors">Clear search</button>
            </>
          ) : (
            <>
              <span className="text-4xl mb-4 select-none">🏷️</span>
              <p className="text-muted text-sm">No recipes in <span className="text-text font-medium capitalize">{activeTag}</span> yet.</p>
              <button onClick={() => setActiveTag('all')} className="mt-3 text-xs text-accent hover:underline transition-colors">Show all recipes</button>
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
              pantryMatch={pantryMatches[r.id] ?? false}
            />
          ))}
        </div>
      )}

      {showPantry && (
        <PantryModal pantry={pantry} onUpdate={savePantry} onClose={() => setShowPantry(false)} />
      )}
    </div>
  )
}
