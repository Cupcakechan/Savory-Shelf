'use client'

import { useState, useEffect, useMemo, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Printer, Plus, Trash2, Check,
  AlertCircle, X, Loader2,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase, type DbShoppingList, type DbShoppingListItem } from '@/lib/supabase'

// Standard units shown in the per-row unit dropdown. Anything stored on a
// row outside this set is appended dynamically to that row's options.
const STANDARD_UNITS = [
  'cup', 'tbsp', 'tsp', 'fl oz',
  'ml', 'l',
  'g', 'kg',
  'oz', 'lb',
] as const

// ── Helpers ───────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatItemForPrint(item: DbShoppingListItem): string {
  const parts: string[] = []
  if (item.quantity) parts.push(item.quantity)
  if (item.unit)     parts.push(item.unit)
  parts.push(item.ingredient_name)
  return parts.join(' ')
}

// ── Skeleton ──────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-28 bg-surface rounded-xl animate-pulse" />
        <div className="h-9 w-20 bg-surface rounded-xl animate-pulse" />
      </div>
      <div className="h-9 w-2/3 bg-surface rounded-xl animate-pulse mb-3" />
      <div className="h-4 w-24 bg-surface rounded-full animate-pulse mb-8" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-surface border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ── Item row ──────────────────────────────────────────────

function ItemRow({
  item,
  onToggleChecked,
  onUpdateLocal,
  onCommitRemote,
  onDelete,
}: {
  item:           DbShoppingListItem
  onToggleChecked: (id: string) => void
  onUpdateLocal:  (id: string, fields: Partial<DbShoppingListItem>) => void
  onCommitRemote: (id: string) => void
  onDelete:       (id: string) => void
}) {
  // Include the row's existing non-standard unit (e.g. legacy "pinch") so
  // the select doesn't show a blank value for unfamiliar units.
  const unitOptions = useMemo(() => {
    const base: string[] = [...STANDARD_UNITS]
    if (item.unit && !base.includes(item.unit)) base.push(item.unit)
    return base
  }, [item.unit])

  return (
    <div className={`flex items-start gap-3 px-3.5 py-3 bg-surface border border-border rounded-2xl transition-opacity ${item.checked ? 'opacity-60' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={() => onToggleChecked(item.id)}
        aria-label={item.checked ? 'Uncheck item' : 'Check off item'}
        className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          item.checked
            ? 'bg-accent border-accent'
            : 'border-border hover:border-accent/60'
        }`}
      >
        {item.checked && <Check size={13} className="text-white" strokeWidth={3.5} />}
      </button>

      {/* Name + edit row */}
      <div className="flex-1 min-w-0">
        <p className={`text-base leading-snug break-words ${item.checked ? 'line-through text-muted' : 'text-text'}`}>
          {item.ingredient_name}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            inputMode="decimal"
            value={item.quantity ?? ''}
            onChange={e => onUpdateLocal(item.id, { quantity: e.target.value || null })}
            onBlur={() => onCommitRemote(item.id)}
            placeholder="qty"
            className="w-16 text-sm text-text bg-bg border border-border focus:border-accent rounded-lg px-2 py-1.5 text-right outline-none transition-colors"
          />
          <select
            value={item.unit ?? ''}
            onChange={e => {
              onUpdateLocal(item.id, { unit: e.target.value || null })
              // Selects don't fire blur consistently across browsers; commit immediately.
              setTimeout(() => onCommitRemote(item.id), 0)
            }}
            className="w-24 text-sm text-text bg-bg border border-border focus:border-accent rounded-lg px-2 py-1.5 outline-none transition-colors"
          >
            <option value="">(no unit)</option>
            {unitOptions.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        aria-label="Delete item"
        title="Delete item"
        className="mt-0.5 p-2 rounded-lg text-muted hover:text-highlight hover:bg-bg/80 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function ShoppingListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [list, setList]       = useState<DbShoppingList | null>(null)
  const [items, setItems]     = useState<DbShoppingListItem[]>([])
  const [error, setError]     = useState('')

  // Name-edit state
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput]     = useState('')
  const nameInputRef                  = useRef<HTMLInputElement>(null)

  // Add-custom-item form state
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addQty, setAddQty]   = useState('')
  const [addUnit, setAddUnit] = useState('')

  // ── Initial load ────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.replace('/'); return }
      setUser(session.user)

      const [listRes, itemsRes] = await Promise.all([
        supabase.from('shopping_lists')
          .select('id, user_id, name, created_at, updated_at')
          .eq('id', id)
          .maybeSingle(),
        supabase.from('shopping_list_items')
          .select('id, list_id, ingredient_name, quantity, unit, checked, created_at, updated_at')
          .eq('list_id', id)
          .order('created_at', { ascending: true }),
      ])

      if (listRes.error)  setError(listRes.error.message)
      if (itemsRes.error) setError(itemsRes.error.message)

      if (listRes.data)  setList(listRes.data as DbShoppingList)
      if (itemsRes.data) setItems(itemsRes.data as DbShoppingListItem[])

      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Focus the name input when entering edit mode.
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  // ── Derived ─────────────────────────────────────────────

  // Unchecked first, then checked. Stable ordering by created_at within each group.
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1
      return (a.created_at ?? '').localeCompare(b.created_at ?? '')
    }),
    [items],
  )

  const checkedCount = useMemo(
    () => items.reduce((n, i) => n + (i.checked ? 1 : 0), 0),
    [items],
  )

  // ── Name edit handlers ──────────────────────────────────

  const startNameEdit = () => {
    if (!list) return
    setNameInput(list.name)
    setEditingName(true)
  }

  const commitNameEdit = async () => {
    if (!list) { setEditingName(false); return }
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === list.name) {
      setEditingName(false)
      return
    }

    const previous = list
    const now = new Date().toISOString()
    setList({ ...list, name: trimmed, updated_at: now })
    setEditingName(false)

    const { error } = await supabase
      .from('shopping_lists')
      .update({ name: trimmed, updated_at: now })
      .eq('id', id)
    if (error) {
      setList(previous)
      setError(error.message)
    }
  }

  // ── Item handlers ───────────────────────────────────────

  const toggleChecked = async (itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const next = !item.checked
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, checked: next } : it))

    const { error } = await supabase
      .from('shopping_list_items')
      .update({ checked: next, updated_at: new Date().toISOString() })
      .eq('id', itemId)
    if (error) {
      // Roll back the optimistic flip
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, checked: !next } : it))
      setError(error.message)
    }
  }

  // Local-only update — keeps the input/select responsive between keystrokes.
  // The matching commit (onBlur for inputs, immediately for selects) writes
  // the current state to Supabase.
  const updateItemLocal = (itemId: string, fields: Partial<DbShoppingListItem>) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...fields } : it))
  }

  const commitItemRemote = async (itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const { error } = await supabase
      .from('shopping_list_items')
      .update({
        quantity:   item.quantity,
        unit:       item.unit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
    if (error) setError(error.message)
  }

  const deleteItem = async (itemId: string) => {
    const previous = items
    setItems(prev => prev.filter(i => i.id !== itemId))
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('id', itemId)
    if (error) {
      setItems(previous)
      setError(error.message)
    }
  }

  const addCustomItem = async () => {
    const trimmed = addName.trim()
    if (!trimmed) return

    const newId = crypto.randomUUID()
    const now   = new Date().toISOString()
    const optimistic: DbShoppingListItem = {
      id:              newId,
      list_id:         id,
      ingredient_name: trimmed,
      quantity:        addQty.trim() || null,
      unit:            addUnit || null,
      checked:         false,
      created_at:      now,
      updated_at:      now,
    }
    setItems(prev => [...prev, optimistic])
    setAddName('')
    setAddQty('')
    setAddUnit('')
    setShowAdd(false)

    const { error } = await supabase
      .from('shopping_list_items')
      .insert({
        id:              newId,
        list_id:         id,
        ingredient_name: trimmed,
        quantity:        optimistic.quantity,
        unit:            optimistic.unit,
      })
    if (error) {
      setItems(prev => prev.filter(i => i.id !== newId))
      setError(error.message)
    }
  }

  // ── Print ───────────────────────────────────────────────

  const printList = () => {
    if (!list) return
    const win = window.open('', '_blank', 'width=720,height=900')
    if (!win) {
      setError('Popup blocked — please allow popups to print this list.')
      return
    }

    // sortedItems is already in display order — keep print order matching.
    const itemRows = sortedItems.map(item => {
      const text = formatItemForPrint(item)
      return `<li class="${item.checked ? 'done' : ''}"><span class="box"></span><span class="text">${escapeHtml(text)}</span></li>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(list.name)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 40px 32px;
    max-width: 720px;
    line-height: 1.4;
  }
  h1 { font-size: 36px; margin: 0 0 8px 0; font-weight: 700; }
  .meta { color: #555; font-size: 13px; margin: 0 0 28px 0; padding-bottom: 16px; border-bottom: 1px solid #ddd; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: flex-start; gap: 14px; padding: 12px 0; border-bottom: 1px solid #eee; font-size: 18px; }
  .box {
    display: inline-block;
    width: 20px; height: 20px;
    border: 2px solid #444;
    border-radius: 4px;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .text { flex: 1; }
  .done { color: #888; }
  .done .text { text-decoration: line-through; }
  .done .box { background: #444; position: relative; }
  .done .box::after {
    content: '';
    position: absolute;
    top: 3px; left: 6px;
    width: 4px; height: 9px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  @media print {
    body { padding: 0.5in; max-width: none; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(list.name)}</h1>
  <p class="meta">${items.length} item${items.length !== 1 ? 's' : ''} · ${escapeHtml(new Date().toLocaleDateString())}</p>
  ${items.length === 0
    ? '<p style="font-style: italic; color: #888;">No items in this list.</p>'
    : `<ul>${itemRows}</ul>`}
</body>
</html>`

    win.document.write(html)
    win.document.close()
    win.focus()
    // Slight delay so layout settles before print dialog fires.
    setTimeout(() => win.print(), 100)
  }

  // ── Render ──────────────────────────────────────────────

  if (loading) return <DetailSkeleton />

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center px-4">
        <span className="text-5xl mb-5 select-none">🛒</span>
        <h2 className="font-display text-2xl font-bold text-text mb-2">List not found</h2>
        <p className="text-sm text-muted mb-6 max-w-xs leading-relaxed">
          This shopping list may have been deleted or doesn&apos;t exist.
        </p>
        <Link href="/shopping-list" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <ChevronLeft size={14} />
          Back to My Shopping Lists
        </Link>
      </div>
    )
  }

  return (
    <div className="py-8 pb-20">

      {/* Top bar — Back + Print */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <button
          onClick={() => router.push('/shopping-list')}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors py-2 -mx-1 px-1"
        >
          <ChevronLeft size={16} />
          Back to Lists
        </button>
        <button
          onClick={printList}
          className="flex items-center gap-2 bg-surface border border-border hover:border-accent/50 text-text text-sm font-semibold rounded-xl px-4 py-2 transition-colors active:scale-[.98]"
        >
          <Printer size={15} />
          Print List
        </button>
      </div>

      {/* Title (click to edit) */}
      {editingName ? (
        <input
          ref={nameInputRef}
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={commitNameEdit}
          onKeyDown={e => {
            if (e.key === 'Enter')  commitNameEdit()
            if (e.key === 'Escape') setEditingName(false)
          }}
          maxLength={80}
          className="w-full font-display text-2xl md:text-3xl font-bold text-text bg-transparent border-b-2 border-accent outline-none mb-2 leading-tight"
        />
      ) : (
        <h1
          onClick={startNameEdit}
          title="Click to rename"
          className="font-display text-2xl md:text-3xl font-bold text-text leading-tight mb-2 cursor-pointer hover:text-accent transition-colors"
        >
          {list.name}
        </h1>
      )}
      <p className="text-sm text-muted mb-8">
        {items.length} item{items.length !== 1 ? 's' : ''}
        {checkedCount > 0 && (
          <> · <span className="text-emerald-500/80 font-medium">{checkedCount} checked</span></>
        )}
      </p>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 text-sm text-highlight bg-highlight/10 border border-highlight/20 rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-muted hover:text-text transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Items */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-surface border border-border rounded-2xl mb-6">
          <span className="text-4xl mb-4 select-none">🛒</span>
          <h2 className="font-display text-lg font-bold text-text mb-1">No items yet</h2>
          <p className="text-sm text-muted max-w-xs leading-relaxed">
            Add ingredients from a recipe&apos;s Shopping Mode, or use the button below to add a custom item.
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {sortedItems.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              onToggleChecked={toggleChecked}
              onUpdateLocal={updateItemLocal}
              onCommitRemote={commitItemRemote}
              onDelete={deleteItem}
            />
          ))}
        </div>
      )}

      {/* Add custom item */}
      {showAdd ? (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-2">
            New item
          </label>
          <input
            type="text"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCustomItem() }}
            placeholder="Ingredient name"
            maxLength={120}
            autoFocus
            className="w-full bg-bg border border-border focus:border-accent rounded-xl px-4 py-3 text-sm text-text placeholder:text-subtle outline-none transition-colors mb-3"
          />
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              inputMode="decimal"
              value={addQty}
              onChange={e => setAddQty(e.target.value)}
              placeholder="qty"
              className="w-20 bg-bg border border-border focus:border-accent rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-subtle outline-none transition-colors text-right"
            />
            <select
              value={addUnit}
              onChange={e => setAddUnit(e.target.value)}
              className="flex-1 bg-bg border border-border focus:border-accent rounded-xl px-3 py-2.5 text-sm text-text outline-none transition-colors"
            >
              <option value="">(no unit)</option>
              {STANDARD_UNITS.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); setAddName(''); setAddQty(''); setAddUnit('') }}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-text hover:border-accent/40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addCustomItem}
              disabled={!addName.trim()}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[.98] flex items-center justify-center gap-1.5"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-dashed border-border text-sm font-medium text-muted hover:border-accent/40 hover:text-text transition-all active:scale-[.99]"
        >
          <Plus size={14} />
          Add Custom Item
        </button>
      )}
    </div>
  )
}
