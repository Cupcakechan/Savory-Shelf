'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Mail, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props { onClose: () => void }

export default function AuthModal({ onClose }: Props) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const [mounted, setMounted] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  // Portal requires document to be available (client only)
  useEffect(() => { setMounted(true) }, [])

  // Listen for sign-in completion. This most commonly fires from a
  // cross-tab handoff: the user clicks their magic link in another tab,
  // the callback exchanges the PKCE code, and Supabase broadcasts a
  // SIGNED_IN event across all tabs on this origin. Switching the modal
  // to a success state gives users explicit confirmation when they
  // return from their inbox — without this, the modal silently closes
  // and users land on an unchanged-looking page wondering if anything
  // happened.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        setSignedIn(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const send = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')

    // Store a login intent marker so the callback page can confirm this
    // sign-in was initiated from this browser (defense-in-depth on top of PKCE).
    try {
      localStorage.setItem('savoryshelf-login-state', String(Date.now()))
    } catch (_) {}

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">

      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal box */}
      <div className="relative bg-zinc-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-8 pt-8 pb-10">

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>

          {signedIn ? (
            <div className="text-center py-4">
              <CheckCircle size={40} className="text-accent mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-white mb-2">
                You&apos;re signed in!
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Welcome back. Click Continue to pick up where you left off.
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors"
              >
                Continue
              </button>
            </div>
          ) : sent ? (
            <div className="text-center py-4">
              <CheckCircle size={40} className="text-accent mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-white mb-2">
                Check your email
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                We sent a magic link to{' '}
                <strong className="text-white">{email}</strong>.
                Click it, then come back to this tab — we&apos;ll sign you in automatically.
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors"
              >
                Got it
              </button>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
                <Mail size={22} className="text-accent" />
              </div>

              <h3 className="font-display text-xl font-bold text-white mb-2">
                Sign in to SavoryShelf
              </h3>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Enter your email — we'll send a magic link. No password needed.
              </p>

              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="you@example.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-accent transition-colors mb-2"
                autoFocus
              />

              <p className="text-xs text-zinc-500 leading-relaxed mb-6">
                We never sell or share your email. It's only used to securely
                save your recipes in the cloud.
              </p>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              <button
                onClick={send}
                disabled={loading || !email.trim()}
                className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[.98]"
              >
                {loading ? 'Sending…' : 'Send magic link'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
