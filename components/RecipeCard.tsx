import { useState } from 'react'
import { Clock, Trash2 } from 'lucide-react'
import { Recipe } from '@/lib/types'

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
        <div className="p-4 pr-10">
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

      {/* Delete button */}
      <button
        onClick={e => {
          e.stopPropagation()
          if (confirm(`Delete "${recipe.title}"?`)) onDelete(recipe.id)
        }}
        title="Delete recipe"
        className="absolute top-2 right-2 p-2 rounded-lg bg-bg/80 backdrop-blur-sm border border-border text-muted hover:text-highlight hover:border-highlight/40 opacity-40 sm:opacity-0 group-hover:opacity-100 transition-all"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
