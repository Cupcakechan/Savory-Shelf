import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { supabaseAdmin } from './supabase-admin'
import { secLog } from './sec-log'

// ── Privacy-safe key hashing ──────────────────────────────
// All keys are irreversibly hashed before storage or logging so no raw IP
// or user_id is persisted in the rate_limits table or Vercel log output.

function toHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

/**
 * Returns a privacy-safe composite rate-limit key.
 * - Authenticated path: hashed user_id (stable across IPs and instances)
 * - Anonymous path:     hashed IP + User-Agent (best available signal)
 */
export async function getRateLimitKey(userId?: string): Promise<string> {
  if (userId) return toHash(`uid:${userId}`)
  const h  = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anon'
  const ua = h.get('user-agent') ?? ''
  return toHash(`ip:${ip}:ua:${ua}`)
}

/**
 * Atomically checks and increments the rate limit for `key` via a
 * Supabase stored procedure — durable and consistent across all
 * serverless instances.
 *
 * Returns true if the request should be blocked.
 *
 * `strict` mode (default false):
 *   - false → fail-open on RPC errors (safe for low-risk endpoints)
 *   - true  → fail-closed on RPC errors (required for expensive endpoints
 *             like importRecipe and AI calls where abuse = real cost)
 *
 * Prerequisite: run the SQL in docs/rate-limit-migration.sql in Supabase.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs = 60_000,
  strict = false,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key:            key,
      p_max:            max,
      p_window_seconds: Math.floor(windowMs / 1000),
    })

    if (error) {
      if (strict) {
        // Fail-closed: RPC down during high-cost operation → deny the request.
        // Protects against abuse bursts that coincide with infra instability.
        secLog('warn', { event: 'rate_limit_rpc_error_strict_deny', key, error: error.message })
        return true
      }
      // Fail-open: infra issues must not block legitimate users on low-risk paths
      console.error('[rate-limit] Supabase RPC error:', error.message)
      return false
    }

    if (data === true) {
      secLog('warn', { event: 'rate_limit_triggered', key, max })
      return true
    }

    return false
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (strict) {
      secLog('warn', { event: 'rate_limit_exception_strict_deny', key, error: msg })
      return true   // fail-closed
    }
    console.error('[rate-limit] Unexpected error:', msg)
    return false    // fail-open
  }
}
