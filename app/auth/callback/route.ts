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
      // Signal any open same-origin tab (e.g. the original tab the user signed
      // in from) that auth is complete, then close this callback tab.
      // If the browser blocks window.close() (common when opened from an email
      // client rather than window.open()), the script falls back to navigating
      // to the app after 600 ms so the user isn't left on a dead page.
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SavoryShelf</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#131210;color:#F0EDE8;font-family:system-ui,sans-serif;
         display:flex;align-items:center;justify-content:center;
         min-height:100svh;text-align:center;padding:2rem}
    h1{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}
    p{font-size:.875rem;color:#7A7770}
  </style>
</head>
<body>
  <div>
    <h1>✓ Signed in successfully</h1>
    <p>You can close this tab.</p>
  </div>
  <script>
    try { localStorage.setItem('savoryshelf-auth-success', String(Date.now())); } catch(_){}
    window.close();
    setTimeout(function(){ window.location.replace('/'); }, 600);
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
