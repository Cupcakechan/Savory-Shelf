'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X, Plus, Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase, fromDbRecipe } from '@/lib/supabase'
import { scoreRecipesByPantry } from '@/lib/ai'
import type { Recipe } from '@/lib/types'
import RecipeCard from '@/components/RecipeCard'
import RecipeView from '@/components/RecipeView'

// Same columns as My Recipes — excludes image_base64 for list performance
const LIST_COLUMNS =
  'id, title, image_url, prep_time, cook_time, servings, ingredients, instructions, notes, source_url, created_at, tags'

// ── Client-side missing ingredient detection ──────────────
// Simple substring matching: fast, zero API calls, reliable.
// Catches "chicken breast" ↔ "chicken", "olive oil" ↔ "oil", etc.
// Synonym gaps (pasta ↔ spaghetti) are handled by Grok's score;
// this only drives the "Missing: X" display, not the match %.

// These basics are always assumed to be in every kitchen — never shown as missing.
const ALWAYS_AVAILABLE = ['water', 'salt', 'pepper', 'sugar', 'oil']

function computeMissing(ingredients: string[], pantry: string[]): string[] {
  const pantryLower = pantry.map(p => p.toLowerCase())
  return ingredients.filter(ing => {
    const ingLower = ing.toLowerCase()
    // Skip universal staples (salt, water, pepper, sugar, any oil)
    if (ALWAYS_AVAILABLE.some(s => ingLower.includes(s))) return false
    return !pantryLower.some(p => ingLower.includes(p) || p.includes(ingLower))
  })
}

export default function MyPantryPage() {
  const router = useRouter()

  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Pantry ingredients
  const [pantry, setPantry] = useState<string[]>([])
  const [input, setInput]   = useState('')

  // Saved recipes
  const [recipes, setRecipes]           = useState<Recipe[]>([])
  const [recipesReady, setRecipesReady] = useState(false)

  // Matching
  const [scores, setScores]     = useState<Record<string, number>>({})
  const [missing, setMissing]   = useState<Record<string, string[]>>({})
  const [threshold, setThreshold] = useState(50)
  const [scoring, setScoring]     = useState(false)
  const [scoringError, setScoringError] = useState('')

  // Recipe detail view
  const [selected, setSelected] = useState<Recipe | null>(null)

  const scoreTimer             = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const writeTimer             = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Incremented on every new scoring request; stale responses check against
  // this before writing state so rapid pantry changes never cause stale overwrites.
  const scoreVersion           = useRef(0)
  // Tracks the pantry fingerprint of the last completed Grok score run.
  // If pantry hasn't changed since last score, we skip the Grok call entirely.
  const lastScoredFingerprint  = useRef('')

  // ── Auth + initial data load ──────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.replace('/'); return }
      setUser(session.user)

      try {
        const cached = sessionStorage.getItem('savoryshelf-pantry')
        if (cached) setPantry(JSON.parse(cached))
      } catch {}

      const pantryPromise  = supabase.from('pantry').select('staples').eq('user_id', session.user.id).maybeSingle()
      // Safety cap — same as My Recipes; grid is unpaginated.
      const recipesPromise = supabase.from('recipes').select(LIST_COLUMNS).eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(500)

      const pantryRes = await pantryPromise
      const staples = pantryRes.data?.staples ?? []
      setPantry(staples)
      try { sessionStorage.setItem('savoryshelf-pantry', JSON.stringify(staples)) } catch {}
      setLoading(false)

      const recipesRes = await recipesPromise
      if (recipesRes.data) setRecipes(recipesRes.data.map(fromDbRecipe))
      setRecipesReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Debounced Grok scoring ────────────────────────────

  useEffect(() => {
    if (pantry.length === 0) { setScores({}); setMissing({}); return }
    if (recipes.length === 0) return

    clearTimeout(scoreTimer.current)
    const fingerprint = [...pantry].sort().join('|')
    scoreTimer.current = setTimeout(async () => {
      // Skip Grok entirely if the pantry hasn't changed since we last scored
      if (fingerprint === lastScoredFingerprint.current && Object.keys(scores).length > 0) return
      const version = ++scoreVersion.current   // stamp this request
      setScoring(true)
      setScoringError('')
      try {
        const { result, error } = await scoreRecipesByPantry(
          recipes.map(r => ({ id: r.id, ingredients: r.ingredients })),
          pantry,
        )
        // Discard if a newer request has already started
        if (scoreVersion.current !== version) return
        if (result) {
          lastScoredFingerprint.current = fingerprint
          setScores(result.scores)
          // Compute missing ingredients client-side from the pantry and
          // each recipe's ingredient list — fast, no extra API call needed.
          const clientMissing: Record<string, string[]> = {}
          for (const r of recipes) {
            clientMissing[r.id] = computeMissing(r.ingredients, pantry)
          }
          setMissing(clientMissing)
        } else {
          setScoringError(error ?? 'Could not score recipes — please try again.')
        }
      } catch (e) {
        if (scoreVersion.current !== version) return
        setScoringError('Scoring timed out — please try again.')
      } finally {
        // Only clear the spinner for the most recent request
        if (scoreVersion.current === version) setScoring(false)
      }
    }, 800)

    return () => clearTimeout(scoreTimer.current)
  }, [pantry, recipes])

  // ── Derived: recipes matching the threshold, sorted by score ──

  const matchingRecipes = useMemo(
    () =>
      recipes
        .filter(r => (scores[r.id] ?? 0) >= threshold)
        .sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)),
    [recipes, scores, threshold],
  )

  // ── Persist pantry to Supabase + sessionStorage ───────

  const persistPantry = (next: string[]) => {
    if (!user) return
    try { sessionStorage.setItem('savoryshelf-pantry', JSON.stringify(next)) } catch {}
    // Debounce Supabase writes — UI is already updated optimistically above.
    // This coalesces rapid add/remove bursts into a single DB round trip.
    clearTimeout(writeTimer.current)
    writeTimer.current = setTimeout(() => {
      supabase.from('pantry').upsert({ user_id: user.id, staples: next, match_cache: {} })
    }, 1_000)
  }

  // ── Add ingredients ───────────────────────────────────

  const addIngredients = () => {
    const vals = input
      .split(/[\n,]+/)
      .map(v => v.trim().toLowerCase())
      .filter(v => v.length > 0 && !pantry.includes(v))
    if (vals.length === 0) { setInput(''); return }
    const next = [...pantry, ...vals]
    setPantry(next)
    persistPantry(next)
    setInput('')
  }

  const removeIngredient = (item: string) => {
    const next = pantry.filter(i => i !== item)
    setPantry(next)
    persistPantry(next)
  }

  const clearAll = () => {
    setPantry([])
    setScores({})
    setMissing({})
    setScoringError('')
    persistPantry([])
  }

  const handleDelete = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
    setScores(prev => { const n = { ...prev }; delete n[id]; return n })
    setMissing(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  // ── Render guards ──────────────────────────────────────

  if (loading) {
    return (
      <div className="py-8">
        <div className="h-7 w-48 bg-surface rounded-xl animate-pulse mb-6" />
        <div className="h-28 bg-surface rounded-2xl animate-pulse mb-4" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-surface rounded-full animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (selected) {
    return (
      <RecipeView
        recipe={selected}
        onBack={() => setSelected(null)}
        initialSaved={true}
        missingIngredients={missing[selected.id] ?? []}
      />
    )
  }

  const hasScored   = Object.keys(scores).length > 0
  // Keep the grid visible while re-scoring — users see stale results with a
  // subtle "Updating…" indicator instead of a blank/jumpy loading state.
  const showGrid    = hasScored && matchingRecipes.length > 0
  const showNoMatch = !scoring && hasScored && matchingRecipes.length === 0

  return (
    <div className="py-8">

      {/* ── Back ─────────────────────────────────────────── */}
      <button
        onClick={() => router.push('/my-recipes')}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-8 py-2 -mx-1 px-1"
      >
        <ChevronLeft size={15} />
        Back to My Recipes
      </button>

      {/* ── Header ───────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-text leading-tight mb-2">
          What I Currently Have in My Pantry
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          Add your available ingredients and see which of your saved recipes you can make right now.
        </p>
      </div>

      {/* ── Ingredient input ──────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4 mb-5">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              addIngredients()
            }
          }}
          placeholder={"Type or paste ingredients — one per line or comma-separated\ne.g. eggs, butter, chicken breast, garlic, pasta"}
          rows={3}
          className="w-full bg-transparent text-sm text-text placeholder:text-subtle outline-none resize-none leading-relaxed mb-3"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs text-subtle">
              Separate with commas or new lines, then tap Add
            </p>
            <p className="text-xs text-subtle/70">
              Tip: be as specific as you like — "2 eggs, 1 lb chicken" or just "eggs, chicken" both work great
            </p>
          </div>
          <button
            onClick={addIngredients}
            disabled={!input.trim()}
            className="flex-shrink-0 flex items-center gap-1.5 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-all active:scale-[.97]"
          >
            <Plus size={15} />
            Add
          </button>
        </div>
      </div>

      {/* ── Ingredient chips ──────────────────────────────── */}
      {pantry.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          {pantry.map(item => (
            <span
              key={item}
              className="inline-flex items-center gap-1 text-sm font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full pl-3 pr-2 py-1.5 capitalize"
            >
              {item}
              <button
                onClick={() => removeIngredient(item)}
                aria-label={`Remove ${item}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-500/20 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-muted hover:text-highlight transition-colors px-2 py-1.5"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Empty state — no ingredients yet ─────────────── */}
      {pantry.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-5 select-none">🥬</span>
          <p className="font-display text-xl font-bold text-text mb-2">Add what you have</p>
          <p className="text-sm text-muted max-w-xs leading-relaxed">
            Type your ingredients above to see which of your saved recipes you can make right now.
          </p>
        </div>
      )}

      {/* ── Slider + results ─────────────────────────────── */}
      {pantry.length > 0 && (
        <>
          {/* Threshold slider */}
          <div className="bg-surface border border-border rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-text">
                Match at least{' '}
                <span className="font-bold text-accent text-base">{threshold}%</span>
                {' '}of ingredients
              </label>
              {!scoring && hasScored && (
                <span className="text-xs text-muted tabular-nums">
                  {matchingRecipes.length} recipe{matchingRecipes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-subtle">50%</span>
              <span className="text-xs text-subtle">100%</span>
            </div>
          </div>

          {/* Grok scoring in progress */}
          {scoring && (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 size={18} className="text-accent animate-spin" />
              <span className="text-sm text-muted">Matching your recipes with Grok…</span>
            </div>
          )}

          {/* Scoring error */}
          {!scoring && scoringError && (
            <div className="flex items-start gap-2.5 bg-surface border border-border rounded-xl px-4 py-3 mb-4">
              <span className="text-base select-none flex-shrink-0">⚠️</span>
              <p className="text-xs text-muted leading-relaxed">{scoringError}</p>
            </div>
          )}

          {/* No saved recipes at all */}
          {!scoring && recipesReady && recipes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-4 select-none">📋</span>
              <p className="text-muted text-sm max-w-xs leading-relaxed">
                You don't have any saved recipes yet — import some first!
              </p>
            </div>
          )}

          {/* Scored but nothing meets the threshold */}
          {showNoMatch && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-4 select-none">🔍</span>
              <p className="text-muted text-sm max-w-xs leading-relaxed">
                No recipes match {threshold}% or more of your ingredients.
                Try lowering the slider or adding more of what you have.
              </p>
            </div>
          )}

          {/* Recipe grid — stays visible while re-scoring (shows stale results) */}
          {showGrid && (
            <>
              {scoring && (
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 size={13} className="text-accent animate-spin flex-shrink-0" />
                  <span className="text-xs text-muted">Updating matches…</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {matchingRecipes.map(r => (
                  <RecipeCard
                    key={r.id}
                    recipe={r}
                    onClick={() => setSelected(r)}
                    onDelete={handleDelete}
                    matchPercent={scores[r.id]}
                    missingCount={(missing[r.id] ?? []).length}
                    showTags
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
