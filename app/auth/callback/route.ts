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
      // 1. Return a minimal HTML page so we can run client-side JS before
      //    navigating — necessary because localStorage is only accessible
      //    in the browser, not in this server Route Handler.
      // 2. The script signals any open same-origin tab (e.g. the tab the
      //    user started sign-in from) via a storage event, then immediately
      //    navigates this tab to the app. window.close() is attempted first
      //    in case the tab was opened programmatically; it silently fails
      //    when opened from an email client, and the replace() takes over.
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>html,body{background:#131210;margin:0;min-height:100svh}</style>
</head>
<body>
  <script>
    try{localStorage.setItem('savoryshelf-auth-success',String(Date.now()));}catch(_){}
    window.close();
    window.location.replace('/');
  </script>
</body>
</html>`
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
  }

  // Code missing or exchange failed — send to home; client-side auth handles state
  return NextResponse.redirect(`${origin}/`)
}
