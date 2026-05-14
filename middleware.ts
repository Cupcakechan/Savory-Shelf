import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/my-recipes', '/my-pantry', '/shopping-list']

export async function middleware(request: NextRequest) {
  // We need a mutable response so we can forward any refreshed session
  // cookies back to the browser. Always start from NextResponse.next()
  // and carry the original request through.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Write refreshed cookies into both the forwarded request
          // (so Server Components see the new values) and the response
          // (so the browser receives them).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: use getUser(), not getSession().
  // getUser() re-validates the token with the Supabase Auth server and
  // silently refreshes it if it has expired, keeping the cookie alive.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (PROTECTED.some(p => pathname.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  // Run on every route except Next.js internals and static files so the
  // session cookie is refreshed on any page the user visits.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
