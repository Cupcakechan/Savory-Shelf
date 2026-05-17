'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, AlertCircle, ChevronRight } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────

interface ShoppingList {
  id:         string
  name:       string
  created_at: string | null
  updated_at: string | null
  itemCount:  number
}

// PostgREST embedded-aggregate shape: `shopping_list_items(count)` returns
// the count nested as an array with a single object.
interface ListRow {
  id:                  string
  name:                string
  created_at:          string | null
  updated_at:          string | null
  shopping_list_items: { count: number }[] | null
}

// ── Helpers ───────────────────────────────────────────────

function formatUpdated(iso: string | null): string {
  if (!iso) return 'just now'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}

// ── Skeleton ──────────────────────────────────────────────

function ShoppingListsSkeleton() {
  return (
    <div className="py-8">
      <div className="flex items-baseline justify-between mb-6 gap-4">
        <div className="h-8 w-48 bg-surface rounded-xl animate-pulse" />
        <div className="h-9 w-28 bg-surface rounded-xl animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-5 animate-pulse">
            <div className="h-5 bg-border rounded-full w-3/4 mb-3" />
            <div className="h-3 bg-border rounded-full w-1/3 mb-2" />
            <div className="h-3 bg-border rounded-full w-1/2 mb-5" />
            <div className="h-8 bg-border rounded-xl w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Name input modal (used for both Create and Rename) ────

function NameModal({
  title,
  initialValue = '',
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string
  initialValue?: string
  submitLabel: string
  onSubmit: (name: string) => void | Promise<void>
  onClose: () => void
}) {
  const [name, setName]     = useState(initialValue)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    await onSubmit(trimmed)
    // Parent closes the modal; nothing to clean up here.
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <X size={16} />
        </button>
        <h3 className="font-display text-xl font-bold text-text mb-1">{title}</h3>
        <p className="text-sm text-muted mb-5 leading-relaxed">
          Give your list a memorable name — e.g. &ldquo;Weekly groceries&rdquo; or &ldquo;Sunday roast&rdquo;.
        </p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  submit()
            if (e.key === 'Escape') onClose()
          }}
          placeholder="List name"
          className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-subtle outline-none focus:border-accent transition-colors mb-5"
          autoFocus
          maxLength={80}
        />
        <button
          onClick={submit}
          disabled={!name.trim() || saving}
          className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[.98]"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

// ── List card ─────────────────────────────────────────────

function ListCard({
  list,
  onOpen,
  onRename,
  onDelete,
}: {
  list:     ShoppingList
  onOpen:   () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div className="relative bg-surface border border-border rounded-2xl p-5 hover:border-accent/40 hover:shadow-md transition-all duration-200">
      {/* Top-right icon cluster */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          onClick={onRename}
          title="Rename list"
          aria-label="Rename list"
          className="p-2 rounded-lg text-muted hover:text-accent hover:bg-bg/80 transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          title="Delete list"
          aria-label="Delete list"
          className="p-2 rounded-lg text-muted hover:text-highlight hover:bg-bg/80 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <h3 className="font-display font-bold text-lg text-text leading-tight mb-3 pr-20 line-clamp-2">
        {list.name}
      </h3>

      <div className="text-xs leading-relaxed space-y-0.5 mb-5">
        <p className="text-muted">
          {list.itemCount} {list.itemCount === 1 ? 'item' : 'items'}
        </p>
        <p className="text-subtle">Updated {formatUpdated(list.updated_at)}</p>
      </div>

      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 border border-accent/20 hover:bg-accent/15 rounded-xl px-3.5 py-2 transition-colors active:scale-[.98]"
      >
        Open
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function ShoppingListsPage() {
  const router = useRouter()

  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [lists, setLists]     = useState<ShoppingList[]>([])
  const [error, setError]     = useState('')

  const [showCreate, setShowCreate]     = useState(false)
  const [renameTarget, setRenameTarget] = useState<ShoppingList | null>(null)

  // ── Initial load ────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.replace('/'); return }
      setUser(session.user)

      // PostgREST embedded aggregate — one round-trip for lists + item counts.
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('id, name, created_at, updated_at, shopping_list_items(count)')
        .order('updated_at', { ascending: false })
        // Safety cap — 100 active lists is workflow-broken territory.
        .limit(100)

      if (error) {
        setError(error.message)
      } else if (data) {
        const rows = data as unknown as ListRow[]
        setLists(rows.map(row => ({
          id:         row.id,
          name:       row.name,
          created_at: row.created_at,
          updated_at: row.updated_at,
          itemCount:  row.shopping_list_items?.[0]?.count ?? 0,
        })))
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── CRUD ────────────────────────────────────────────────

  const createList = async (name: string) => {
    if (!user) return
    const id  = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimistic: ShoppingList = {
      id,
      name,
      created_at: now,
      updated_at: now,
      itemCount:  0,
    }
    setLists(prev => [optimistic, ...prev])
    setShowCreate(false)

    const { error } = await supabase
      .from('shopping_lists')
      .insert({ id, user_id: user.id, name })

    if (error) {
      // Roll back optimistic insert and surface the error.
      setLists(prev => prev.filter(l => l.id !== id))
      setError(error.message)
    }
  }

  const renameList = async (id: string, name: string) => {
    const previous = lists.find(l => l.id === id)
    if (!previous) return

    const now = new Date().toISOString()
    setLists(prev => prev.map(l => l.id === id ? { ...l, name, updated_at: now } : l))
    setRenameTarget(null)

    const { error } = await supabase
      .from('shopping_lists')
      .update({ name, updated_at: now })
      .eq('id', id)

    if (error) {
      // Roll back to the previous row state.
      setLists(prev => prev.map(l => l.id === id ? previous : l))
      setError(error.message)
    }
  }

  const deleteList = async (list: ShoppingList) => {
    if (!confirm(`Delete "${list.name}" and all its items?`)) return

    setLists(prev => prev.filter(l => l.id !== list.id))

    const { error } = await supabase
      .from('shopping_lists')
      .delete()
      .eq('id', list.id)

    if (error) {
      // Restore the deleted list at its natural position (sorted by updated_at desc).
      setLists(prev => [list, ...prev].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      ))
      setError(error.message)
    }
  }

  // The detail route /shopping-list/[id] is added in a follow-up task.
  // Wiring the click now means no further edits to this file when it lands.
  const openList = (id: string) => router.push(`/shopping-list/${id}`)

  // ── Render ──────────────────────────────────────────────

  if (loading) return <ShoppingListsSkeleton />

  return (
    <div className="py-8">

      {/* Header */}
      <div className="flex items-baseline justify-between mb-6 gap-4">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-text leading-tight">
          My Shopping Lists
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-xl px-3.5 py-2 sm:py-2.5 transition-all active:scale-[.98]"
        >
          <Plus size={15} strokeWidth={2.5} />
          New List
        </button>
      </div>

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

      {/* Content */}
      {lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-6 select-none">🛒</span>
          <h2 className="font-display text-xl font-bold text-text mb-2">No shopping lists yet</h2>
          <p className="text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Create your first list to start tracking what you need to buy.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all"
          >
            <Plus size={16} strokeWidth={2.5} />
            Create your first list
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {lists.map(list => (
            <ListCard
              key={list.id}
              list={list}
              onOpen={()   => openList(list.id)}
              onRename={() => setRenameTarget(list)}
              onDelete={() => deleteList(list)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <NameModal
          title="New Shopping List"
          submitLabel="Create"
          onSubmit={createList}
          onClose={() => setShowCreate(false)}
        />
      )}
      {renameTarget && (
        <NameModal
          title="Rename List"
          initialValue={renameTarget.name}
          submitLabel="Save"
          onSubmit={name => renameList(renameTarget.id, name)}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  )
}
