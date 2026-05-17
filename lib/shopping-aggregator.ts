// Pure ingredient parsing + aggregation. No React, no Supabase, no DOM.
//
// Used by AddToListModal to merge a set of recipe ingredient strings into
// an existing shopping list's items, with smart quantity combining for
// rows that share the same normalized name AND the same normalized unit.
//
// Same key + numeric quantities on both sides → sum into one row.
// Same key + at least one non-numeric quantity → insert separately.
// Different keys (e.g. different units of the same ingredient) → insert
// separately. No unit conversion in Part A — see the follow-up "Middle
// Path" task for grouped-row hints on unit mismatches.

// ── Unit synonyms ─────────────────────────────────────────

// Maps every spelling we expect to encounter back to a single canonical
// form. Keys are lowercased and dot-stripped before lookup (so "Tbsp."
// and "tbsp" both resolve via 'tbsp'). Unknown units pass through
// untouched after the same lowercase/strip-dots normalisation, which is
// fine — unknown units simply never aggregate with anything else.
const UNIT_SYNONYMS: Record<string, string> = {
  // Volume
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  'fl oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  // Weight
  g: 'g', gram: 'g', grams: 'g', gm: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  // Miscellaneous countable / package units
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  package: 'package', packages: 'package', pkg: 'package',
  stick: 'stick', sticks: 'stick',
  bunch: 'bunch', bunches: 'bunch',
  head: 'head', heads: 'head',
}

function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.trim().toLowerCase().replace(/\./g, '')
  if (!clean) return null
  return UNIT_SYNONYMS[clean] ?? clean
}

// ── Name normalisation ────────────────────────────────────

// Common prep/size modifiers stripped from ingredient names for matching.
// "3 large eggs" and "2 small eggs, beaten" both normalize to "egg".
const MODIFIERS = new Set([
  'large', 'small', 'medium', 'extra-large', 'jumbo', 'mini',
  'fresh', 'frozen', 'dried', 'raw', 'cooked',
  'chopped', 'minced', 'sliced', 'diced', 'crushed', 'grated', 'shredded',
  'melted', 'softened', 'beaten', 'whipped', 'mashed', 'peeled',
  'optional', 'ripe', 'unripe',
])

function normalizeName(raw: string): string {
  let s = raw.toLowerCase().trim()
  // Drop trailing comma clauses: "eggs, beaten" → "eggs"
  s = s.split(',')[0].trim()
  // Drop parenthetical asides
  s = s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  const words = s.split(/\s+/).filter(w => w && !MODIFIERS.has(w))
  // Collapse trailing 's' so "eggs" matches "egg"
  return words.join(' ').replace(/s$/, '')
}

// ── Display cleanup ───────────────────────────────────────

/**
 * Cleans an ingredient name for storage on a shopping list. Strips the
 * stuff a shopper doesn't care about — metric-conversion parentheticals
 * and prep-instruction comma clauses — without removing buy-relevant
 * descriptors like "large", "fresh", or "extra virgin".
 *
 *   "(170g/180 ml) unsalted butter, melted & cooled for 5 minutes"
 *     → "unsalted butter"
 *
 *   "1 cup all-purpose flour, sifted"  (after qty/unit are stripped)
 *     → "all-purpose flour"
 *
 *   "salt to taste"  (no comma, no parens)
 *     → "salt to taste"  (unchanged)
 *
 * If the cleanup somehow produces an empty result (e.g. input was just
 * "(...)"), we fall back to the trimmed original to avoid inserting a
 * blank ingredient row.
 */
function cleanNameForDisplay(raw: string): string {
  const original = raw.trim()
  let s = original
  // Strip leading parenthetical (commonly a metric conversion)
  s = s.replace(/^\([^)]*\)\s*/, '')
  // Strip any remaining parentheticals
  s = s.replace(/\([^)]*\)/g, '')
  // Drop everything from the first comma onward — typically prep instructions
  const commaIdx = s.indexOf(',')
  if (commaIdx >= 0) s = s.slice(0, commaIdx)
  s = s.replace(/\s+/g, ' ').trim()
  return s || original
}

// ── Quantity parsing ──────────────────────────────────────

const FRAC_VALUES: Record<string, number> = {
  '⅛': 0.125, '¼': 0.25, '⅓': 1 / 3, '½': 0.5,
  '⅔': 2 / 3, '¾': 0.75, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

function parseQty(s: string | null | undefined): number | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  if (FRAC_VALUES[t] !== undefined) return FRAC_VALUES[t]
  // Whole + unicode fraction: "2 ½"
  for (const [sym, val] of Object.entries(FRAC_VALUES)) {
    if (t.endsWith(sym)) {
      const whole = parseInt(t.slice(0, -sym.length).trim(), 10)
      if (!isNaN(whole)) return whole + val
    }
  }
  // Mixed number with slash fraction: "2 1/4" or "2 and 1/4"
  const mixed = t.match(/^(\d+)\s+(?:and\s+)?(\d+)\/(\d+)$/)
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  // Standalone slash fraction
  const slash = t.match(/^(\d+)\/(\d+)$/)
  if (slash) return parseInt(slash[1]) / parseInt(slash[2])
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

// Format a numeric quantity for storage as text. Integers stay clean; fractions
// round to 3 decimals to avoid lossy round-trips while keeping rows readable.
function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 1000) / 1000)
}

// ── Ingredient parser ─────────────────────────────────────

export interface ParsedIngredient {
  quantity: number | null
  unit:     string | null
  /** Cleaned name suitable for display — parentheticals and prep clauses removed. */
  name:     string
}

const QTY_PATTERN =
  '(?:\\d+\\s+(?:and\\s+)?\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s+[⅛¼⅓½⅔¾⅜⅝⅞]|[⅛¼⅓½⅔¾⅜⅝⅞]|\\d+(?:\\.\\d+)?)'

// Sort known units longest-first so "fluid ounces" matches before "ounces".
const UNIT_PATTERN = Object.keys(UNIT_SYNONYMS)
  .sort((a, b) => b.length - a.length)
  .map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const QTY_UNIT_RE = new RegExp(`^(${QTY_PATTERN})\\s*(${UNIT_PATTERN})\\.?\\s+(.+)$`, 'i')
const QTY_ONLY_RE = new RegExp(`^(${QTY_PATTERN})\\s+(.+)$`)

export function parseIngredient(line: string): ParsedIngredient {
  const trimmed = line.trim()

  // qty + unit + name
  const m1 = trimmed.match(QTY_UNIT_RE)
  if (m1) {
    return {
      quantity: parseQty(m1[1]),
      unit:     normalizeUnit(m1[2]),
      name:     cleanNameForDisplay(m1[3]),
    }
  }

  // qty + name (no unit) — e.g. "3 large eggs"
  const m2 = trimmed.match(QTY_ONLY_RE)
  if (m2) {
    return {
      quantity: parseQty(m2[1]),
      unit:     null,
      name:     cleanNameForDisplay(m2[2]),
    }
  }

  // No leading quantity — e.g. "salt to taste"
  return {
    quantity: null,
    unit:     null,
    name:     cleanNameForDisplay(trimmed),
  }
}

// ── Aggregation ───────────────────────────────────────────

export interface ExistingItem {
  id:              string
  ingredient_name: string
  quantity:        string | null
  unit:            string | null
  checked:         boolean
}

interface InsertItem {
  id:              string
  list_id:         string
  ingredient_name: string
  quantity:        string | null
  unit:            string | null
  checked:         false
}

interface UpdateItem {
  id:       string
  quantity: string | null
  unit:     string | null
}

export interface AggregationResult {
  inserts: InsertItem[]
  updates: UpdateItem[]
}

const matchKey = (name: string, unit: string | null): string =>
  `${normalizeName(name)}|${unit ?? ''}`

/**
 * Merge a set of new ingredient strings into a list's existing items.
 *
 * Empty/whitespace-only strings are skipped.
 * The `existing` array is treated as immutable from the caller's perspective,
 * but a local mutable copy tracks running totals so consecutive new items
 * targeting the same existing row keep summing correctly.
 */
export function aggregateIntoList(
  existing: ExistingItem[],
  newIngredients: string[],
  listId: string,
): AggregationResult {
  // Index existing by match key. If two existing rows share a key (legacy
  // data, before this feature existed), only the first is merged into.
  const existingIndex = new Map<string, ExistingItem>()
  for (const item of existing) {
    const k = matchKey(item.ingredient_name, normalizeUnit(item.unit))
    if (!existingIndex.has(k)) existingIndex.set(k, { ...item })
  }

  // Track inserts we've already created so two new items of the same kind
  // (e.g. "3 eggs" and "5 eggs" within the same recipe) merge with each
  // other before hitting the DB.
  const pendingInserts = new Map<string, InsertItem>()

  const inserts: InsertItem[] = []
  const updates: UpdateItem[] = []

  for (const raw of newIngredients) {
    if (!raw.trim()) continue
    const parsed = parseIngredient(raw)
    const key    = matchKey(parsed.name, parsed.unit)

    // 1. Already pending an insert with this key? Try to merge into it.
    const pending = pendingInserts.get(key)
    if (pending) {
      const pendingQty = parseQty(pending.quantity)
      if (pendingQty !== null && parsed.quantity !== null) {
        pending.quantity = formatQty(pendingQty + parsed.quantity)
      }
      // If either side is non-numeric the existing pending row stands as-is;
      // we never create two pending rows with the same key.
      continue
    }

    // 2. Matches an existing list item? Try to update.
    const match = existingIndex.get(key)
    if (match) {
      const matchQty = parseQty(match.quantity)
      if (matchQty !== null && parsed.quantity !== null) {
        const totalQty = formatQty(matchQty + parsed.quantity)
        updates.push({ id: match.id, quantity: totalQty, unit: match.unit })
        // Mutate the local copy so further new items keep summing on top.
        match.quantity = totalQty
        continue
      }
      // Non-numeric on either side → fall through and insert separately.
    }

    // 3. No suitable target → new row.
    const insert: InsertItem = {
      id:              crypto.randomUUID(),
      list_id:         listId,
      ingredient_name: parsed.name,
      quantity:        parsed.quantity !== null ? formatQty(parsed.quantity) : null,
      unit:            parsed.unit,
      checked:         false,
    }
    inserts.push(insert)
    pendingInserts.set(key, insert)
  }

  return { inserts, updates }
}
