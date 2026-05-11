'use client'

import { useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { Recipe } from '@/lib/types'
import RecipeCard from '@/components/RecipeCard'
import RecipeView from '@/components/RecipeView'
import EditModal from '@/components/EditModal'

export default function MyRecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [mounted, setMounted] = useState(false)

  const loadFromStorage = () => {
    const stored: Recipe[] = JSON.parse(
      localStorage.getItem('savoryshelf-recipes') ?? '[]',
    )
    setRecipes(stored)
  }

  useEffect(() => {
    loadFromStorage()
    setMounted(true)
  }, [])

  const handleBack = () => {
    loadFromStorage()
    setSelected(null)
  }

  const handleEditSave = (updated: Recipe) => {
    loadFromStorage()
    // If we're editing a card directly, close the modal
    setEditing(null)
    // If we're in the full view, the RecipeView component handles its own state
  }

  if (!mounted) return null

  if (selected) {
    return <RecipeView recipe={selected} onBack={handleBack} />
  }

  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12 text-center">
        <span className="text-5xl mb-6 select-none">📋</span>
        <h2 className="font-display text-2xl font-bold text-text mb-2">
          No saved recipes yet
        </h2>
        <p className="text-muted text-sm mb-6 max-w-xs">
          Import a recipe and tap the bookmark icon to save it here.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all"
        >
          <BookOpen size={16} />
          Import your first recipe
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="py-8">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="font-display text-2xl font-bold text-text">My Recipes</h1>
          <span className="text-sm text-muted">{recipes.length} saved</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onClick={() => setSelected(r)}
              onEdit={(recipe) => setEditing(recipe)}
            />
          ))}
        </div>
      </div>

      {editing && (
        <EditModal
          recipe={editing}
          onClose={() => setEditing(null)}
          onSave={handleEditSave}
        />
      )}
    </>
  )
}
