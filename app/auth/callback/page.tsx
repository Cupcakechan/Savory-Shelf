'use client'

/**
 * Auth callback route — handles all Supabase magic-link redirect patterns:
 *
 *  1. ?token_hash=xxx&type=magiclink   ← most common for email magic links
 *  2. ?code=xxx                        ← PKCE flow (if enabled in Supabase dashboard)
 *  3. #access_token=xxx                ← legacy implicit flow (hash fragment)
 *
 * Supabase dashboard: Authentication → URL Configuration
 *   Site URL:       https://savoryshelf.com  (or your Vercel URL)
 *   Redirect URLs:  https://savoryshelf.com/auth/callback
 *                   http://localhost:3000/auth/callback
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Signing you in…')

  useEffect(() => {
    const handleCallback = async () => {
      const params  = new URLSearchParams(window.location.search)
      const hash    = new URLSearchParams(window.location.hash.replace('#', ''))

      const tokenHash   = params.get('token_hash')
      const type        = params.get('type')          // 'magiclink' | 'email' | etc.
      const code        = params.get('code')           // PKCE
      const accessToken = hash.get('access_token')    // legacy implicit

      try {
        if (tokenHash && type) {
          // ── Magic-link / OTP token hash (most common) ──────────
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
          if (error) {
            console.error('[auth/callback] verifyOtp error:', error.message)
            setStatus('Sign-in failed — please try again.')
            setTimeout(() => router.replace('/'), 2000)
            return
          }
        } else if (code) {
          // ── PKCE code exchange ─────────────────────────────────
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.error('[auth/callback] exchangeCodeForSession error:', error.message)
            setStatus('Sign-in failed — please try again.')
            setTimeout(() => router.replace('/'), 2000)
            return
          }
        } else if (accessToken) {
          // ── Legacy implicit hash flow ──────────────────────────
          const refreshToken = hash.get('refresh_token') ?? ''
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (error) {
            console.error('[auth/callback] setSession error:', error.message)
          }
        } else {
          // No auth params — possibly a stale link
          console.warn('[auth/callback] No auth params found in URL')
        }
      } catch (err) {
        console.error('[auth/callback] Unexpected error:', err)
      }

      router.replace('/')
    }

    handleCallback()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <p className="text-sm text-muted animate-pulse">{status}</p>
    </div>
  )
}
