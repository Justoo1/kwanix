"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";

export default function TrackLandingPage() {
  const router = useRouter();
  const [trackingId, setTrackingId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = trackingId.trim();
    if (id) router.push(`/track/${id}`);
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-100 mb-4">
            <Package className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Track your parcel</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Enter your tracking number to see the delivery status.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="tracking-id"
              className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5"
            >
              Tracking number
            </label>
            <input
              id="tracking-id"
              type="text"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              placeholder="e.g. RP-2024-ABCD1234"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!trackingId.trim()}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            Track parcel
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400 mt-6">
          <Link href="/" className="hover:text-zinc-700 transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
