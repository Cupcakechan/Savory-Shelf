'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Inner component ───────────────────────────────────────
// Separated into its own component because useSearchParams()
// requires a Suspense boundary in Next.js App Router.

function Callback() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')

    if (!code) {
      // No code present — just send to home
      router.replace('/')
      return
    }

    // Defense-in-depth: verify the login was initiated from this browser.
    // Supabase PKCE is the primary security layer — this is an advisory check.
    try {
      const stateTs = localStorage.getItem('savoryshelf-login-state')
      if (!stateTs) {
        console.warn('[auth-callback] No login intent marker — cross-device sign-in or unexpected flow')
      } else if (Date.now() - parseInt(stateTs, 10) > 10 * 60 * 1000) {
        console.warn('[auth-callback] Login intent marker expired (>10 min)')
      }
      localStorage.removeItem('savoryshelf-login-state')
    } catch (_) {}

    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (!error) {
          // Signal any other open tab so it picks up the new session instantly
          try {
            localStorage.setItem('savoryshelf-auth-success', String(Date.now()))
          } catch (_) { /* storage unavailable — non-fatal */ }
        }
      })
      .finally(() => {
        router.replace('/')
      })
  }, [searchParams, router])

  // Visible only for the brief moment before the redirect fires.
  // Matches the app's dark-mode aesthetic so there is no colour flash.
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">Signing you in…</p>
      </div>
    </div>
  )
}

// ── Page export ───────────────────────────────────────────

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <Callback />
    </Suspense>
  )
}
