'use client'

import { useState, useEffect } from 'react'
import {
  Clock, Users, Check, Bookmark, BookmarkCheck, ChevronLeft,
  ExternalLink, NotebookPen, Share2, Minus, Plus, Languages,
  Sparkles, X, CheckCircle,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { Recipe } from '@/lib/types'
import { supabase, toDbRecipe } from '@/lib/supabase'
import {
  translateRecipe, suggestSubstitutes,
  type TranslateResult, type SubstitutesResult,
} from '@/lib/ai'
import KitchenNotesModal from './KitchenNotesModal'
import AuthModal from './AuthModal'

// ── Time formatter ────────────────────────────────────────
// Handles both ISO 8601 (PT1H30M, P0DT0H10M) and already-formatted strings

function formatTime(t: string | undefined): string {
  if (!t) return ''
  if (!t.startsWith('P')) return t // Already human-readable
  const m = t.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/)
  if (!m) return t
  const h = parseInt(m[1] || '0') * 24 + parseInt(m[2] || '0')
  const min = parseInt(m[3] || '0')
  if (h && min) return `${h} hr ${min} min`
  if (h) return `${h} hr`
  if (min) return `${min} min`
  return t
}

/** Remove {tag} pollution from displayed titles without mutating the recipe object */
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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
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
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
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
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"><X size={16} /></button>
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
}

export default function RecipeView({
  recipe: initialRecipe,
  onBack,
  initialSaved = false,
  readOnly = false,
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
  const [aiLoading, setAiLoading]               = useState(false)
  const [aiError, setAiError]                   = useState('')
  const [translateResult, setTranslateResult]   = useState<TranslateResult | null>(null)
  const [translateApplied, setTranslateApplied] = useState(false)
  const [substitutesResult, setSubstitutesResult] = useState<SubstitutesResult | null>(null)
  const [substitutesCopied, setSubstitutesCopied] = useState(false)

  // Hide translate button on already-translated recipes
  const isTranslated = recipe.title.includes('(translated)')

  useEffect(() => {
    if (readOnly) return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user && !initialSaved) {
        const { data } = await supabase.from('recipes').select('id').eq('id', recipe.id).maybeSingle()
        setSaved(!!data)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [recipe.id, initialSaved, readOnly])

  const multiplier = servings / baseServings

  const toggleCheck = (i: number) =>
    setChecked(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next })

  const toggleSave = async () => {
    if (!user) { setShowAuth(true); return }
    if (saved) {
      await supabase.from('recipes').delete().eq('id', recipe.id)
      setSaved(false)
    } else {
      await supabase.from('recipes').insert(toDbRecipe(recipe, user.id))
      setSaved(true)
    }
  }

  const handleShare = async () => {
    if (!user) { setShowAuth(true); return }
    if (!saved) {
      await supabase.from('recipes').insert({ ...toDbRecipe(recipe, user.id), is_public: true })
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
    const newRecipe: Recipe = {
      ...recipe,
      id: crypto.randomUUID(),
      title: `${translateResult.title} (translated)`,
      ingredients: translateResult.ingredients,
      instructions: translateResult.instructions,
      savedAt: undefined,
    }
    if (user) await supabase.from('recipes').insert(toDbRecipe(newRecipe, user.id))
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

  return (
    <>
      <article className="pb-20">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mt-6 mb-2">
            <ChevronLeft size={16} />Back
          </button>
        )}

        {recipe.image && (
          <div className="w-full aspect-[16/9] rounded-2xl overflow-hidden mt-6 mb-7 bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Title + action buttons */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-text leading-tight flex-1">{cleanTitle(recipe.title)}</h1>
          {!readOnly && (
            <div className="flex items-center gap-2 mt-1 flex-shrink-0">
              <button onClick={() => setShowNotes(true)} title="My Kitchen Notes" className="p-2.5 rounded-xl border border-border text-muted hover:border-accent/40 hover:text-accent transition-all">
                <NotebookPen size={16} />
              </button>
              <button onClick={handleShare} title="Share recipe" className="p-2.5 rounded-xl border border-border text-muted hover:border-accent/40 hover:text-accent transition-all">
                <Share2 size={16} />
              </button>
              <button
                onClick={toggleSave}
                title={saved ? 'Remove from My Recipes' : 'Save to My Recipes'}
                className={`p-2.5 rounded-xl border transition-all ${saved ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
              >
                {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
            </div>
          )}
        </div>

        {/* Badges — formatTime handles both ISO 8601 and already-formatted strings */}
        {(recipe.prepTime || recipe.cookTime || recipe.servings) && (
          <div className="flex flex-wrap gap-2 mb-8">
            {recipe.prepTime && <Chip icon={<Clock size={13} />} label={`Prep ${formatTime(recipe.prepTime)}`} />}
            {recipe.cookTime && <Chip icon={<Clock size={13} />} label={`Cook ${formatTime(recipe.cookTime)}`} />}
            {recipe.servings && <Chip icon={<Users size={13} />} label={`${recipe.servings} servings`} />}
          </div>
        )}

        {/* Servings control */}
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

        {/* AI buttons — translate hidden on already-translated recipes */}
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

        {/* Ingredients */}
        <Section title="Ingredients">
          <ul className="space-y-1">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} onClick={() => toggleCheck(i)} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer select-none transition-all ${checked.has(i) ? 'opacity-40' : 'hover:bg-surface active:scale-[.99]'}`}>
                <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${checked.has(i) ? 'bg-accent border-accent' : 'border-border'}`}>
                  {checked.has(i) && <Check size={10} className="text-white" strokeWidth={3.5} />}
                </span>
                <span className={`text-sm leading-relaxed ${checked.has(i) ? 'line-through text-muted' : 'text-text'}`}>
                  {scaleIngredient(ing, multiplier)}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Instructions */}
        <Section title="Instructions">
          <ol className="space-y-5">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center mt-0.5 border border-accent/20">{i + 1}</span>
                <p className="text-sm leading-relaxed text-text pt-0.5">{step}</p>
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
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors mt-2">
            <ExternalLink size={12} />View original recipe
          </a>
        )}
      </article>

      {showNotes && (
        <KitchenNotesModal recipe={recipe} userId={user?.id} isSaved={saved} onClose={() => setShowNotes(false)} onSave={notes => setRecipe(r => ({ ...r, notes: notes || undefined }))} />
      )}
      {showShare       && <ShareModal url={shareUrl} onClose={() => setShowShare(false)} />}
      {showAuth        && <AuthModal onClose={() => setShowAuth(false)} />}
      {aiLoading       && <AiLoadingModal />}
      {aiError         && <AiErrorModal message={aiError} onClose={() => setAiError('')} />}
      {translateResult && <TranslateModal result={translateResult} onClose={() => setTranslateResult(null)} onApply={applyTranslation} applied={translateApplied} />}
      {substitutesResult && <SubstitutesModal result={substitutesResult} onClose={() => setSubstitutesResult(null)} onCopyToNotes={copySubstitutesToNotes} copied={substitutesCopied} />}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-bold text-text mb-4 pb-3 border-b border-border">{title}</h2>
      {children}
    </section>
  )
}
