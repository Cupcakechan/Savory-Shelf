import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { ChefHat } from 'lucide-react'
import { fromDbRecipe } from '@/lib/supabase'
import RecipeView from '@/components/RecipeView'

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { data } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] text-center px-4">
        <span className="text-5xl mb-5 select-none">🔍</span>
        <h2 className="font-display text-2xl font-bold text-text mb-2">Recipe not found</h2>
        <p className="text-sm text-muted mb-6 max-w-xs leading-relaxed">
          This recipe may have been removed or made private by its owner.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <ChefHat size={14} />
          Go to SavoryShelf
        </Link>
      </div>
    )
  }

  return <RecipeView recipe={fromDbRecipe(data)} readOnly={true} />
}
