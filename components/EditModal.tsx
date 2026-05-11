'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Recipe } from '@/lib/types'

interface Props {
  recipe: Recipe
  onClose: () => void
  onSave: (updated: Recipe) => void
}

export default function EditModal({ recipe, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    title:        recipe.title,
    prepTime:     recipe.prepTime  ?? '',
    cookTime:     recipe.cookTime  ?? '',
    servings:     String(recipe.servings ?? ''),
    ingredients:  recipe.ingredients.join('\n'),
    instructions: recipe.instructions.join('\n'),
    notes:        recipe.notes ?? '',
  })

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSave = () => {
    const updated: Recipe = {
      ...recipe,
      title:        form.title.trim() || recipe.title,
      prepTime:     form.prepTime.trim()  || undefined,
      cookTime:     form.cookTime.trim()  || undefined,
      servings:     parseInt(form.servings) || recipe.servings,
      ingredients:  form.ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
      instructions: form.instructions.split('\n').map((s) => s.trim()).filter(Boolean),
      notes:        form.notes.trim() || undefined,
    }

    // Persist to localStorage if this recipe is saved there
    try {
      const stored: Recipe[] = JSON.parse(
        localStorage.getItem('savoryshelf-recipes') ?? '[]',
      )
      const idx = stored.findIndex((r) => r.id === recipe.id)
      if (idx >= 0) {
        stored[idx] = updated
        localStorage.setItem('savoryshelf-recipes', JSON.stringify(stored))
      }
    } catch { /* quota error — silently skip */ }

    onSave(updated)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-lg bg-bg border border-border rounded-t-2xl sm:rounded-2xl p-6 max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-bold text-text">Edit Recipe</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <Field label="Title">
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              className="input"
            />
          </Field>

          {/* Time + servings row */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Prep time">
              <input
                type="text"
                value={form.prepTime}
                onChange={set('prepTime')}
                className="input"
                placeholder="30m"
              />
            </Field>
            <Field label="Cook time">
              <input
                type="text"
                value={form.cookTime}
                onChange={set('cookTime')}
                className="input"
                placeholder="1h"
              />
            </Field>
            <Field label="Servings">
              <input
                type="number"
                min={1}
                value={form.servings}
                onChange={set('servings')}
                className="input"
                placeholder="4"
              />
            </Field>
          </div>

          {/* Ingredients */}
          <Field label="Ingredients — one per line">
            <textarea
              value={form.ingredients}
              onChange={set('ingredients')}
              rows={8}
              className="input resize-none"
            />
          </Field>

          {/* Instructions */}
          <Field label="Instructions — one step per line">
            <textarea
              value={form.instructions}
              onChange={set('instructions')}
              rows={8}
              className="input resize-none"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              className="input resize-none"
              placeholder="Storage tips, variations, substitutions…"
            />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-text hover:border-accent/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 active:scale-[.98] transition-all"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
