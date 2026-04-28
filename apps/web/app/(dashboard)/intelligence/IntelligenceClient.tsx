"use client";

import { useState } from "react";
import { Tag, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PricingSuggestion {
  trip_id: number;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  current_price_ghs: number | null;
  seats_available: number;
  vehicle_capacity: number;
  occupancy_pct: number;
  suggested_discount_pct: number;
  suggested_price_ghs: number | null;
}

interface Props {
  pricingSuggestions: PricingSuggestion[];
}

export default function IntelligenceClient({ pricingSuggestions }: Props) {
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  if (pricingSuggestions.length === 0) return null;

  async function applyDiscount(tripId: number, discountPct: number) {
    setApplying(tripId);
    try {
      const res = await fetch(`/api/proxy/trips/${tripId}/apply-discount`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount_pct: discountPct }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail ?? "Failed to apply discount");
      }
      setApplied((prev) => new Set([...prev, tripId]));
      toast.success(`${discountPct}% discount applied to trip #${tripId}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to apply discount");
    } finally {
      setApplying(null);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4 text-amber-500" /> Pricing Suggestions
        <span className="text-xs text-zinc-400 font-normal">
          — Trips departing in 6h with low occupancy
        </span>
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Trip</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Departs</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Occupancy</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Current</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Suggested</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Discount</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pricingSuggestions.map((s) => {
              const isApplied = applied.has(s.trip_id);
              const isApplying = applying === s.trip_id;
              return (
                <tr key={s.trip_id} className={isApplied ? "bg-emerald-50" : undefined}>
                  <td className="px-4 py-2 text-xs font-medium text-zinc-800">
                    {s.departure_station_name} → {s.destination_station_name}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {new Date(s.departure_time).toLocaleTimeString("en-GH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="text-zinc-600">
                      {s.seats_available}/{s.vehicle_capacity} seats free
                    </span>
                    <span className="ml-1 text-amber-600 font-medium">
                      ({s.occupancy_pct.toFixed(0)}% full)
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-600">
                    {s.current_price_ghs != null ? `GHS ${s.current_price_ghs.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs font-semibold text-emerald-700">
                    {s.suggested_price_ghs != null ? `GHS ${s.suggested_price_ghs.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
                      -{s.suggested_discount_pct}%
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {isApplied ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle className="h-3.5 w-3.5" /> Applied
                      </span>
                    ) : (
                      <button
                        disabled={isApplying || s.current_price_ghs == null}
                        onClick={() => applyDiscount(s.trip_id, s.suggested_discount_pct)}
                        className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isApplying && <Loader2 className="h-3 w-3 animate-spin" />}
                        Apply
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
