import { useState, useEffect } from 'react'
import { Clock, Trash2, ListPlus } from 'lucide-react'
import { Recipe } from '@/lib/types'
import AddToListModal from './AddToListModal'

interface Props {
  recipe: Recipe
  onClick: () => void
  onDelete: (id: string) => void
  matchPercent?: number   // 0-100 — shows a coloured % badge (pantry page)
  missingCount?: number   // how many ingredients are missing (pantry page)
  showTags?: boolean      // show collection tag chips below title (pantry page)
}

/** Remove {tag} count pollution from titles */
function cleanTitle(title: string): string {
  return title
    .replace(/^\{[^}]+\}\s*/g, '')
    .replace(/\s*\{[^}]+\}$/g, '')
    .replace(/^\(\d+[^)]*\)\s*/gi, '')
    .trim()
}

function ingredientCount(recipe: Recipe): string {
  const n = recipe.ingredients?.length ?? 0
  if (n === 0) return ''
  return n === 1 ? '(1 ingredient)' : `(${n} ingredients)`
}

export default function RecipeCard({ recipe, onClick, onDelete, matchPercent, missingCount, showTags }: Props) {
  const count = ingredientCount(recipe)
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [recipe.id])

  // One-tap "Add all ingredients to a shopping list" flow. Self-contained:
  // opens AddToListModal with the recipe's base-quantity ingredient strings
  // and flashes a brief emerald bottom-bar toast on success.
  const [showAddToList, setShowAddToList] = useState(false)
  const [addedTo, setAddedTo]             = useState('')

  const handleAddToList = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowAddToList(true)
  }

  const handleAdded = (listName: string) => {
    setShowAddToList(false)
    setAddedTo(listName)
    setTimeout(() => setAddedTo(''), 2200)
  }

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="text-left w-full bg-surface border border-border rounded-2xl overflow-hidden hover:border-accent/40 hover:shadow-md transition-all duration-200 active:scale-[.98]"
      >
        {/* Image */}
        <div className="aspect-[4/3] bg-border overflow-hidden relative">
          {recipe.image && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 select-none px-3 text-center">
              <span className="text-3xl">🍽️</span>
              {recipe.sourceUrl && (
                <p className="text-[10px] text-subtle leading-snug">
                  Re-import to recover image
                </p>
              )}
            </div>
          )}

          {/* Match % badge (pantry matching page) */}
          {matchPercent !== undefined && (
            <div className="absolute bottom-2 left-2">
              <span className={`inline-flex items-center text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm leading-snug ${
                matchPercent >= 80
                  ? 'bg-emerald-500 text-white'
                  : matchPercent >= 60
                  ? 'bg-amber-500 text-white'
                  : 'bg-surface border border-border text-muted'
              }`}>
                {matchPercent}% match
              </span>
            </div>
          )}
        </div>

        {/* Text */}
        <div className="p-4 pr-14">
          <h3 className="font-display font-semibold text-sm text-text leading-snug line-clamp-2 mb-2">
            {cleanTitle(recipe.title)}
          </h3>
          <div className="flex items-center gap-2.5 flex-wrap">
            {recipe.cookTime && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock size={11} />{recipe.cookTime}
              </span>
            )}
            {count && (
              <span className="text-xs text-subtle">{count}</span>
            )}
          </div>

          {/* Missing count — only shown on pantry page when data is available */}
          {missingCount !== undefined && missingCount > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-500/80 font-medium">
              Missing: {missingCount} ingredient{missingCount !== 1 ? 's' : ''}
            </p>
          )}
          {missingCount === 0 && matchPercent !== undefined && (
            <p className="mt-1.5 text-[11px] text-emerald-500/80 font-medium">
              You have everything!
            </p>
          )}

          {showTags && recipe.tags && recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {recipe.tags.map(tag => (
                <span key={tag} className="text-[10px] font-medium text-accent bg-accent/10 border border-accent/15 rounded-full px-2 py-0.5 capitalize">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Top-right icon cluster — both stop propagation to avoid opening the card.
          Always visible (no hover-reveal) so the buttons are tappable on touch
          devices without a hover state. ~42px square hit areas, solid-ish bg +
          shadow give clear separation from any underlying recipe photo. */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        <button
          onClick={handleAddToList}
          title="Add all ingredients to a shopping list"
          aria-label="Add all ingredients to a shopping list"
          className="p-3 rounded-lg bg-bg/90 backdrop-blur-sm border border-border shadow-sm text-text hover:text-accent hover:border-accent/40 hover:bg-bg active:scale-95 transition-all"
        >
          <ListPlus size={18} />
        </button>
        <button
          onClick={e => {
            e.stopPropagation()
            if (confirm(`Delete "${recipe.title}"?`)) onDelete(recipe.id)
          }}
          title="Delete recipe"
          aria-label="Delete recipe"
          className="p-3 rounded-lg bg-bg/90 backdrop-blur-sm border border-border shadow-sm text-text hover:text-highlight hover:border-highlight/40 hover:bg-bg active:scale-95 transition-all"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Success toast — emerald stripe at the bottom of the card for ~2s */}
      {addedTo && (
        <div className="absolute bottom-0 inset-x-0 bg-emerald-500 text-white text-center text-xs font-semibold py-2 z-10 rounded-b-2xl pointer-events-none">
          ✓ Added to {addedTo}
        </div>
      )}

      {showAddToList && (
        <AddToListModal
          ingredients={recipe.ingredients}
          onClose={() => setShowAddToList(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  )
}
