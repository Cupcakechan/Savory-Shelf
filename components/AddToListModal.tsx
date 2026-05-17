'use client'

import { useState, useEffect } from 'react'
import { X, Plus, ListPlus, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { aggregateIntoList, type ExistingItem } from '@/lib/shopping-aggregator'

interface ShoppingListRow {
  id:   string
  name: string
}

interface Props {
  /** Ingredient strings to merge into the chosen list. */
  ingredients: string[]
  onClose:     () => void
  /** Called after a successful add with the destination list's display name. */
  onAdded:     (listName: string) => void
}

export default function AddToListModal({ ingredients, onClose, onAdded }: Props) {
  const [lists, setLists]     = useState<ShoppingListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  const [mode, setMode]       = useState<'pick' | 'create'>('pick')
  const [newName, setNewName] = useState('')

  // ── Load lists on mount ─────────────────────────────────

  useEffect(() => {
    supabase
      .from('shopping_lists')
      .select('id, name')
      .order('updated_at', { ascending: false })
      // Safety cap — matches the My Shopping Lists page.
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          const rows = (data ?? []) as ShoppingListRow[]
          setLists(rows)
          // If the user has no lists yet, jump straight to the create form.
          if (rows.length === 0) setMode('create')
        }
        setLoading(false)
      })
  }, [])

  // ── Core add operation ─────────────────────────────────

  const addToList = async (listId: string, listName: string) => {
    setSaving(true)
    setError('')
    try {
      // Fetch the current items so the aggregator knows what to merge against.
      const { data: existingData, error: fetchErr } = await supabase
        .from('shopping_list_items')
        .select('id, ingredient_name, quantity, unit, checked')
        .eq('list_id', listId)
        // Safety cap — matches the detail page; order makes truncation deterministic.
        .order('created_at', { ascending: true })
        .limit(500)
      if (fetchErr) throw fetchErr

      const existing = (existingData ?? []) as ExistingItem[]
      const { inserts, updates } = aggregateIntoList(existing, ingredients, listId)

      // Inserts go in a single batched call. Updates are one per row — typical
      // count is small (≤ a handful), so the per-row cost is fine.
      if (inserts.length > 0) {
        const { error: insErr } = await supabase
          .from('shopping_list_items')
          .insert(inserts)
        if (insErr) throw insErr
      }
      for (const u of updates) {
        const { error: updErr } = await supabase
          .from('shopping_list_items')
          .update({ quantity: u.quantity, unit: u.unit })
          .eq('id', u.id)
        if (updErr) throw updErr
      }

      // Bump the list's updated_at so it floats to the top of My Shopping Lists
      // on the next visit. Errors here are non-fatal (the actual add succeeded).
      await supabase
        .from('shopping_lists')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', listId)

      onAdded(listName)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not add to list.'
      setError(msg)
      setSaving(false)
    }
  }

  // ── Create + add ───────────────────────────────────────

  const createAndAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in to create a shopping list.')

      const id = crypto.randomUUID()
      const { error: insErr } = await supabase
        .from('shopping_lists')
        .insert({ id, user_id: user.id, name: trimmed })
      if (insErr) throw insErr

      // addToList sets saving = true again, calls onAdded on success.
      await addToList(id, trimmed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create list.'
      setError(msg)
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <div className="relative bg-bg border border-border rounded-2xl max-w-sm w-full shadow-2xl flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <ListPlus size={17} className="text-accent" />
            <h3 className="font-display text-lg font-bold text-text">Add to Shopping List</h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-xs text-muted leading-relaxed mb-5">
            Adding <span className="text-text font-semibold">{ingredients.length}</span> ingredient{ingredients.length !== 1 ? 's' : ''}.
            Matching items will be combined automatically.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted" />
            </div>
          ) : mode === 'pick' ? (
            <>
              <div className="space-y-2 mb-4">
                {lists.map(list => (
                  <button
                    key={list.id}
                    onClick={() => addToList(list.id, list.name)}
                    disabled={saving}
                    className="w-full text-left bg-surface border border-border rounded-xl px-4 py-3 hover:border-accent/40 hover:bg-surface/80 transition-all active:scale-[.99] disabled:opacity-50 disabled:cursor-not-allowed text-sm text-text font-medium"
                  >
                    {list.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMode('create')}
                disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted hover:border-accent/40 hover:text-text transition-all disabled:opacity-50"
              >
                <Plus size={14} />
                Create new list
              </button>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
                New list name
              </label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createAndAdd() }}
                placeholder="e.g. Weekly groceries"
                maxLength={80}
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-subtle outline-none focus:border-accent transition-colors mb-3"
                autoFocus
              />
              {lists.length > 0 && (
                <button
                  onClick={() => { setMode('pick'); setNewName(''); setError('') }}
                  disabled={saving}
                  className="text-xs text-muted hover:text-text underline underline-offset-2 transition-colors"
                >
                  ← Pick an existing list
                </button>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2.5 text-sm text-highlight bg-highlight/10 border border-highlight/20 rounded-xl px-4 py-3 mt-4">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer — only when creating */}
        {mode === 'create' && !loading && (
          <div className="px-6 py-5 border-t border-border flex-shrink-0">
            <button
              onClick={createAndAdd}
              disabled={!newName.trim() || saving}
              className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[.98] flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={15} className="animate-spin" />Adding…</> : 'Create & Add'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
