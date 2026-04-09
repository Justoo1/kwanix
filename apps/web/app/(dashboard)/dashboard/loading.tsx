export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted/60" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl p-6 shadow-lg animate-pulse"
            style={{ background: `hsl(${200 + i * 40} 60% 60%)` }}
          >
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="mb-4 h-10 w-10 rounded-xl bg-white/30" />
            <div className="mb-2 h-9 w-20 rounded-lg bg-white/30" />
            <div className="h-3.5 w-28 rounded bg-white/20" />
            <div className="mt-1.5 h-3 w-20 rounded bg-white/15" />
          </div>
        ))}
      </div>

      {/* Breakdown card skeleton */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-8 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
