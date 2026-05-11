'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).finally(() => router.replace('/'))
    } else {
      router.replace('/')
    }
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <p className="text-sm text-muted animate-pulse">Signing you in…</p>
    </div>
  )
}
