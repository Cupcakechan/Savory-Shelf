'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Loader2, AlertCircle, ClipboardPaste, ChevronLeft, Sparkles } from 'lucide-react'
import { importRecipe, fetchRecipeImage } from '@/lib/actions'
import { parseRecipeText } from '@/lib/ai'
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
  blockError?: string
}

function ManualPasteForm({ onRecipe, onCancel, blockError }: ManualFormProps) {
  const [rawText, setRawText]   = useState('')
  const [parsing, setParsing]   = useState(false)
  const [parseMsg, setParseMsg] = useState('')
  const [parsed, setParsed]     = useState(false)

  const [title, setTitle]                   = useState('')
  const [ingredientsText, setIngredients]   = useState('')
  const [instructionsText, setInstructions] = useState('')
  const [servings, setServings]             = useState('')
  const [prepTime, setPrepTime]             = useState('')
  const [cookTime, setCookTime]             = useState('')
  const [image, setImage]                   = useState<string | undefined>()
  const [formError, setFormError]           = useState('')

  // Stable recipe ID — pre-generated so the image upload uses the same ID
  // as the recipe that will be created on submit.
  const [recipeId] = useState(() => crypto.randomUUID())

  // Set to true when ManualPasteForm unmounts so the background
  // fetchRecipeImage promise never calls setImage on a stale component.
  const imageAborted = useRef(false)
  useEffect(() => () => { imageAborted.current = true }, [])

  const handleParse = async () => {
    if (!rawText.trim()) return
    setParsing(true)
    setParseMsg('')
    setFormError('')

    const { result, error } = await parseRecipeText(rawText)
    setParsing(false)

    if (error || !result) {
      setParseMsg(error ?? 'Could not parse — fill in the fields below manually.')
      setParsed(true)
      return
    }

    setTitle(result.title ?? '')
    setIngredients((result.ingredients ?? []).join('\n'))
    setInstructions((result.instructions ?? []).join('\n'))
    setServings(result.servings ? String(result.servings) : '')
    setPrepTime(result.prepTime ?? '')
    setCookTime(result.cookTime ?? '')
    setParsed(true)
    setParseMsg('')

    // If Grok found an image URL, upload to Storage in the background.
    // The image field updates silently when ready — no loading state needed.
    // imageAborted guards against setImage firing after the form unmounts.
    if (result.imageUrl) {
      fetchRecipeImage(result.imageUrl, recipeId).then(({ url }) => {
        if (!imageAborted.current && url) setImage(url)
      })
    }
  }

  const handleSubmit = () => {
    const trimmedTitle   = title.trim()
    const ingredients    = ingredientsText.split('\n').map(s => s.trim()).filter(Boolean)
    const instructions   = instructionsText.split('\n').map(s => s.trim()).filter(Boolean)
    const parsedServings = servings.trim() ? parseInt(servings.trim()) : undefined

    if (!trimmedTitle)       { setFormError('Please enter a recipe title.'); return }
    if (!ingredients.length) { setFormError('Please add at least one ingredient.'); return }

    const recipe: Recipe = {
      id:           recipeId,
      title:        trimmedTitle,
      image:        image,
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
          <p className="text-sm text-muted leading-relaxed">
            Paste the full recipe text and let Grok structure it, or fill in the fields yourself.
          </p>
        </div>

        {blockError && (
          <div className="flex items-start gap-2.5 bg-bg border border-border rounded-xl px-4 py-3">
            <AlertCircle size={15} className="text-muted flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted leading-relaxed">{blockError}</p>
          </div>
        )}

        <div>
          <label className={labelCls}>
            Full recipe text
            <span className="normal-case font-normal text-subtle ml-1">(paste anything — Grok will figure it out)</span>
          </label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="Paste the recipe here — a full web page copy, a photo transcript, or just your own notes. Grok will extract the title, ingredients, and steps."
            rows={7}
            className={`${fieldCls} resize-none leading-relaxed`}
            autoFocus={!blockError}
          />
        </div>

        <button
          onClick={handleParse}
          disabled={!rawText.trim() || parsing}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl py-3.5 transition-all active:scale-[.98]"
        >
          {parsing ? (
            <><Loader2 size={15} className="animate-spin" />Parsing with Grok…</>
          ) : (
            <><Sparkles size={15} />Parse with Grok</>
          )}
        </button>

        {parseMsg && (
          <p className="text-xs text-muted leading-relaxed">{parseMsg}</p>
        )}

        <div className="border-t border-border pt-5 space-y-4">
          <p className="text-xs text-muted -mt-1">
            {parsed ? 'Review and edit the parsed recipe below.' : 'Or fill in the fields manually.'}
          </p>

          <div>
            <label className={labelCls}>Recipe Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Grandma's Chicken Soup"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>
              Ingredients *
              <span className="normal-case font-normal text-subtle ml-1">(one per line)</span>
            </label>
            <textarea
              value={ingredientsText}
              onChange={e => setIngredients(e.target.value)}
              placeholder={"2 cups flour\n1 tsp salt\n3 eggs"}
              rows={6}
              className={`${fieldCls} resize-none leading-relaxed`}
            />
          </div>

          <div>
            <label className={labelCls}>
              Instructions
              <span className="normal-case font-normal text-subtle ml-1">(one step per line, optional)</span>
            </label>
            <textarea
              value={instructionsText}
              onChange={e => setInstructions(e.target.value)}
              placeholder={"Mix dry ingredients.\nAdd eggs and stir until combined.\nBake at 180°C for 30 min."}
              rows={5}
              className={`${fieldCls} resize-none leading-relaxed`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Servings</label>
              <input type="number" min={1} value={servings} onChange={e => setServings(e.target.value)} placeholder="4" className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>Prep Time</label>
              <input type="text" value={prepTime} onChange={e => setPrepTime(e.target.value)} placeholder="15 min" className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>Cook Time</label>
              <input type="text" value={cookTime} onChange={e => setCookTime(e.target.value)} placeholder="1 hr" className={fieldCls} />
            </div>
          </div>

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
    </div>
  )
}

// ── Import page ───────────────────────────────────────────

export default function ImportPage() {
  const router                        = useRouter()
  const [url, setUrl]                 = useState('')
  const [recipe, setRecipe]           = useState<Recipe | null>(null)
  const [error, setError]             = useState('')
  const [showManual, setShowManual]   = useState(false)
  const [blockError, setBlockError]   = useState('')
  const [isPending, startTransition]  = useTransition()

  const handleImport = () => {
    if (!url.trim()) return
    setError('')
    startTransition(async () => {
      const result = await importRecipe(url.trim())
      if (result.error) {
        const isBlock =
          result.error.toLowerCase().includes('blocks automatic import') ||
          result.error.toLowerCase().includes('prevents automatic import')
        if (isBlock) {
          setBlockError(result.error)
          setShowManual(true)
        } else {
          setError(result.error)
        }
      } else if (result.recipe) {
        setRecipe(result.recipe)
      }
    })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleImport()
  }

  if (recipe) {
    return (
      <RecipeView
        recipe={recipe}
        onBack={() => {
          router.refresh()
          setRecipe(null)
          setUrl('')
          setShowManual(false)
          setBlockError('')
        }}
      />
    )
  }

  if (showManual) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12">
        <ManualPasteForm
          onRecipe={setRecipe}
          onCancel={() => { setShowManual(false); setBlockError('') }}
          blockError={blockError || undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12">
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-text mb-3">
          Cook it your way.
        </h1>
        <p className="text-muted text-base max-w-xs mx-auto leading-relaxed">
          Paste any recipe URL and get a clean, scalable, distraction-free view.
        </p>
      </div>

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
            <><Loader2 size={16} className="animate-spin" />Importing recipe…</>
          ) : (
            'Import Recipe'
          )}
        </button>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 text-sm text-highlight bg-highlight/10 border border-highlight/20 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="mt-4 pt-4 border-t border-border text-xs text-subtle leading-relaxed text-center">
          Want to save your recipe book for later?{' '}
          <span className="text-muted">Log in with your email — your recipes will always be there.</span>
          {' '}We only use your email to save your collection.
        </p>
      </div>

      <p className="mt-6 text-xs text-subtle text-center">
        Works best with sites that use structured recipe data (AllRecipes, Serious Eats, NYT Cooking, etc.)
      </p>
      <button
        onClick={() => setShowManual(true)}
        className="mt-1 py-3 px-2 text-xs text-muted hover:text-text transition-colors underline underline-offset-2"
      >
        or paste a recipe manually
      </button>
    </div>
  )
}
