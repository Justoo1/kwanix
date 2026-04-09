"use client";

import { useState } from "react";
import { Search, MapPin, Clock, Users } from "lucide-react";

interface RouteResult {
  company_name: string;
  company_code: string;
  trip_id: number;
  departure_time: string;
  departure_station_name: string;
  departure_station_city: string | null;
  destination_station_name: string;
  destination_station_city: string | null;
  price_ticket_base: number | null;
  seats_available: number;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DiscoverPage() {
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [results, setResults] = useState<RouteResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const params = new URLSearchParams();
      if (fromCity.trim()) params.set("from_city", fromCity.trim());
      if (toCity.trim()) params.set("to_city", toCity.trim());

      const res = await fetch(`/api/proxy/public/routes?${params.toString()}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `Error ${res.status}`);
      }
      const data = (await res.json()) as RouteResult[];
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search routes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-zinc-900">Find a trip</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Search available bus routes across all companies.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Search form */}
        <form onSubmit={handleSearch} className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
                From (city)
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="e.g. Accra"
                  value={fromCity}
                  onChange={(e) => setFromCity(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
                To (city)
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="e.g. Kumasi"
                  value={toCity}
                  onChange={(e) => setToCity(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              <Search className="h-4 w-4" />
              {loading ? "Searching…" : "Search routes"}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {results !== null && (
          <>
            {results.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">
                No available trips found for those cities. Try different search terms.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-500">
                  {results.length} trip{results.length !== 1 ? "s" : ""} found
                </p>
                {results.map((r) => (
                  <div
                    key={r.trip_id}
                    className="bg-white rounded-xl border border-zinc-200 p-5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <p className="font-semibold text-zinc-900">
                          {r.departure_station_name}
                          {r.departure_station_city && (
                            <span className="font-normal text-zinc-500">
                              {" "}({r.departure_station_city})
                            </span>
                          )}
                          {" → "}
                          {r.destination_station_name}
                          {r.destination_station_city && (
                            <span className="font-normal text-zinc-500">
                              {" "}({r.destination_station_city})
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(r.departure_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {r.seats_available} seat{r.seats_available !== 1 ? "s" : ""} left
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">{r.company_name}</p>
                      </div>

                      <div className="text-right space-y-2 shrink-0">
                        {r.price_ticket_base != null && (
                          <p className="text-lg font-bold text-zinc-900">
                            GHS {r.price_ticket_base.toFixed(2)}
                          </p>
                        )}
                        {r.seats_available > 0 ? (
                          <a
                            href={`/book/${r.trip_id}`}
                            className="inline-block rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
                          >
                            Book now
                          </a>
                        ) : (
                          <span className="inline-block rounded-lg bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-400">
                            Sold out
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
