'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const MAX_PANTRY = 10

export default function MyPantryPage() {
  const router              = useRouter()
  const [user, setUser]     = useState<User | null>(null)
  const [pantry, setPantry] = useState<string[]>([])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.replace('/'); return }
      setUser(session.user)

      // Show cached staples immediately so the skeleton never appears on
      // repeat visits. The DB fetch still runs to keep data fresh.
      try {
        const cached = sessionStorage.getItem('savoryshelf-pantry')
        if (cached) { setPantry(JSON.parse(cached)); setLoading(false) }
      } catch {}

      const { data } = await supabase
        .from('pantry')
        .select('staples')
        .eq('user_id', session.user.id)
        .maybeSingle()
      const staples = data?.staples ?? []
      setPantry(staples)
      try { sessionStorage.setItem('savoryshelf-pantry', JSON.stringify(staples)) } catch {}
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = async (next: string[]) => {
    if (!user) return
    setPantry(next)
    try { sessionStorage.setItem('savoryshelf-pantry', JSON.stringify(next)) } catch {}
    // Reset match cache when staples change so Grok re-runs on next My Recipes visit
    await supabase
      .from('pantry')
      .upsert({ user_id: user.id, staples: next, match_cache: {} })
  }

  const add = () => {
    const val = input.trim().toLowerCase()
    if (!val || pantry.includes(val) || pantry.length >= MAX_PANTRY) return
    persist([...pantry, val])
    setInput('')
  }

  if (loading) {
    return (
      <div className="py-8 max-w-lg">
        <div className="h-6 w-28 bg-surface rounded-xl animate-pulse mb-8" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-surface rounded-full animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="py-8 max-w-lg">

      {/* Back */}
      <button
        onClick={() => router.push('/my-recipes')}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-8 py-2 -mx-1 px-1"
      >
        <ChevronLeft size={15} />
        Back to My Recipes
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-3xl select-none">🥬</span>
          <h1 className="font-display text-2xl font-bold text-text">My Pantry</h1>
        </div>
        <p className="text-sm text-muted leading-relaxed max-w-xs">
          Add up to {MAX_PANTRY} staple ingredients you always have on hand. Grok uses these to find Pantry Friendly recipes in your collection.
        </p>
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-2 mb-8 min-h-[3rem]">
        {pantry.length === 0 ? (
          <p className="text-sm text-subtle italic">No staples yet — add some below.</p>
        ) : (
          pantry.map(item => (
            <span
              key={item}
              className="inline-flex items-center gap-1 text-sm font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full pl-3.5 pr-2.5 py-2 capitalize"
            >
              {item}
              <button
                onClick={() => persist(pantry.filter(i => i !== item))}
                aria-label={`Remove ${item}`}
                className="ml-1 rounded-full p-0.5 hover:bg-emerald-500/20 transition-colors"
              >
                <X size={13} />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Add input */}
      {pantry.length < MAX_PANTRY ? (
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder="e.g. olive oil, butter, eggs…"
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-subtle outline-none focus:border-accent/50 transition-colors"
            autoFocus
          />
          <button
            onClick={add}
            disabled={!input.trim()}
            className="flex-shrink-0 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-5 py-3 transition-all active:scale-[.97]"
          >
            Add
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted mb-4">Maximum {MAX_PANTRY} staples reached.</p>
      )}

      {/* Counter */}
      <p className="text-xs text-subtle">{pantry.length} / {MAX_PANTRY} staples</p>

      {/* Clear all */}
      {pantry.length > 0 && (
        <button
          onClick={() => persist([])}
          className="mt-6 block text-xs text-muted hover:text-highlight transition-colors py-1.5"
        >
          Clear all staples
        </button>
      )}
    </div>
  )
}
