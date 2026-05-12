'use client'

import { useState, useEffect } from 'react'
import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Recipe } from '@/lib/types'
import { supabase, fromDbRecipe } from '@/lib/supabase'
import RecipeCard from '@/components/RecipeCard'
import RecipeView from '@/components/RecipeView'
import AuthModal from '@/components/AuthModal'

export default function MyRecipesPage() {
  const [recipes, setRecipes]   = useState<Recipe[]>([])
  const [user, setUser]         = useState<User | null>(null)
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [mounted, setMounted]   = useState(false)

  const loadRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRecipes(data.map(fromDbRecipe))
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        await loadRecipes()
      }
      setMounted(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session?.user) {
        setUser(session.user)
        await loadRecipes()
      } else {
        setUser(null)
        setRecipes([])
      }
      setMounted(true)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (id: string) => {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  const handleBack = () => {
    setSelected(null)   // instant — user sees the grid immediately
    loadRecipes()       // refresh in background
  }

  if (!mounted) return null

  if (selected) {
    return <RecipeView recipe={selected} onBack={handleBack} initialSaved={true} />
  }

  if (!user) {
    return (
      <>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12 text-center">
          <span className="text-5xl mb-6 select-none">🔒</span>
          <h2 className="font-display text-2xl font-bold text-text mb-2">Sign in to view your recipes</h2>
          <p className="text-muted text-sm mb-6 max-w-xs leading-relaxed">
            Your saved recipes live in the cloud — sign in to access them from any device.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all"
          >
            Sign in with magic link
          </button>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    )
  }

  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] pb-12 text-center">
        <span className="text-5xl mb-6 select-none">📋</span>
        <h2 className="font-display text-2xl font-bold text-text mb-2">No saved recipes yet</h2>
        <p className="text-muted text-sm mb-6 max-w-xs">Import a recipe and tap the bookmark icon to save it here.</p>
        <Link href="/" className="inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold rounded-xl px-5 py-3 hover:bg-accent/90 transition-all">
          <BookOpen size={16} />Import your first recipe
        </Link>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-text">My Recipes</h1>
        <span className="text-sm text-muted">{recipes.length} saved</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {recipes.map(r => (
          <RecipeCard
            key={r.id}
            recipe={r}
            onClick={() => setSelected(r)}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}
