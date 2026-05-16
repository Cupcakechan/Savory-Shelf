import { createBrowserClient } from '@supabase/ssr'
import type { Recipe } from './types'

// createBrowserClient (from @supabase/ssr) stores the session in cookies
// instead of localStorage, making it readable by the middleware and server
// components. All existing method calls (from(), auth, etc.) are identical.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── DB row type ────────────────────────────────────────────
// Mirrors the exact shape Supabase returns for the `recipes` table.
// Keeping this in sync with schema changes prevents silent mapping breaks.

interface DbRecipe {
  id:           string
  user_id:      string
  title:        string
  image_url:    string | null
  image_base64: string | null   // legacy — populated only on older rows
  prep_time:    string | null
  cook_time:    string | null
  servings:     number | null
  ingredients:  string[]
  instructions: string[]
  notes:        string | null
  source_url:   string | null
  created_at:   string | null
  tags:         string[]
  is_public:    boolean | null
}

// ── DB ↔ app type mappers ──────────────────────────────────

export function fromDbRecipe(row: DbRecipe): Recipe {
  return {
    id:           row.id,
    title:        row.title,
    // Prefer the Storage URL (new path); fall back to base64 (legacy rows)
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
