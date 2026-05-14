import type { NextConfig } from 'next'

// ── Content-Security-Policy ───────────────────────────────
// 'unsafe-inline' in script-src: required for Next.js theme-toggle inline script
// 'unsafe-inline' in style-src:  required for Tailwind inline styles injected by Next.js
// xAI / Supabase admin calls are server-side (Server Actions) — no browser CSP entry needed.

const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  // data: → in-memory base64 placeholder; https: → Supabase Storage public URLs
  "img-src 'self' data: https:",
  // Fonts are self-hosted by next/font; external entry kept as fallback
  "font-src 'self' https://fonts.gstatic.com",
  // Supabase REST + Auth (https) and Realtime (wss); Vercel Analytics
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: cspHeader },
]

const nextConfig: NextConfig = {
  // Preserve existing image setting
  images: { unoptimized: true },

  async headers() {
    return [
      {
        // Apply security headers to every route, including API routes and static assets
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
