export default function BookingLoading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Brand header skeleton */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-2">
          <div className="h-5 w-5 rounded-full bg-zinc-200 animate-pulse" />
          <div className="h-5 w-24 rounded bg-zinc-200 animate-pulse" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Trip summary card skeleton */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-zinc-200 mb-3" />
          <div className="h-3 w-1/2 rounded bg-zinc-100 mb-2" />
          <div className="h-3 w-1/3 rounded bg-zinc-100" />
        </div>

        {/* Input field skeletons */}
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-3 w-24 rounded bg-zinc-200 mb-2" />
              <div className="h-10 w-full rounded-lg bg-zinc-100" />
            </div>
          ))}
        </div>

        {/* Seat picker skeleton */}
        <div>
          <div className="h-3 w-20 rounded bg-zinc-200 mb-3 animate-pulse" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-zinc-100 animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Submit button skeleton */}
        <div className="h-11 w-full rounded-lg bg-zinc-200 animate-pulse" />
      </div>
    </div>
  );
}
