'use client'

import { useState, useEffect } from 'react'
import {
  Clock,
  Users,
  Check,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ExternalLink,
  Pencil,
  Minus,
  Plus,
  Languages,
  Sparkles,
  X,
} from 'lucide-react'
import { Recipe } from '@/lib/types'
import EditModal from './EditModal'

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

// ── Coming Soon Modal ─────────────────────────────────────

function ComingSoonModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <X size={16} />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-5">
          <Sparkles size={26} className="text-accent" />
        </div>
        <h3 className="font-display text-xl font-bold text-text mb-3">
          Coming in the next update
        </h3>
        <p className="text-sm text-muted leading-relaxed mb-7">
          AI-powered translation &amp; smart ingredient substitutes are on the way!
          We'll use an LLM to translate the entire recipe into English and suggest
          easy local swaps for hard-to-find ingredients.
        </p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 active:scale-[.98] transition-all"
        >
          Can't wait!
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────

interface Props {
  recipe: Recipe
  onBack?: () => void
}

export default function RecipeView({ recipe: initialRecipe, onBack }: Props) {
  const [recipe, setRecipe] = useState(initialRecipe)
  const baseServings = recipe.servings ?? 4
  const [servings, setServings] = useState(baseServings)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [saved, setSaved] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showComingSoon, setShowComingSoon] = useState(false)

  useEffect(() => {
    const stored: Recipe[] = JSON.parse(localStorage.getItem('savoryshelf-recipes') ?? '[]')
    setSaved(stored.some((r) => r.id === recipe.id))
  }, [recipe.id])

  const multiplier = servings / baseServings

  const toggleCheck = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const toggleSave = () => {
    const stored: Recipe[] = JSON.parse(localStorage.getItem('savoryshelf-recipes') ?? '[]')
    if (saved) {
      localStorage.setItem('savoryshelf-recipes', JSON.stringify(stored.filter((r) => r.id !== recipe.id)))
      setSaved(false)
    } else {
      localStorage.setItem('savoryshelf-recipes', JSON.stringify([{ ...recipe, savedAt: new Date().toISOString() }, ...stored]))
      setSaved(true)
    }
  }

  const handleEditSave = (updated: Recipe) => {
    setRecipe(updated)
    setServings(updated.servings ?? baseServings)
    setChecked(new Set())
  }

  return (
    <>
      <article className="pb-20">
        {/* Back */}
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mt-6 mb-2">
            <ChevronLeft size={16} />
            Back
          </button>
        )}

        {/* Hero image */}
        {recipe.image && (
          <div className="w-full aspect-[16/9] rounded-2xl overflow-hidden mt-6 mb-7 bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-text leading-tight flex-1">
            {recipe.title}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-shrink-0">
            <button onClick={() => setShowEdit(true)} title="Edit recipe" className="p-2.5 rounded-xl border border-border text-muted hover:border-accent/40 hover:text-accent transition-all">
              <Pencil size={16} />
            </button>
            <button onClick={toggleSave} title={saved ? 'Remove from My Recipes' : 'Save to My Recipes'} className={`p-2.5 rounded-xl border transition-all ${saved ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
              {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
          </div>
        </div>

        {/* Badges */}
        {(recipe.prepTime || recipe.cookTime || recipe.servings) && (
          <div className="flex flex-wrap gap-2 mb-8">
            {recipe.prepTime && <Chip icon={<Clock size={13} />} label={`Prep ${recipe.prepTime}`} />}
            {recipe.cookTime && <Chip icon={<Clock size={13} />} label={`Cook ${recipe.cookTime}`} />}
            {recipe.servings && <Chip icon={<Users size={13} />} label={`${recipe.servings} servings`} />}
          </div>
        )}

        {/* ── Servings control ── */}
        {recipe.servings && (
          <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-4">
            <div className="flex items-stretch min-h-[6rem]">
              <button
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                disabled={servings <= 1}
                aria-label="Decrease servings"
                className="w-24 flex items-center justify-center border-r border-border text-muted hover:bg-border/40 hover:text-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors active:bg-border"
              >
                <Minus size={28} strokeWidth={2} />
              </button>
              <div className="flex-1 flex flex-col items-center justify-center py-4 gap-1">
                <span className="font-display text-4xl font-bold text-text leading-none">
                  {servings}
                  <span className="text-2xl font-semibold text-muted ml-2">
                    serving{servings !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="text-xs text-subtle">
                  (original: {baseServings} serving{baseServings !== 1 ? 's' : ''})
                </span>
                {servings !== baseServings && (
                  <button onClick={() => setServings(baseServings)} className="text-xs text-accent hover:underline mt-1 transition-colors">
                    Reset to original
                  </button>
                )}
              </div>
              <button
                onClick={() => setServings((s) => s + 1)}
                aria-label="Increase servings"
                className="w-24 flex items-center justify-center border-l border-border text-muted hover:bg-border/40 hover:text-text transition-colors active:bg-border"
              >
                <Plus size={28} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {/* ── AI feature buttons ── */}
        <div className="flex gap-3 mb-9">
          <button onClick={() => setShowComingSoon(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:border-accent/40 hover:text-text transition-all active:scale-[.98]">
            <Languages size={15} />
            Translate to English
          </button>
          <button onClick={() => setShowComingSoon(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:border-accent/40 hover:text-text transition-all active:scale-[.98]">
            <Sparkles size={15} />
            Suggest Substitutes
          </button>
        </div>

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
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center mt-0.5 border border-accent/20">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-text pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Notes */}
        {recipe.notes && (
          <Section title="Notes">
            <p className="text-sm leading-relaxed text-text whitespace-pre-wrap">{recipe.notes}</p>
          </Section>
        )}

        {/* Source link */}
        {recipe.sourceUrl && (
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors mt-2">
            <ExternalLink size={12} />
            View original recipe
          </a>
        )}
      </article>

      {showEdit && <EditModal recipe={recipe} onClose={() => setShowEdit(false)} onSave={handleEditSave} />}
      {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
    </>
  )
}

// ── Small shared components ───────────────────────────────

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted bg-surface border border-border rounded-full px-3 py-1.5">
      {icon}
      {label}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-bold text-text mb-4 pb-3 border-b border-border">
        {title}
      </h2>
      {children}
    </section>
  )
}
