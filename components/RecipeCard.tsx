import { Clock, Trash2 } from 'lucide-react'
import { Recipe } from '@/lib/types'

interface Props {
  recipe: Recipe
  onClick: () => void
  onDelete: (id: string) => void
  pantryMatch?: boolean
}

/** Remove {tag} count pollution from titles (e.g. "{3 Ingredient} Cookies" → "Cookies") */
function cleanTitle(title: string): string {
  return title
    .replace(/^\{[^}]+\}\s*/g, '')
    .replace(/\s*\{[^}]+\}$/g, '')
    .replace(/^\(\d+[^)]*\)\s*/gi, '')
    .trim()
}

/** "1 ingredient" / "12 ingredients" */
function ingredientCount(recipe: Recipe): string {
  const n = recipe.ingredients?.length ?? 0
  if (n === 0) return ''
  return n === 1 ? '(1 ingredient)' : `(${n} ingredients)`
}

export default function RecipeCard({ recipe, onClick, onDelete, pantryMatch }: Props) {
  const count = ingredientCount(recipe)

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="text-left w-full bg-surface border border-border rounded-2xl overflow-hidden hover:border-accent/40 hover:shadow-md transition-all duration-200 active:scale-[.98]"
      >
        {/* Image */}
        <div className="aspect-[4/3] bg-border overflow-hidden relative">
          {recipe.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl select-none">🍽️</div>
          )}

          {/* Pantry match badge */}
          {pantryMatch && (
            <div className="absolute bottom-2 left-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500 text-white rounded-full px-2 py-0.5 shadow-sm leading-snug">
                🥬 Pantry Match
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
        </div>
      </button>

      {/* Delete button */}
      <button
        onClick={e => {
          e.stopPropagation()
          if (confirm(`Delete "${recipe.title}"?`)) onDelete(recipe.id)
        }}
        title="Delete recipe"
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-bg/80 backdrop-blur-sm border border-border text-muted hover:text-highlight hover:border-highlight/40 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
