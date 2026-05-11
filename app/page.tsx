'use client'

import { useState, useTransition } from 'react'
import { Link2, Loader2, AlertCircle } from 'lucide-react'
import { importRecipe } from '@/lib/actions'
import { Recipe } from '@/lib/types'
import RecipeView from '@/components/RecipeView'

const EXAMPLE_URLS = [
  'https://www.allrecipes.com/recipe/…',
  'https://www.seriouseats.com/…',
  'https://www.bonappetit.com/recipe/…',
]

export default function ImportPage() {
  const [url, setUrl] = useState('')
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleImport = () => {
    if (!url.trim()) return
    setError('')
    startTransition(async () => {
      const result = await importRecipe(url.trim())
      if (result.error) {
        setError(result.error)
      } else if (result.recipe) {
        setRecipe(result.recipe)
      }
    })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleImport()
  }

  // ── Recipe view (post-import) ──────────────────────────
  if (recipe) {
    return (
      <RecipeView
        recipe={recipe}
        onBack={() => {
          setRecipe(null)
          setUrl('')
        }}
      />
    )
  }

  // ── Import form ────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12">
      {/* Wordmark */}
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-text mb-3">
          Cook it your way.
        </h1>
        <p className="text-muted text-base max-w-xs mx-auto leading-relaxed">
          Paste any recipe URL and get a clean, scalable, distraction-free view.
        </p>
      </div>

      {/* Input card */}
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <label className="block text-xs font-semibold text-muted uppercase tracking-widest mb-3">
          Recipe URL
        </label>

        <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-4 py-3 focus-within:border-accent transition-colors mb-4">
          <Link2 size={16} className="text-muted flex-shrink-0" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKey}
            placeholder={EXAMPLE_URLS[0]}
            className="flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none min-w-0"
            autoFocus
          />
        </div>

        <button
          onClick={handleImport}
          disabled={isPending || !url.trim()}
          className="w-full flex items-center justify-center gap-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl py-3.5 transition-all active:scale-[.98]"
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Importing recipe…
            </>
          ) : (
            'Import Recipe'
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 text-sm text-highlight bg-highlight/10 border border-highlight/20 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="mt-6 text-xs text-subtle text-center">
        Works best with sites that use structured recipe data (AllRecipes, Serious Eats, NYT Cooking, etc.)
      </p>
    </div>
  )
}
