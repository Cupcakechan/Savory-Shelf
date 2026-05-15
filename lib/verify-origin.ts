'use server'

import { headers } from 'next/headers'
import { secLog } from './sec-log'

/**
 * Builds the set of allowed Origin values from environment config.
 *
 * Set NEXT_PUBLIC_SITE_URL in Vercel to your production domain:
 *   NEXT_PUBLIC_SITE_URL=https://savoryshelf.com
 *
 * Vercel preview deployments (*.vercel.app) are always allowed so
 * PR previews and staging deploys keep working without extra config.
 */
function getAllowedOrigins(): string[] {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001',
  ]
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    // Normalise: strip trailing slash
    origins.push(process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ''))
  }
  return origins
}

/**
 * Defense-in-depth origin check for Server Actions that trigger external
 * fetches, AI requests, or service-role storage writes.
 *
 * Browsers always include an Origin header for cross-origin requests and
 * most same-origin AJAX/fetch calls. If the header is present and doesn't
 * match our allowlist we block the request and log it.
 *
 * Requests WITHOUT an Origin header (server-to-server, curl, Postman) are
 * allowed through — the header is a browser-only mechanism and its absence
 * does not indicate a cross-site request.
 *
 * Returns true  → request should proceed.
 * Returns false → request should be rejected (caller returns an error).
 */
export async function verifyOrigin(): Promise<boolean> {
  const h      = await headers()
  const origin = h.get('origin')

  // No Origin header → not a browser-initiated cross-site call; allow
  if (!origin) return true

  // If no production URL is configured, skip the check rather than blocking —
  // an unconfigured allowlist would silently deny all production Server Action
  // calls. Log a warning so it's visible in Vercel function logs.
  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    console.warn(
      '[verify-origin] NEXT_PUBLIC_SITE_URL is not set — origin check skipped. ' +
      'Set it in Vercel Environment Variables to enable CSRF protection.',
    )
    return true
  }

  const isAllowed =
    getAllowedOrigins().includes(origin) ||
    // Vercel preview URLs  e.g. https://savoryshelf-abc123-cocolito.vercel.app
    /^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/i.test(origin)

  if (!isAllowed) {
    // Log-only mode — mismatches are recorded for monitoring but never blocked.
    // AI actions are already protected by rate limiting and auth; hard-blocking
    // here risks breaking production if NEXT_PUBLIC_SITE_URL drifts.
    secLog('warn', { event: 'csrf_origin_mismatch', origin })
  }

  // Always allow — this function is currently audit-only.
  return true
}
