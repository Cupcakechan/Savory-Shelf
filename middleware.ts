import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Private routes ────────────────────────────────────────
// Any pathname that starts with one of these requires an active session.
const PROTECTED = ['/my-recipes', '/my-pantry', '/shopping-list']

// ── Auth check ────────────────────────────────────────────
// Supabase writes a cookie named "sb-<project-ref>-auth-token" when the
// /auth/callback route exchanges the magic-link code for a session using
// @supabase/ssr (or any server-side createClient that writes cookies).
//
// ⚠️  If your /auth/callback route stores the session in localStorage only
//     (i.e. uses the basic browser createClient), this check will redirect
//     all users — including authenticated ones — away from protected pages.
//     You would notice this immediately on first sign-in after deploy.
//     In that case, remove the redirect below and rely on the per-page
//     client-side guards instead, or add @supabase/ssr to the callback route.

function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll()
    .some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PROTECTED.some(p => pathname.startsWith(p))) {
    if (!hasSupabaseSession(request)) {
      // Redirect unauthenticated visitors to the import / home page
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/my-recipes/:path*',
    '/my-pantry/:path*',
    '/shopping-list/:path*',
  ],
}
