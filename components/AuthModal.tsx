'use client'

import { useState } from 'react'
import { X, Mail, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props { onClose: () => void }

export default function AuthModal({ onClose }: Props) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const send = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    /* Full-screen overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal box — centered, never touches screen edges */}
      <div className="relative z-10 w-full max-w-sm bg-bg border border-border rounded-2xl shadow-2xl p-8">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <X size={16} />
        </button>

        {sent ? (
          /* ── Success state ── */
          <div className="text-center">
            <CheckCircle size={40} className="text-accent mx-auto mb-4" />
            <h3 className="font-display text-xl font-bold text-text mb-2">Check your email</h3>
            <p className="text-sm text-muted leading-relaxed">
              We sent a magic link to{' '}
              <strong className="text-text">{email}</strong>.
              Click it to sign in — no password needed.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          /* ── Sign-in form ── */
          <>
            {/* Icon */}
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
              <Mail size={22} className="text-accent" />
            </div>

            <h3 className="font-display text-xl font-bold text-text mb-2">
              Sign in to SavoryShelf
            </h3>
            <p className="text-sm text-muted mb-5 leading-relaxed">
              Enter your email — we'll send a magic link. No password needed.
            </p>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="you@example.com"
              className="input mb-2"
              autoFocus
            />

            {/* Privacy disclaimer */}
            <p className="text-xs text-subtle leading-relaxed mb-5">
              We never sell or share your email. It's only used to securely save
              your recipes in the cloud.
            </p>

            {error && <p className="text-xs text-highlight mb-3">{error}</p>}

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
  )
}
