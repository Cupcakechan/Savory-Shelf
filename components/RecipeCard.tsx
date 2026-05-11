import { Clock, Users, Pencil } from 'lucide-react'
import { Recipe } from '@/lib/types'

interface Props {
  recipe: Recipe
  onClick: () => void
  onEdit: (recipe: Recipe) => void
}

export default function RecipeCard({ recipe, onClick, onEdit }: Props) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="text-left w-full bg-surface border border-border rounded-2xl overflow-hidden hover:border-accent/40 hover:shadow-md transition-all duration-200 active:scale-[.98]"
      >
        {/* Image */}
        <div className="aspect-[4/3] bg-border overflow-hidden">
          {recipe.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl select-none">
              🍽️
            </div>
          )}
        </div>

        {/* Text */}
        <div className="p-4 pr-10">
          <h3 className="font-display font-semibold text-sm text-text leading-snug line-clamp-2 mb-2">
            {recipe.title}
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {recipe.cookTime && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock size={11} />
                {recipe.cookTime}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Users size={11} />
                {recipe.servings}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Edit button — floats over card, stops propagation */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(recipe) }}
        title="Edit recipe"
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-bg/80 backdrop-blur-sm border border-border text-muted hover:text-accent hover:border-accent/40 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Pencil size={13} />
      </button>
    </div>
  )
}
