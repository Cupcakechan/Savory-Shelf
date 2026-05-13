import { createClient } from '@supabase/supabase-js'
import type { Recipe } from './types'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: true,
    },
  },
)

// ── DB ↔ app type mappers ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromDbRecipe(row: any): Recipe {
  return {
    id:           row.id,
    title:        row.title,
    // Prefer the Storage URL (new); fall back to base64 (old) during migration
    image:        row.image_url ?? row.image_base64 ?? undefined,
    prepTime:     row.prep_time     ?? undefined,
    cookTime:     row.cook_time     ?? undefined,
    servings:     row.servings      ?? undefined,
    ingredients:  row.ingredients   ?? [],
    instructions: row.instructions  ?? [],
    notes:        row.notes         ?? undefined,
    sourceUrl:    row.source_url    ?? undefined,
    savedAt:      row.created_at    ?? undefined,
    tags:         row.tags          ?? [],
  }
}

export function toDbRecipe(recipe: Recipe, userId: string) {
  // Only persist real Storage URLs — base64 placeholders are display-only in memory
  const imageUrl = recipe.image?.startsWith('https://') ? recipe.image : null

  return {
    id:           recipe.id,
    user_id:      userId,
    title:        recipe.title,
    image_url:    imageUrl,
    prep_time:    recipe.prepTime     ?? null,
    cook_time:    recipe.cookTime     ?? null,
    servings:     recipe.servings     ?? null,
    ingredients:  recipe.ingredients,
    instructions: recipe.instructions,
    notes:        recipe.notes        ?? null,
    source_url:   recipe.sourceUrl    ?? null,
    tags:         recipe.tags         ?? [],
  }
}
