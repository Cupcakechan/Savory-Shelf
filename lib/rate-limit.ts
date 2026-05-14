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
 * serverless instances (replaces the old in-memory Map approach).
 *
 * Returns true if the request should be blocked.
 * Fails open on DB errors so infra issues never block legitimate users.
 *
 * Prerequisite: run the SQL in docs/rate-limit-migration.sql in Supabase.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs = 60_000,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key:            key,
      p_max:            max,
      p_window_seconds: Math.floor(windowMs / 1000),
    })

    if (error) {
      // Fail open — rate-limit infra errors must not block real users
      console.error('[rate-limit] Supabase RPC error:', error.message)
      return false
    }

    if (data === true) {
      // key is already hashed — safe to log
      secLog('warn', { event: 'rate_limit_triggered', key, max })
      return true
    }

    return false
  } catch (err) {
    console.error('[rate-limit] Unexpected error:', err instanceof Error ? err.message : String(err))
    return false  // fail open
  }
}
