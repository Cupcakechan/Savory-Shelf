import type { NextConfig } from 'next'

// Content-Security-Policy is intentionally absent from these static headers.
// It is generated per-request in middleware.ts with a fresh nonce so that
// 'unsafe-inline' can be removed from script-src.
// These headers are safe to apply statically to every route.

const securityHeaders = [
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  images: { unoptimized: true },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
