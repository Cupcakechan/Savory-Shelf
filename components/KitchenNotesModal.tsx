'use client'

import { useState } from 'react'
import { X, NotebookPen } from 'lucide-react'
import { Recipe } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface Props {
  recipe: Recipe
  userId?: string
  isSaved: boolean
  onClose: () => void
  onSave: (notes: string) => void
}

export default function KitchenNotesModal({ recipe, userId, isSaved, onClose, onSave }: Props) {
  const [notes, setNotes]   = useState(recipe.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    if (userId && isSaved) {
      await supabase
        .from('recipes')
        .update({ notes: notes.trim() || null })
        .eq('id', recipe.id)
    }
    onSave(notes.trim())
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-bg border border-border rounded-t-2xl sm:rounded-2xl p-6 max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <NotebookPen size={17} className="text-accent" />
            <h2 className="font-display text-lg font-bold text-text">My Kitchen Notes</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Read-only recipe summary */}
        <div className="bg-surface border border-border rounded-xl p-4 mb-5">
          <p className="font-display font-semibold text-text text-sm mb-1.5 leading-snug">{recipe.title}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            {recipe.prepTime  && <span>Prep: {recipe.prepTime}</span>}
            {recipe.cookTime  && <span>Cook: {recipe.cookTime}</span>}
            {recipe.servings  && <span>{recipe.servings} servings</span>}
          </div>
        </div>

        {/* Notes textarea */}
        <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
          Your Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={8}
          placeholder="Substitutions I used, tweaks, timing notes, etc."
          className="input resize-none mb-4"
          autoFocus
        />

        {/* Hint if notes won't persist */}
        {(!userId || !isSaved) && (
          <p className="text-xs text-muted italic mb-4">
            {!userId ? 'Sign in to save notes permanently.' : 'Save this recipe first to persist your notes.'}
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-text hover:border-accent/40 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 active:scale-[.98] transition-all"
          >
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  )
}
