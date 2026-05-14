import { headers } from 'next/headers'

/**
 * Minimal in-memory rate limiter for Server Actions.
 *
 * Limitation: each Vercel serverless instance has its own store.
 * This protects against accidental loops and casual single-instance abuse.
 * For cross-instance persistent limits, Vercel KV or a Supabase table
 * would be needed — both require new dependencies not added here.
 */

const store = new Map<string, { count: number; reset: number }>()

/** Returns the caller's IP as a rate-limit key, or 'anon' as fallback. */
export async function getRateLimitKey(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anon'
}

/**
 * Returns true if `key` has exceeded `max` calls within `windowMs`.
 * Increments the counter on every call (pass or fail).
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs = 60_000,
): boolean {
  const now   = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs })
    return false   // under limit
  }
  if (entry.count >= max) return true  // over limit
  entry.count++
  return false
}
