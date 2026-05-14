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

    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (!error) {
          // Notify any other open tab (e.g. the original sign-in tab) so it
          // picks up the new session instantly via the storage event listener
          // in Nav.tsx without requiring the user to manually switch tabs.
          try {
            localStorage.setItem('savoryshelf-auth-success', String(Date.now()))
          } catch (_) { /* storage unavailable — non-fatal */ }
        }
      })
      .finally(() => {
        // Always navigate to home whether exchange succeeded or failed.
        // If it failed the user arrives unsigned-in; if it succeeded they
        // are fully authenticated.
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
