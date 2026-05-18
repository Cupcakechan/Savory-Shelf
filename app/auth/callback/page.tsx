'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Inner component ───────────────────────────────────────

type Status = 'loading' | 'done' | 'intent-missing' | 'intent-expired' | 'error'

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

    // ── Intent marker check (hard failure) ───────────────
    // The marker is written to localStorage when the user opens the sign-in
    // modal. Its presence confirms the link was clicked in the same browser
    // that initiated the flow, guarding against link-hijacking / open
    // redirect confusion.
    //
    // If localStorage is unavailable (rare: some WebViews) we allow through
    // — we can't reliably enforce the check in that environment.
    try {
      const stateTs = localStorage.getItem('savoryshelf-login-state')
      localStorage.removeItem('savoryshelf-login-state')

      if (!stateTs) {
        // No marker at all — different browser or unexpected flow
        setStatus('intent-missing')
        return
      }

      const age = Date.now() - parseInt(stateTs, 10)
      if (age > 10 * 60 * 1000) {
        // Marker present but older than 10 minutes
        setStatus('intent-expired')
        return
      }
    } catch (_) {
      // localStorage unavailable — allow through
    }

    // ── Exchange the PKCE code ────────────────────────────
    //
    // After a successful exchange, we attempt window.close() — this works
    // only for the rare case where the email client opened this tab via
    // window.open(). Most clients open via a plain link click, which
    // browsers refuse to close from script. So we set status='done' and
    // render an explicit "return to your original tab" message instead of
    // silently routing to /, which used to leave users on the magic-link
    // tab wondering whether anything happened.
    //
    // The localStorage write below fires a 'storage' event in any other
    // tab on this origin — Nav.tsx picks that up and updates auth state
    // there without forcing navigation (when the other tab is on '/').
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setStatus('error')
          return
        }
        try {
          localStorage.setItem('savoryshelf-auth-success', String(Date.now()))
        } catch (_) {}
        try { window.close() } catch (_) {}
        setStatus('done')
      })
      .catch(() => {
        setStatus('error')
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

  // ── Hard-fail: link opened in a different browser ─────

  if (status === 'intent-missing') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <div className="max-w-sm w-full text-center">
          <span className="text-4xl mb-5 block select-none">🔒</span>
          <h2 className="font-display text-xl font-bold text-text mb-2">
            Different browser detected
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            For your security, this link needs to be opened in the same browser
            where you requested it. Please go back to SavoryShelf and sign in again.
          </p>
          <button
            onClick={() => router.replace('/')}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Sign in again
          </button>
        </div>
      </div>
    )
  }

  // ── Hard-fail: link expired ───────────────────────────

  if (status === 'intent-expired') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <div className="max-w-sm w-full text-center">
          <span className="text-4xl mb-5 block select-none">⏱️</span>
          <h2 className="font-display text-xl font-bold text-text mb-2">
            Link expired
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Magic links are only valid for 10 minutes. Please request a new one.
          </p>
          <button
            onClick={() => router.replace('/')}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Request a new link
          </button>
        </div>
      </div>
    )
  }

  // ── Success: tell the user to go back to the original tab ────

  if (status === 'done') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <div className="max-w-sm w-full text-center">
          <span className="text-4xl mb-5 block select-none">✅</span>
          <h2 className="font-display text-xl font-bold text-text mb-2">
            You&apos;re signed in
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            If you started importing a recipe, return to that tab to finish
            saving it. You can safely close this tab.
          </p>
          <button
            onClick={() => router.replace('/my-recipes')}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Continue to My Recipes
          </button>
        </div>
      </div>
    )
  }

  // ── Failure: exchange rejected or threw ───────────────

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <div className="max-w-sm w-full text-center">
          <span className="text-4xl mb-5 block select-none">⚠️</span>
          <h2 className="font-display text-xl font-bold text-text mb-2">
            Sign in failed
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            The magic link may have expired or already been used. Please
            request a new one.
          </p>
          <button
            onClick={() => router.replace('/')}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Request a new link
          </button>
        </div>
      </div>
    )
  }

  // Unreachable in normal flow — every Status value above renders explicitly.
  return null
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
