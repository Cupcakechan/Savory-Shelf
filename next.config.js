/** @type {import('next').NextConfig} */

// ── Content-Security-Policy ───────────────────────────────
// 'unsafe-inline' in script-src is required for:
//   • Next.js's server-injected hydration / theme-toggle inline script
// 'unsafe-inline' in style-src is required for:
//   • Tailwind CSS utility classes applied as inline styles by Next.js
// All xAI / Supabase admin API calls are server-side (Server Actions)
// so they never touch the browser's fetch and need no CSP entry.

const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  // data:  → in-memory base64 placeholder images
  // https: → Supabase Storage public URLs
  "img-src 'self' data: https:",
  // Fonts are self-hosted by next/font; external entry kept as fallback
  "font-src 'self' https://fonts.gstatic.com",
  // Supabase REST + Auth (https) and Realtime (wss); Vercel Analytics
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  // Prevent this page from being loaded inside any iframe
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  // Deny iframe embedding (legacy browsers; frame-ancestors covers modern ones)
  { key: 'X-Frame-Options',          value: 'DENY' },
  // Send only origin in the Referer header, not the full URL
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  // Disable browser features the app does not use
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy',  value: cspHeader },
]

const nextConfig = {
  async headers() {
    return [
      {
        // Apply to every route, including API routes and static assets
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
