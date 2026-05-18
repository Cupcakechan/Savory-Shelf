import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// crypto.getRandomValues is available in the Edge runtime (Web Crypto API).
// Node's randomBytes cannot be used here — middleware runs on the Edge.
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

const PROTECTED = ['/my-recipes', '/my-pantry', '/shopping-list']

// ── Per-request nonce-based CSP ───────────────────────────
// A fresh nonce is generated for every request. It replaces 'unsafe-inline'
// in script-src, so only scripts carrying the matching nonce attribute
// (including Next.js's own inline hydration scripts, which read x-nonce)
// are allowed to execute. 'strict-dynamic' covers dynamically-loaded chunks.

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  // Generate a fresh nonce for this request
  const nonce = generateNonce()
  const csp   = buildCsp(nonce)

  // Detect Vercel's auto-generated *.vercel.app hostnames so we can mark
  // those responses noindex/nofollow. Google was discovering and indexing
  // savory-shelf-iota.vercel.app alongside www.savoryshelf.com, creating
  // duplicate-content signals across hostnames. X-Robots-Tag on these
  // responses tells crawlers to ignore them without affecting the canonical
  // custom domain.
  const isVercelPreviewHost = (request.headers.get('host') ?? '').endsWith('.vercel.app')

  // Pass the nonce in request headers so Next.js server components can
  // read it via headers() and apply it to any inline scripts they render.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', csp)
  if (isVercelPreviewHost) response.headers.set('x-robots-tag', 'noindex, nofollow')

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Recreate response but always re-apply the nonce headers so
          // they survive the cookie-refresh path.
          response = NextResponse.next({ request: { headers: requestHeaders } })
          response.headers.set('content-security-policy', csp)
          if (isVercelPreviewHost) response.headers.set('x-robots-tag', 'noindex, nofollow')
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (PROTECTED.some(p => pathname.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
