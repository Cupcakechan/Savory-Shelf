'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, ChefHat } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Inner component ───────────────────────────────────────

type Status = 'loading' | 'success' | 'error'

function Callback() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    const code = searchParams.get('code')

    if (!code) {
      router.replace('/')
      return
    }

    // Advisory cross-device check (PKCE is the real security layer)
    try {
      const stateTs = localStorage.getItem('savoryshelf-login-state')
      if (!stateTs) {
        console.warn('[auth-callback] No login intent marker — cross-device sign-in or unexpected flow')
      } else if (Date.now() - parseInt(stateTs, 10) > 10 * 60 * 1000) {
        console.warn('[auth-callback] Login intent marker expired (>10 min)')
      }
      localStorage.removeItem('savoryshelf-login-state')
    } catch (_) {}

    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      // Check for an active session rather than the absence of an error.
      // In React StrictMode (and some PKCE flows) the effect can fire twice —
      // the second exchange fails with "already used" but the session from the
      // first exchange is still valid, so the user IS logged in.
      const hasSession = !!data?.session

      if (!hasSession) {
        // Only show the error panel if we genuinely have no session.
        if (error) console.warn('[auth-callback] exchange error:', error.message)
        setStatus('error')
        return
      }

      // Signal the original tab to pick up the new session immediately
      try {
        localStorage.setItem('savoryshelf-auth-success', String(Date.now()))
      } catch (_) {}

      // Attempt to close this callback tab. Works when the tab was opened
      // programmatically (most webmail clients). Silently fails when the
      // browser blocks it (e.g. direct email app → browser).
      window.close()

      // Give the browser ~600 ms to act on window.close().
      // If we're still running after that, the tab is stuck open —
      // show the success panel so the user always has a clear next step.
      setTimeout(() => setStatus('success'), 600)
    })
  }, [searchParams, router])

  // ── Loading spinner ───────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted">Signing you in…</p>
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <div className="max-w-sm w-full text-center">
          <p className="text-sm text-red-400 mb-6">
            That link may have expired or already been used. Please request a new one.
          </p>
          <button
            onClick={() => router.replace('/')}
            className="w-full py-3 rounded-xl bg-surface border border-border text-sm font-medium text-text hover:border-accent/40 transition-colors"
          >
            Back to SavoryShelf
          </button>
        </div>
      </div>
    )
  }

  // ── Success panel (tab couldn't be closed automatically) ──

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
      <div className="max-w-sm w-full">

        {/* Brand mark */}
        <div className="flex justify-center mb-8">
          <span className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
            <ChefHat size={22} className="text-white" strokeWidth={2.5} />
          </span>
        </div>

        {/* Confirmation */}
        <div className="flex flex-col items-center text-center mb-8">
          <CheckCircle size={36} className="text-accent mb-4" />
          <h1 className="font-display text-2xl font-bold text-text mb-2">
            You're signed in
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            You can return to your original SavoryShelf tab — it's already
            updated. Or continue here.
          </p>
          <p className="text-xs text-subtle mt-3">
            Some browsers prevent automatic tab closing after email sign-in.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.replace('/my-recipes')}
            className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors active:scale-[.98]"
          >
            Go to My Recipes
          </button>
          <button
            onClick={() => window.close()}
            className="w-full py-3 rounded-xl bg-surface border border-border text-sm font-medium text-text hover:border-accent/40 transition-colors"
          >
            Close this tab
          </button>
        </div>

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
