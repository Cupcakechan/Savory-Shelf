'use client'

import { useEffect } from 'react'
import { X, Check } from 'lucide-react'
import { CATEGORY_ORDER, CATEGORY_LABELS, type Category } from '@/lib/shopping-categorizer'

// Picker modal opened from the per-row chip on the shopping-list detail
// page. Renders one button per category, highlighting the current pick.
// Closes on outside click, Escape, X, or button press. Selection is
// reported via onPick — the parent handles persistence + optimistic update
// + rollback. We close after pick regardless of error; the parent's error
// banner surfaces failures.

interface Props {
  itemName: string
  current:  Category
  onClose:  () => void
  onPick:   (category: Category) => void
}

export default function CategoryPicker({ itemName, current, onClose, onPick }: Props) {
  // Close on Escape — matches the other modals in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-bg border border-border rounded-2xl max-w-sm w-full shadow-2xl flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-bold text-text leading-tight">
              Move to category
            </h3>
            <p className="text-xs text-muted truncate mt-1">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 p-2 sm:p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Options */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            {CATEGORY_ORDER.map(cat => {
              const isCurrent = cat === current
              return (
                <button
                  key={cat}
                  onClick={() => { onPick(cat); onClose() }}
                  className={`w-full text-left flex items-center justify-between gap-3 border rounded-xl px-4 py-3 text-sm font-medium transition-all active:scale-[.99] ${
                    isCurrent
                      ? 'bg-accent/10 border-accent text-text'
                      : 'bg-surface border-border text-text hover:border-accent/40'
                  }`}
                >
                  <span>{CATEGORY_LABELS[cat]}</span>
                  {isCurrent && <Check size={14} className="text-accent flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
