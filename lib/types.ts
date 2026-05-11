export interface Recipe {
  id: string
  title: string
  image?: string          // base64 data URL after import
  prepTime?: string
  cookTime?: string
  servings?: number
  ingredients: string[]
  instructions: string[]
  notes?: string
  sourceUrl?: string
  savedAt?: string
}
