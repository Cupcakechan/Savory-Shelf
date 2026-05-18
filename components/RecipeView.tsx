'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Clock, Users, Check, Bookmark, BookmarkCheck, ChevronLeft,
  ExternalLink, NotebookPen, Share2, Minus, Plus, Languages,
  Sparkles, X, CheckCircle, Tag, ListPlus,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { Recipe } from '@/lib/types'
import { supabase, toDbRecipe } from '@/lib/supabase'
import {
  translateRecipe, suggestSubstitutes,
  type TranslateResult, type SubstitutesResult,
} from '@/lib/ai'
import { migrateRecipeImage } from '@/lib/actions'
import KitchenNotesModal from './KitchenNotesModal'
import AuthModal from './AuthModal'
import AddToListModal from './AddToListModal'

// ── Time formatter ────────────────────────────────────────

function formatTime(t: string | undefined): string {
  if (!t) return ''
  if (!t.startsWith('P')) return t
  const m = t.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/)
  if (!m) return t
  const h = parseInt(m[1] || '0') * 24 + parseInt(m[2] || '0')
  const min = parseInt(m[3] || '0')
  if (h && min) return `${h} hr ${min} min`
  if (h) return `${h} hr`
  if (min) return `${min} min`
  return t
}

/** Decode HTML entities that survive recipe scraping (e.g. &frac14; -> 1/4) */
function decodeEntities(text: string): string {
  return text
    .replace(/&frac14;/gi, '¼').replace(/&frac12;/gi, '½').replace(/&frac34;/gi, '¾')
    .replace(/&frac13;/gi, '⅓').replace(/&frac23;/gi, '⅔').replace(/&frac18;/gi, '⅛')
    .replace(/&frac38;/gi, '⅜').replace(/&frac58;/gi, '⅝').replace(/&frac78;/gi, '⅞')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
}

function cleanTitle(title: string): string {
  return title
    .replace(/^\{[^}]+\}\s*/g, '')
    .replace(/\s*\{[^}]+\}$/g, '')
    .replace(/^\(\d+[^)]*\)\s*/gi, '')
    .trim()
}

// ── Ingredient scaling ────────────────────────────────────

function formatNum(n: number): string {
  if (n <= 0) return '0'
  if (Math.round(n) === n) return String(Math.round(n))
  const whole = Math.floor(n)
  const frac = n - whole
  const fracs: [number, string][] = [
    [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'],
    [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'],
  ]
  for (const [v, sym] of fracs) {
    if (Math.abs(frac - v) < 0.07) return whole ? `${whole} ${sym}` : sym
  }
  return n.toFixed(1)
}

function scaleIngredient(text: string, multiplier: number): string {
  if (Math.abs(multiplier - 1) < 0.001) return text
  return text.replace(
    /\b(\d{1,3})\/(\d{1,2})\b|\b(\d{1,3}(?:\.\d+)?)\b/g,
    (match, n, d, whole) => {
      const num = n && d ? parseFloat(n) / parseFloat(d) : parseFloat(whole)
      if (isNaN(num) || num === 0) return match
      return formatNum(num * multiplier)
    },
  )
}

// ── Unit conversion (US → Metric) ────────────────────────
// Works on already-scaled text (output of scaleIngredient).
// Handles integers, decimals, and unicode fractions (½ ¼ ⅓ etc.)

const FRAC_VALUES: Record<string, number> = {
  '⅛': 0.125, '¼': 0.25, '⅓': 0.333, '½': 0.5, '⅔': 0.667, '¾': 0.75,
}

function parseAmt(s: string): number {
  s = s.trim()
  // Unicode fraction alone: "½"
  if (FRAC_VALUES[s] !== undefined) return FRAC_VALUES[s]
  // Whole + unicode fraction: "2 ½"
  for (const [sym, val] of Object.entries(FRAC_VALUES)) {
    if (s.endsWith(sym)) {
      const whole = parseInt(s.slice(0, -sym.length).trim(), 10)
      if (!isNaN(whole)) return whole + val
    }
  }
  // Mixed number with slash fraction: "2 1/4" or "2 and 1/4"
  const mixed = s.match(/^(\d+)\s+(?:and\s+)?(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  // Standalone slash fraction: "1/4", "3/4"
  const slash = s.match(/^(\d+)\/(\d+)$/)
  if (slash) return parseInt(slash[1]) / parseInt(slash[2])
  // Decimal or plain integer
  return parseFloat(s) || 0
}

function formatMetricNum(n: number): string {
  if (n <= 0) return '0'
  let r: number
  if (n <= 5) {
    // Tiny (≤ 1 tsp): nearest 0.5 ml — keeps ¼ tsp as 1.5 ml, ½ tsp as 2.5 ml
    r = Math.round(n * 2) / 2
    return r % 1 === 0 ? String(r) : r.toFixed(1)
  } else if (n < 30) {
    // Tbsp range: nearest 1 ml
    r = Math.round(n)
  } else if (n < 100) {
    // ¼–½ cup range: nearest 5 ml
    r = Math.round(n / 5) * 5
  } else {
    // Cup+ and weight: nearest 10 ml / 10 g
    r = Math.round(n / 10) * 10
  }
  return String(r)
}

function metricIngredient(text: string): string {
  // Number pattern — ordered longest-match first so "2 and 1/4" and "2 1/4"
  // are captured whole before the plain-integer alternative can steal "4".
  // Without this ordering "2 and 1/4 cups" would match "4 cups" → 960 ml.
  const A = '(\\d+\\s+(?:and\\s+)?\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s+[⅛¼⅓½⅔¾]|[⅛¼⅓½⅔¾]|\\d+(?:\\.\\d+)?)'
  const rules: [RegExp, number, string][] = [
    // (?![a-zA-Z0-9]) replaces \b so unit abbreviations match correctly
    // even when immediately followed by non-ASCII characters (accented
    // letters, CJK, etc.) in non-English recipe text.
    [new RegExp(`${A}\\s*fl\\.?\\s*oz(?![a-zA-Z0-9])`, 'gi'), 30,  'ml'],
    [new RegExp(`${A}\\s*cups?(?![a-zA-Z0-9])`,             'gi'), 240, 'ml'],
    [new RegExp(`${A}\\s*(?:tbsp|tablespoons?)(?![a-zA-Z0-9])`, 'gi'), 15,  'ml'],
    [new RegExp(`${A}\\s*(?:tsp|teaspoons?)(?![a-zA-Z0-9])`,    'gi'), 5,   'ml'],
    [new RegExp(`${A}\\s*(?:lbs?|pounds?)(?![a-zA-Z0-9])`,      'gi'), 454, 'g'],
    [new RegExp(`${A}\\s*oz(?![a-zA-Z0-9])`,                'gi'), 28,  'g'],
  ]
  for (const [regex, factor, unit] of rules) {
    text = text.replace(regex, (_, amt: string) => {
      const n = parseAmt(amt)
      if (!n) return _
      return `${formatMetricNum(n * factor)} ${unit}`
    })
  }
  return text
}

// ── Share Modal ───────────────────────────────────────────

function ShareModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
        <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
          <Share2 size={20} className="text-accent" />
        </div>
        <h3 className="font-display text-xl font-bold text-text mb-1">Share Recipe</h3>
        <p className="text-sm text-muted mb-5 leading-relaxed">Anyone with this link can view this recipe — no sign-in required.</p>
        <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2.5 mb-5">
          <span className="text-xs text-text flex-1 truncate">{url}</span>
          <button onClick={copy} className="text-xs font-semibold text-accent hover:text-accent/80 flex-shrink-0 transition-colors">
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 active:scale-[.98] transition-all">Done</button>
      </div>
    </div>
  )
}

// ── AI Loading Modal ──────────────────────────────────────

function AiLoadingModal() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg border border-border rounded-2xl p-10 max-w-xs w-full text-center shadow-2xl">
        <div className="text-5xl mb-4 animate-pulse select-none">🐱</div>
        <p className="font-display text-lg font-bold text-text mb-1">Thinking with Grok…</p>
        <p className="text-xs text-muted">This may take a few seconds</p>
      </div>
    </div>
  )
}

function AiErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
        <div className="text-4xl mb-4 select-none">⚠️</div>
        <h3 className="font-display text-lg font-bold text-text mb-2">Something went wrong</h3>
        <p className="text-sm text-muted leading-relaxed mb-6">{message}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-surface border border-border text-sm font-medium text-text hover:border-accent/40 transition-colors">Close</button>
      </div>
    </div>
  )
}

// ── Translate Result Modal ────────────────────────────────

function TranslateModal({
  result, onClose, onApply, applied,
}: {
  result: TranslateResult; onClose: () => void; onApply: () => void; applied: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Languages size={17} className="text-accent" />
            <h3 className="font-display text-lg font-bold text-text">Translated Recipe</h3>
          </div>
          <button onClick={onClose} className="p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <h4 className="font-display text-xl font-bold text-text leading-snug">{result.title}</h4>
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Ingredients</p>
            <ul className="space-y-1.5">
              {result.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text">
                  <span className="text-accent mt-0.5 flex-shrink-0">•</span>{ing}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Instructions</p>
            <ol className="space-y-3">
              {result.instructions.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center mt-0.5 border border-accent/20">{i + 1}</span>
                  <p className="text-sm leading-relaxed text-text pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="px-6 py-5 border-t border-border flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-text hover:border-accent/40 transition-colors">Close</button>
          <button onClick={onApply} disabled={applied} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-70 active:scale-[.98] transition-all flex items-center justify-center gap-2">
            {applied ? <><CheckCircle size={15} />Saved!</> : 'Apply as new recipe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Substitutes Result Modal ──────────────────────────────

function SubstitutesModal({
  result, onClose, onCopyToNotes, copied,
}: {
  result: SubstitutesResult; onClose: () => void; onCopyToNotes: () => void; copied: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl max-w-md w-full shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles size={17} className="text-accent" />
            <h3 className="font-display text-lg font-bold text-text">Ingredient Substitutes</h3>
          </div>
          <button onClick={onClose} className="p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {result.substitutes.length === 0 ? (
            <p className="text-sm text-muted italic">All ingredients in this recipe are commonly available — no substitutes needed!</p>
          ) : (
            result.substitutes.map((item, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4">
                <p className="text-sm font-semibold text-text mb-2">{item.original}</p>
                <ul className="space-y-1.5">
                  {item.substitutes.map((sub, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-muted">
                      <span className="text-accent flex-shrink-0 mt-0.5">→</span>{sub}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {result.note && <p className="text-xs text-muted italic leading-relaxed pt-1">{result.note}</p>}
        </div>
        <div className="px-6 py-5 border-t border-border flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-text hover:border-accent/40 transition-colors">Close</button>
          <button onClick={onCopyToNotes} disabled={copied} className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-70 active:scale-[.98] transition-all flex items-center justify-center gap-2">
            {copied ? <><CheckCircle size={15} />Copied!</> : 'Copy to Kitchen Notes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────

interface Props {
  recipe: Recipe
  onBack?: () => void
  initialSaved?: boolean
  readOnly?: boolean
  missingIngredients?: string[]   // passed from Pantry page to highlight what's needed
}

export default function RecipeView({
  recipe: initialRecipe,
  onBack,
  initialSaved = false,
  readOnly = false,
  missingIngredients,
}: Props) {
  const [recipe, setRecipe]               = useState(initialRecipe)
  const baseServings                      = recipe.servings ?? 4
  const [servings, setServings]           = useState(baseServings)
  const [checked, setChecked]             = useState<Set<number>>(new Set())
  const [saved, setSaved]                 = useState(initialSaved)
  const [user, setUser]                   = useState<User | null>(null)
  const [showNotes, setShowNotes]         = useState(false)
  const [showShare, setShowShare]         = useState(false)
  const [shareUrl, setShareUrl]           = useState('')
  const [showAuth, setShowAuth]           = useState(false)
  const [showAddToList, setShowAddToList] = useState(false)
  const [addedTo, setAddedTo]             = useState('')
  const [aiLoading, setAiLoading]               = useState(false)
  const [aiError, setAiError]                   = useState('')
  const [translateResult, setTranslateResult]   = useState<TranslateResult | null>(null)
  const [translateApplied, setTranslateApplied] = useState(false)
  const [substitutesResult, setSubstitutesResult] = useState<SubstitutesResult | null>(null)
  const [substitutesCopied, setSubstitutesCopied] = useState(false)
  const [unit, setUnitRaw] = useState<'us' | 'metric'>('us')

  const [tags, setTags]                 = useState<string[]>(initialRecipe.tags ?? [])
  const [userTags, setUserTags]         = useState<string[]>([])
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagInput, setTagInput]         = useState('')
  const tagInputRef                     = useRef<HTMLInputElement>(null)

  // Flips to true the moment the user clicks Save or Share. Read inside the
  // mount-time saved-check below to prevent that stale SELECT from clobbering
  // the user's optimistic state on fresh imports — without this guard, the
  // saved-check can race against (and lose to) the user's INSERT, silently
  // reverting the bookmark to "not saved" forever until a page refresh.
  const hasUserActedRef = useRef(false)

  const tagSuggestions = userTags.filter(
    t => !tags.includes(t) && t.includes(tagInput.toLowerCase().trim()),
  )

  const isTranslated = recipe.title.includes('(translated)')

  // ── Lazy image load + one-time migration ──────────────
  // List query includes image_url (tiny string) but not image_base64 (large blob).
  // New recipes:  image_url is set → recipe.image already populated, effect skips.
  // Old recipes:  only image_base64 exists → fetch it, show immediately, then
  //               migrate to Storage in the background so the next open is instant.
  useEffect(() => {
    if (recipe.image || !initialSaved || readOnly) return

    supabase
      .from('recipes')
      .select('image_url, image_base64')
      .eq('id', recipe.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return

        if (data.image_url) {
          setRecipe(r => ({ ...r, image: data.image_url }))
        } else if (data.image_base64) {
          // Show base64 immediately so the user isn't waiting
          setRecipe(r => ({ ...r, image: data.image_base64 }))
          // Migrate to Storage in the background; swap URL in when done
          migrateRecipeImage(recipe.id).then(({ url }) => {
            if (url) setRecipe(r => ({ ...r, image: url }))
          })
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id])

  useEffect(() => {
    if (readOnly) return
    // getUser() makes a real network request — always reliable even when the
    // client-side session cache hasn't been populated yet (e.g. first page load).
    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      setUser(authUser ?? null)
      if (authUser) {
        // Run saved-check and tag aggregation in parallel — halves round-trip count
        const [savedResult, tagsResult] = await Promise.all([
          initialSaved
            ? Promise.resolve({ data: null })
            : supabase.from('recipes').select('id').eq('id', recipe.id).maybeSingle(),
          // Tags-only column is small; the 2000 cap is purely defensive.
          // Order makes the truncation deterministic (newest tags surface first).
          supabase.from('recipes').select('tags').eq('user_id', authUser.id).order('created_at', { ascending: false }).limit(2000),
        ])
        if (!initialSaved && !hasUserActedRef.current) {
          setSaved(!!(savedResult as { data: unknown }).data)
        }
        const tagRows = tagsResult.data
        if (tagRows) {
          const flat = [
            ...new Set(
              (tagRows as { tags: string[] | null }[]).flatMap(r => r.tags ?? [])
            ),
          ].sort()
          setUserTags(flat)
        }
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id, initialSaved, readOnly])

  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus()
  }, [showTagInput])

  // Load persisted unit preference
  useEffect(() => {
    try {
      if (localStorage.getItem('savoryshelf-unit') === 'metric') setUnitRaw('metric')
    } catch {}
  }, [])

  const setUnit = (u: 'us' | 'metric') => {
    setUnitRaw(u)
    try { localStorage.setItem('savoryshelf-unit', u) } catch {}
  }

  const multiplier = servings / baseServings

  // Memoise expensive per-ingredient transformations so they only recompute
  // when ingredients, multiplier, or unit actually change — not on every
  // checkbox toggle, state update, or unrelated re-render.
  const processedIngredients = useMemo(
    () => recipe.ingredients.map(ing =>
      unit === 'metric'
        ? metricIngredient(scaleIngredient(decodeEntities(ing), multiplier))
        : scaleIngredient(decodeEntities(ing), multiplier)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe.ingredients, multiplier, unit],
  )

  const toggleCheck = (i: number) =>
    setChecked(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })

  const toggleSave = async () => {
    // Mark that the user has taken an explicit save action — the mount-time
    // saved-check (above) must no longer be allowed to overwrite local state.
    hasUserActedRef.current = true

    let currentUser = user
    if (!currentUser) {
      const { data: { user: freshUser } } = await supabase.auth.getUser()
      currentUser = freshUser ?? null
      if (currentUser) setUser(currentUser)
    }
    if (!currentUser) { setShowAuth(true); return }

    if (saved) {
      setSaved(false)   // optimistic — UI responds instantly
      const { error } = await supabase.from('recipes').delete().eq('id', recipe.id)
      if (error) {
        // Roll back so the bookmark reflects reality, and log for diagnosis.
        setSaved(true)
        console.error('[savoryshelf] delete failed:', error.message)
      }
    } else {
      setSaved(true)    // optimistic — UI responds instantly
      const { error } = await supabase.from('recipes').insert(toDbRecipe(recipe, currentUser.id))
      if (error) {
        setSaved(false)
        console.error('[savoryshelf] save failed:', error.message)
      }
    }
  }

  // One-tap "Add all ingredients to a shopping list" flow — mirrors the
  // RecipeCard pattern so users get the same affordance whether they're
  // browsing the grid or looking at a recipe in full. AddToListModal handles
  // the unauthenticated case internally ("Please sign in to create a shopping
  // list."), so no auth gate is needed at the button.
  const handleAddToList = () => setShowAddToList(true)
  const handleAdded = (listName: string) => {
    setShowAddToList(false)
    setAddedTo(listName)
    setTimeout(() => setAddedTo(''), 2200)
  }

  const handleShare = async () => {
    // Share also performs a save when the recipe isn't yet in the user's
    // collection — same race-vs-saved-check concern as toggleSave.
    hasUserActedRef.current = true

    let currentUser = user
    if (!currentUser) {
      const { data: { user: freshUser } } = await supabase.auth.getUser()
      currentUser = freshUser ?? null
      if (currentUser) setUser(currentUser)
    }
    if (!currentUser) { setShowAuth(true); return }

    if (!saved) {
      await supabase.from('recipes').insert({ ...toDbRecipe(recipe, currentUser.id), is_public: true })
      setSaved(true)
    } else {
      await supabase.from('recipes').update({ is_public: true }).eq('id', recipe.id)
    }
    setShareUrl(`${window.location.origin}/share/${recipe.id}`)
    setShowShare(true)
  }

  const handleTranslate = async () => {
    setAiLoading(true)
    const { result, error } = await translateRecipe(recipe)
    setAiLoading(false)
    if (error) setAiError(error)
    else if (result) setTranslateResult(result)
  }

  const handleSubstitutes = async () => {
    setAiLoading(true)
    const { result, error } = await suggestSubstitutes(recipe)
    setAiLoading(false)
    if (error) setAiError(error)
    else if (result) setSubstitutesResult(result)
  }

  const applyTranslation = async () => {
    if (!translateResult) return
    const translatedRecipe: Recipe = {
      ...recipe,
      title: `${translateResult.title} (translated)`,
      ingredients: translateResult.ingredients,
      instructions: translateResult.instructions,
    }
    setRecipe(translatedRecipe)
    if (user) {
      await supabase.from('recipes').upsert(toDbRecipe(translatedRecipe, user.id))
      setSaved(true)
    }
    setTranslateApplied(true)
    setTimeout(() => { setTranslateApplied(false); setTranslateResult(null) }, 1800)
  }

  const copySubstitutesToNotes = async () => {
    if (!substitutesResult) return
    const block = [
      '── Ingredient Substitutes ──',
      ...substitutesResult.substitutes.map(s =>
        `${s.original}:\n  → ${s.substitutes.join('\n  → ')}`
      ),
      substitutesResult.note ? `\nNote: ${substitutesResult.note}` : '',
    ].filter(Boolean).join('\n\n')
    const fullNotes = recipe.notes ? `${recipe.notes}\n\n${block}` : block
    if (user && saved) await supabase.from('recipes').update({ notes: fullNotes }).eq('id', recipe.id)
    setRecipe(r => ({ ...r, notes: fullNotes }))
    setSubstitutesCopied(true)
    setTimeout(() => { setSubstitutesCopied(false); setSubstitutesResult(null) }, 1800)
  }

  // ── Tag handlers ────────────────────────────────────

  const persistTags = async (newTags: string[]) => {
    if (user && saved) {
      await supabase.from('recipes').update({ tags: newTags }).eq('id', recipe.id)
    }
  }

  const addTag = async (raw: string) => {
    const tag = raw.trim().toLowerCase()
    if (!tag || tags.includes(tag)) {
      setShowTagInput(false)
      setTagInput('')
      return
    }
    const newTags = [...tags, tag]
    setTags(newTags)
    setRecipe(r => ({ ...r, tags: newTags }))
    setTagInput('')
    setShowTagInput(false)
    if (!userTags.includes(tag)) setUserTags(prev => [...prev, tag].sort())
    await persistTags(newTags)
  }

  const removeTag = async (tag: string) => {
    const newTags = tags.filter(t => t !== tag)
    setTags(newTags)
    setRecipe(r => ({ ...r, tags: newTags }))
    await persistTags(newTags)
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const match = tagSuggestions.length === 1 && tagInput && tagSuggestions[0].startsWith(tagInput.toLowerCase())
      addTag(match ? tagSuggestions[0] : tagInput)
    }
    if (e.key === 'Escape') {
      setShowTagInput(false)
      setTagInput('')
    }
  }

  // ── Render ──────────────────────────────────────────

  return (
    <>
      <article className="pb-20">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mt-6 mb-2 py-2 -mx-1 px-1">
            <ChevronLeft size={16} />Back
          </button>
        )}

        {recipe.image && (
          <div className="w-full aspect-[16/9] rounded-2xl overflow-hidden mt-6 mb-7 bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover"
              onError={e => {
                // Hide the wrapper so no broken-image space remains
                const wrap = e.currentTarget.parentElement
                if (wrap) wrap.style.display = 'none'
              }}
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-5">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-text leading-tight flex-1">{cleanTitle(recipe.title)}</h1>
          {!readOnly && (
            <div className="flex items-center gap-2 mt-1 flex-shrink-0">
              <button onClick={() => setShowNotes(true)} title="My Kitchen Notes" className="p-3 sm:p-2.5 rounded-xl border border-border text-muted hover:border-accent/40 hover:text-accent transition-all">
                <NotebookPen size={16} />
              </button>
              <button onClick={handleAddToList} title="Add all ingredients to a shopping list" aria-label="Add all ingredients to a shopping list" className="p-3 sm:p-2.5 rounded-xl border border-border text-muted hover:border-accent/40 hover:text-accent transition-all">
                <ListPlus size={16} />
              </button>
              <button onClick={handleShare} title="Share recipe" className="p-3 sm:p-2.5 rounded-xl border border-border text-muted hover:border-accent/40 hover:text-accent transition-all">
                <Share2 size={16} />
              </button>
              <button
                onClick={toggleSave}
                title={saved ? 'Remove from My Recipes' : 'Save to My Recipes'}
                className={`p-3 sm:p-2.5 rounded-xl border transition-all ${saved ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
              >
                {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="flex flex-wrap gap-2">
            {recipe.prepTime && <Chip icon={<Clock size={13} />} label={`Prep ${formatTime(recipe.prepTime)}`} />}
            {recipe.cookTime && <Chip icon={<Clock size={13} />} label={`Cook ${formatTime(recipe.cookTime)}`} />}
            {recipe.servings && <Chip icon={<Users size={13} />} label={`${recipe.servings} servings`} />}
          </div>
          {/* Imperial ↔ Metric toggle */}
          <div className="flex items-center gap-0.5 bg-surface border border-border rounded-xl p-1 flex-shrink-0">
            <button
              onClick={() => setUnit('us')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all touch-manipulation select-none ${
                unit === 'us' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              US
            </button>
            <button
              onClick={() => setUnit('metric')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all touch-manipulation select-none ${
                unit === 'metric' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              Metric
            </button>
          </div>
        </div>

        {/* Missing ingredients banner — only shown when opened from the Pantry page */}
        {missingIngredients && missingIngredients.length > 0 && (
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3.5 mb-6">
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
              Still need to grab
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingIngredients.map((item, i) => (
                <span
                  key={i}
                  className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 capitalize"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        {missingIngredients && missingIngredients.length === 0 && (
          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-6 flex items-center gap-2.5">
            <span className="text-base select-none">✅</span>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              You have everything for this recipe — time to cook!
            </p>
          </div>
        )}

        {!readOnly && saved && (
          <div className="mb-8">
            <div className="flex items-center flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent bg-accent/10 border border-accent/20 rounded-full pl-3 pr-2 py-1.5 capitalize"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag}`}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20 hover:text-text transition-colors"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}

              {!showTagInput ? (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted border border-dashed border-border rounded-full px-3 py-1.5 hover:border-accent/50 hover:text-text transition-all active:scale-[.97]"
                >
                  <Tag size={11} />
                  Add to Collection
                </button>
              ) : (
                <div className="relative">
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => setTimeout(() => { setShowTagInput(false); setTagInput('') }, 150)}
                    placeholder="Collection name…"
                    className="text-xs rounded-full px-3.5 py-1.5 bg-surface border border-accent/40 focus:border-accent text-text placeholder-subtle outline-none w-36 transition-colors"
                  />
                  {tagSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 mt-1.5 bg-bg border border-border rounded-xl shadow-xl overflow-hidden z-20 min-w-[148px]">
                      {tagSuggestions.map(t => (
                        <button
                          key={t}
                          onMouseDown={e => { e.preventDefault(); addTag(t) }}
                          className="w-full text-left text-xs px-3.5 py-2.5 hover:bg-surface text-text capitalize transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {recipe.servings && (
          <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-4">
            <div className="flex items-stretch min-h-[6rem]">
              <button onClick={() => setServings(s => Math.max(1, s - 1))} disabled={servings <= 1} aria-label="Decrease servings" className="w-24 flex items-center justify-center border-r border-border text-muted hover:bg-border/40 hover:text-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors active:bg-border">
                <Minus size={28} strokeWidth={2} />
              </button>
              <div className="flex-1 flex flex-col items-center justify-center py-4 gap-1">
                <span className="font-display text-4xl font-bold text-text leading-none">
                  {servings}<span className="text-2xl font-semibold text-muted ml-2">serving{servings !== 1 ? 's' : ''}</span>
                </span>
                <span className="text-xs text-subtle">(original: {baseServings} serving{baseServings !== 1 ? 's' : ''})</span>
                {servings !== baseServings && (
                  <button onClick={() => setServings(baseServings)} className="text-xs text-accent hover:underline mt-1 transition-colors">Reset to original</button>
                )}
              </div>
              <button onClick={() => setServings(s => s + 1)} aria-label="Increase servings" className="w-24 flex items-center justify-center border-l border-border text-muted hover:bg-border/40 hover:text-text transition-colors active:bg-border">
                <Plus size={28} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="flex gap-3 mb-9">
            {!isTranslated && (
              <button onClick={handleTranslate} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:border-accent/40 hover:text-text transition-all active:scale-[.98]">
                <Languages size={15} />Translate to English
              </button>
            )}
            <button
              onClick={handleSubstitutes}
              className={`${isTranslated ? 'w-full' : 'flex-1'} flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:border-accent/40 hover:text-text transition-all active:scale-[.98]`}
            >
              <Sparkles size={15} />Suggest Substitutes
            </button>
          </div>
        )}

        <Section
          title="Ingredients"
          action={checked.size > 0 ? (
            <button
              onClick={() => setChecked(new Set())}
              className="text-sm font-medium text-muted hover:text-text py-2 px-3 rounded-xl hover:bg-surface transition-colors active:scale-[.97] touch-manipulation select-none"
            >
              Uncheck all
            </button>
          ) : undefined}
        >
          <ul className="space-y-1">
            {processedIngredients.map((display, i) => (
              <li key={i} onClick={() => toggleCheck(i)} className={`flex items-start gap-3 px-3 py-3 sm:py-2.5 rounded-xl cursor-pointer select-none transition-all ${checked.has(i) ? 'opacity-40' : 'hover:bg-surface active:scale-[.99]'}`}>
                <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${checked.has(i) ? 'bg-accent border-accent' : 'border-border'}`}>
                  {checked.has(i) && <Check size={10} className="text-white" strokeWidth={3.5} />}
                </span>
                <span className={`text-sm leading-relaxed ${checked.has(i) ? 'line-through text-muted' : 'text-text'}`}>
                  {display}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Instructions">
          <ol className="space-y-5">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center mt-0.5 border border-accent/20">{i + 1}</span>
                <p className="text-sm leading-relaxed text-text pt-0.5">{decodeEntities(step)}</p>
              </li>
            ))}
          </ol>
        </Section>

        {recipe.notes && (
          <Section title="My Kitchen Notes">
            <p className="text-sm leading-relaxed text-muted italic whitespace-pre-wrap">{recipe.notes}</p>
          </Section>
        )}

        {recipe.sourceUrl && (
          <div className="mt-2">
            {!recipe.image && (
              <p className="text-xs text-subtle leading-relaxed mb-2">
                📷 Image missing — copy the link below and paste it into{' '}
                <span className="text-muted font-medium">Import</span> to recover it.
              </p>
            )}
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors">
              <ExternalLink size={12} />View original recipe
            </a>
          </div>
        )}
      </article>

      {showNotes && (
        <KitchenNotesModal recipe={recipe} userId={user?.id} isSaved={saved} onClose={() => setShowNotes(false)} onSave={notes => setRecipe(r => ({ ...r, notes: notes || undefined }))} />
      )}
      {showShare       && <ShareModal url={shareUrl} onClose={() => setShowShare(false)} />}
      {showAuth        && <AuthModal onClose={() => setShowAuth(false)} />}
      {showAddToList   && <AddToListModal ingredients={recipe.ingredients} onClose={() => setShowAddToList(false)} onAdded={handleAdded} />}
      {aiLoading       && <AiLoadingModal />}
      {aiError         && <AiErrorModal message={aiError} onClose={() => setAiError('')} />}
      {translateResult && <TranslateModal result={translateResult} onClose={() => setTranslateResult(null)} onApply={applyTranslation} applied={translateApplied} />}
      {substitutesResult && <SubstitutesModal result={substitutesResult} onClose={() => setSubstitutesResult(null)} onCopyToNotes={copySubstitutesToNotes} copied={substitutesCopied} />}

      {/*
        "Added to list" toast. Fixed to the viewport bottom so it's visible
        without needing to scroll, with a bottom offset on mobile (bottom-20)
        to sit above the BottomTabs nav bar in Nav.tsx (~5rem tall). Desktop
        (bottom-4) has no nav bar to clear. pointer-events-none lets the user
        keep scrolling underneath. Auto-dismisses after 2.2s via handleAdded.
      */}
      {addedTo && (
        <div className="fixed bottom-20 sm:bottom-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="bg-emerald-500 text-white text-sm font-semibold rounded-full shadow-lg px-5 py-2.5">
            ✓ Added to {addedTo}
          </div>
        </div>
      )}
    </>
  )
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted bg-surface border border-border rounded-full px-3 py-1.5">
      {icon}{label}
    </span>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
        <h2 className="font-display text-xl font-bold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
