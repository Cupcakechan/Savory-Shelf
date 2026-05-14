import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { secLog } from '@/lib/sec-log'

/**
 * Handles the Supabase magic-link PKCE callback.
 *
 * When the user clicks the magic link they land here with a one-time `code`
 * in the query string. We exchange it for a full session, which @supabase/ssr
 * writes into an HTTP cookie. The middleware then reads that cookie on every
 * subsequent request to verify auth — no localStorage involved.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Validate `next` to prevent open-redirect attacks.
  // Only accept relative paths that start with exactly one `/` (not `//evil.com`).
  const rawNext = searchParams.get('next') ?? '/'
  const isSafeNext = rawNext.startsWith('/') && !rawNext.startsWith('//')
  if (!isSafeNext && rawNext !== '/') {
    secLog('warn', { event: 'invalid_redirect_target', raw_next: rawNext })
  }
  // Only accept relative paths that start with exactly one `/` (not `//evil.com`).
  const next = isSafeNext ? rawNext : '/'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Code missing or exchange failed — send to home; client-side auth handles state
  return NextResponse.redirect(`${origin}/`)
}
