// app/my-recipes/loading.tsx
// Shown automatically by Next.js App Router during navigation to this route.
// Mirrors the exact layout of page.tsx so the transition feels instant.

export default function MyRecipesLoading() {
  return (
    <div className="py-8">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-baseline justify-between mb-5">
        <div className="h-8 w-32 bg-surface rounded-xl animate-pulse" />
        <div className="h-4 w-16 bg-surface rounded-full animate-pulse" />
      </div>

      {/* ── Search bar ──────────────────────────────────── */}
      <div className="h-11 bg-surface border border-border rounded-xl animate-pulse mb-5" />

      {/* ── Tag pills row ───────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-7 rounded-full bg-surface border border-border animate-pulse"
            style={{ width: `${52 + i * 12}px` }}
          />
        ))}
      </div>

      {/* ── Recipe card grid ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-border rounded-2xl overflow-hidden animate-pulse"
          >
            {/* Card image */}
            <div className="aspect-[4/3] bg-border" />

            {/* Card body */}
            <div className="p-4 space-y-2.5">
              <div className="h-3.5 bg-border rounded-full w-11/12" />
              <div className="h-3.5 bg-border rounded-full w-3/4" />
              <div className="h-3 bg-border rounded-full w-1/2 mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
