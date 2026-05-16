export interface Recipe {
  id: string
  title: string
  /**
   * Display-only image value — never persisted as base64.
   * New recipes: a Supabase Storage `https://` URL uploaded at import time.
   * Legacy recipes: a base64 data URL from older imports (migrated lazily).
   * `toDbRecipe` writes only Storage URLs to `image_url`; base64 is ignored on save.
   */
  image?: string
  prepTime?: string
  cookTime?: string
  servings?: number
  ingredients: string[]
  instructions: string[]
  notes?: string
  sourceUrl?: string
  savedAt?: string
  tags?: string[]         // user-defined collection tags, lowercase + trimmed
}
