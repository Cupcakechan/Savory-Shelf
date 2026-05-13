'use client'

import { useState, useTransition } from 'react'
import { Link2, Loader2, AlertCircle, ClipboardPaste, ChevronLeft } from 'lucide-react'
import { importRecipe } from '@/lib/actions'
import { Recipe } from '@/lib/types'
import RecipeView from '@/components/RecipeView'

const EXAMPLE_URLS = [
  'https://www.allrecipes.com/recipe/…',
  'https://www.seriouseats.com/…',
  'https://www.bonappetit.com/recipe/…',
]

// ── Manual paste form ─────────────────────────────────────

interface ManualFormProps {
  onRecipe: (r: Recipe) => void
  onCancel: () => void
}

function ManualPasteForm({ onRecipe, onCancel }: ManualFormProps) {
  const [title, setTitle]               = useState('')
  const [ingredientsText, setIngredients] = useState('')
  const [instructionsText, setInstructions] = useState('')
  const [servings, setServings]         = useState('')
  const [prepTime, setPrepTime]         = useState('')
  const [cookTime, setCookTime]         = useState('')
  const [formError, setFormError]       = useState('')

  const handleSubmit = () => {
    const trimmedTitle = title.trim()
    const ingredients  = ingredientsText.split('\n').map(s => s.trim()).filter(Boolean)

    if (!trimmedTitle)       { setFormError('Please enter a recipe title.'); return }
    if (!ingredients.length) { setFormError('Please add at least one ingredient.'); return }

    const instructions = instructionsText.split('\n').map(s => s.trim()).filter(Boolean)
    const parsedServings = servings.trim() ? parseInt(servings.trim()) : undefined

    const recipe: Recipe = {
      id:           crypto.randomUUID(),
      title:        trimmedTitle,
      ingredients,
      instructions,
      servings:     !isNaN(parsedServings ?? NaN) ? parsedServings : undefined,
      prepTime:     prepTime.trim()  || undefined,
      cookTime:     cookTime.trim()  || undefined,
    }

    onRecipe(recipe)
  }

  const fieldCls = 'w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-subtle outline-none focus:border-accent transition-colors'
  const labelCls = 'block text-xs font-semibold text-muted uppercase tracking-widest mb-2'

  return (
    <div className="w-full max-w-lg">
      {/* Back link */}
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-6"
      >
        <ChevronLeft size={15} />
        Back to import
      </button>

      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <h2 className="font-display text-xl font-bold text-text mb-1">Paste Recipe Manually</h2>
          <p className="text-sm text-muted">Fill in what you have — only title and ingredients are required.</p>
        </div>

        {/* Title */}
        <div>
          <label className={labelCls}>Recipe Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Grandma's Chicken Soup"
            className={fieldCls}
            autoFocus
          />
        </div>

        {/* Ingredients */}
        <div>
          <label className={labelCls}>Ingredients * <span className="normal-case font-normal text-subtle">(one per line)</span></label>
          <textarea
            value={ingredientsText}
            onChange={e => setIngredients(e.target.value)}
            placeholder={"2 cups flour\n1 tsp salt\n3 eggs"}
            rows={6}
            className={`${fieldCls} resize-none leading-relaxed`}
          />
        </div>

        {/* Instructions */}
        <div>
          <label className={labelCls}>Instructions <span className="normal-case font-normal text-subtle">(one step per line, optional)</span></label>
          <textarea
            value={instructionsText}
            onChange={e => setInstructions(e.target.value)}
            placeholder={"Mix dry ingredients.\nAdd eggs and stir until combined.\nBake at 180°C for 30 min."}
            rows={5}
            className={`${fieldCls} resize-none leading-relaxed`}
          />
        </div>

        {/* Servings / Prep / Cook — compact row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Servings</label>
            <input
              type="number"
              min={1}
              value={servings}
              onChange={e => setServings(e.target.value)}
              placeholder="4"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Prep Time</label>
            <input
              type="text"
              value={prepTime}
              onChange={e => setPrepTime(e.target.value)}
              placeholder="15 min"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Cook Time</label>
            <input
              type="text"
              value={cookTime}
              onChange={e => setCookTime(e.target.value)}
              placeholder="1 hr"
              className={fieldCls}
            />
          </div>
        </div>

        {/* Form error */}
        {formError && (
          <div className="flex items-center gap-2 text-sm text-highlight bg-highlight/10 border border-highlight/20 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="flex-shrink-0" />
            {formError}
          </div>
        )}

        <button
          onClick={handleSubmit}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white font-semibold text-sm rounded-xl py-3.5 transition-all active:scale-[.98]"
        >
          <ClipboardPaste size={16} />
          Preview Recipe
        </button>
      </div>
    </div>
  )
}

// ── Import page ───────────────────────────────────────────

export default function ImportPage() {
  const [url, setUrl]           = useState('')
  const [recipe, setRecipe]     = useState<Recipe | null>(null)
  const [error, setError]       = useState('')
  const [showManual, setShowManual] = useState(false)
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

  // Detect scraping-block errors specifically
  const isBlockError = error.toLowerCase().includes('blocks automatic import') ||
                       error.toLowerCase().includes('prevents automatic import')

  // ── Recipe view (post-import or manual entry) ──────────
  if (recipe) {
    return (
      <RecipeView
        recipe={recipe}
        onBack={() => {
          setRecipe(null)
          setUrl('')
          setShowManual(false)
        }}
      />
    )
  }

  // ── Manual paste form ──────────────────────────────────
  if (showManual) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12">
        <ManualPasteForm
          onRecipe={setRecipe}
          onCancel={() => setShowManual(false)}
        />
      </div>
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
            onChange={e => setUrl(e.target.value)}
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

        {/* ── Error state ───────────────────────────────── */}
        {error && (
          <div className="mt-4 space-y-3">
            {isBlockError ? (
              /* Friendly block-error with manual fallback */
              <div className="bg-surface border border-border rounded-xl p-4 text-center">
                <p className="text-sm font-medium text-text mb-1">This site prevents automatic import</p>
                <p className="text-xs text-muted mb-4 leading-relaxed">
                  No worries — you can paste the recipe below and it'll work just like an import.
                </p>
                <button
                  onClick={() => { setError(''); setShowManual(true) }}
                  className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-all active:scale-[.98]"
                >
                  <ClipboardPaste size={15} />
                  Paste Recipe Manually
                </button>
              </div>
            ) : (
              /* Standard error */
              <div className="flex items-start gap-2.5 text-sm text-highlight bg-highlight/10 border border-highlight/20 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hint + always-available manual option */}
      <p className="mt-6 text-xs text-subtle text-center">
        Works best with sites that use structured recipe data (AllRecipes, Serious Eats, NYT Cooking, etc.)
      </p>
      <button
        onClick={() => setShowManual(true)}
        className="mt-2 text-xs text-muted hover:text-text transition-colors underline underline-offset-2"
      >
        or paste a recipe manually
      </button>
    </div>
  )
}
