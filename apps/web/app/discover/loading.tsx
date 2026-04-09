export default function DiscoverLoading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header skeleton */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-zinc-200 animate-pulse" />
          <div className="h-5 w-24 rounded bg-zinc-200 animate-pulse" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {/* Search bar skeleton */}
        <div className="flex gap-2 animate-pulse">
          <div className="h-10 flex-1 rounded-lg bg-zinc-200" />
          <div className="h-10 flex-1 rounded-lg bg-zinc-200" />
          <div className="h-10 w-24 rounded-lg bg-zinc-200" />
        </div>

        {/* Result card skeletons */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-zinc-200 bg-white p-5 animate-pulse"
          >
            <div className="flex justify-between mb-3">
              <div className="h-4 w-40 rounded bg-zinc-200" />
              <div className="h-4 w-16 rounded bg-zinc-100" />
            </div>
            <div className="h-3 w-32 rounded bg-zinc-100 mb-2" />
            <div className="h-3 w-24 rounded bg-zinc-100 mb-4" />
            <div className="h-9 w-28 rounded-lg bg-zinc-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
