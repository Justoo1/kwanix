"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, Clock, Users, ArrowRight, Loader2 } from "lucide-react";
import PublicNav from "@/components/public-nav";
import DiscoverDatePicker from "./date-range-picker";

interface RouteResult {
  company_name: string;
  company_code: string;
  brand_color: string | null;
  trip_id: number;
  departure_time: string;
  departure_station_name: string;
  departure_station_city: string | null;
  destination_station_name: string;
  destination_station_city: string | null;
  price_ticket_base: number | null;
  seats_available: number;
  booking_open: boolean;
  status: string;
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

function DiscoverContent() {
  const searchParams = useSearchParams();

  const [fromCity, setFromCity] = useState(searchParams.get("from_city") ?? "");
  const [toCity,   setToCity]   = useState(searchParams.get("to_city")   ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("date_from") ?? "");
  const [dateTo,   setDateTo]   = useState(searchParams.get("date_to")   ?? "");

  const [results, setResults] = useState<RouteResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const didAutoSearch = useRef(false);

  async function doSearch(from: string, to: string, dFrom: string, dTo: string) {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const params = new URLSearchParams();
      if (from.trim())  params.set("from_city", from.trim());
      if (to.trim())    params.set("to_city",   to.trim());
      if (dFrom)        params.set("date_from",  dFrom);
      if (dTo)          params.set("date_to",    dTo);

      const res = await fetch(`/api/proxy/public/routes?${params.toString()}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `Error ${res.status}`);
      }
      setResults((await res.json()) as RouteResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search routes.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-search if URL has pre-filled params (from home bento)
  useEffect(() => {
    if (didAutoSearch.current) return;
    const from  = searchParams.get("from_city") ?? "";
    const to    = searchParams.get("to_city")   ?? "";
    const dFrom = searchParams.get("date_from") ?? "";
    const dTo   = searchParams.get("date_to")   ?? "";
    if (from || to || dFrom || dTo) {
      didAutoSearch.current = true;
      doSearch(from, to, dFrom, dTo);
    }
  }, [searchParams]);

  function handleCitySearch(e: React.FormEvent) {
    e.preventDefault();
    doSearch(fromCity, toCity, dateFrom, dateTo);
  }

  function handleDateChange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    doSearch(fromCity, toCity, from, to);
  }

  const inputClass =
    "w-full pl-11 pr-4 py-4 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border-none outline-none focus:ring-2 focus:ring-primary/20 focus:bg-card transition-all duration-200";

  const activeFilters = [
    fromCity && `From: ${fromCity}`,
    toCity   && `To: ${toCity}`,
    dateFrom && dateTo   ? `${dateFrom} – ${dateTo}` : dateFrom ? `From ${dateFrom}` : dateTo ? `To ${dateTo}` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PublicNav />

      {/* Page header */}
      <div className="bg-secondary" style={{ padding: "48px 0 40px" }}>
        <div className="max-w-4xl mx-auto px-8">
          <h1
            className="text-4xl font-bold tracking-tight mb-2 text-foreground"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Find your next trip
          </h1>
          <p className="text-muted-foreground" style={{ fontFamily: "var(--font-inter)" }}>
            Filter by route, date, or both — then see which companies are running.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-10 w-full space-y-5">

        {/* ── 1. City search ─────────────────────────────────────── */}
        <form
          onSubmit={handleCitySearch}
          className="bg-card rounded-4xl p-7"
          style={{ boxShadow: "0 24px 48px -12px rgba(13, 31, 23, 0.08)" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Search by route
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-primary" />
              <input
                type="text"
                placeholder="Departure city (e.g. Accra)"
                value={fromCity}
                onChange={(e) => setFromCity(e.target.value)}
                className={inputClass}
                style={{ fontFamily: "var(--font-inter)" }}
              />
            </div>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-primary" />
              <input
                type="text"
                placeholder="Destination city (e.g. Kumasi)"
                value={toCity}
                onChange={(e) => setToCity(e.target.value)}
                className={inputClass}
                style={{ fontFamily: "var(--font-inter)" }}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all duration-200"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Searching…</>
            ) : (
              <>Search routes<ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </form>

        {/* ── 2. Date range filter ────────────────────────────────── */}
        <div
          className="bg-card rounded-3xl px-7 py-5 flex items-center gap-4"
          style={{ boxShadow: "0 4px 24px -4px rgba(13, 31, 23, 0.06)" }}
        >
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground shrink-0"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Filter by date
          </p>
          <div className="w-px h-5 bg-border shrink-0" />
          <DiscoverDatePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={handleDateChange}
          />
        </div>

        {/* Active filter summary */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-inter)" }}>
              Active filters:
            </span>
            {activeFilters.map((f) => (
              <span
                key={f as string}
                className="inline-block rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 text-primary"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-2xl px-6 py-4 text-sm bg-destructive/10 text-destructive"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            {error}
          </div>
        )}

        {/* ── 3. Results ─────────────────────────────────────────── */}
        {results !== null && (
          <div className="space-y-4 pt-2">
            {results.length === 0 ? (
              <div className="text-center py-20">
                <p
                  className="text-lg font-semibold mb-2 text-foreground"
                  style={{ fontFamily: "var(--font-jakarta)" }}
                >
                  No trips found
                </p>
                <p
                  className="text-sm text-muted-foreground"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  Try different city names or adjust the date range.
                </p>
              </div>
            ) : (
              <>
                <p
                  className="text-sm text-muted-foreground"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  {results.length} trip{results.length !== 1 ? "s" : ""} found
                </p>

                {results.map((r) => {
                  const accentColor = r.brand_color ?? "#008A56";
                  const initials = r.company_name.slice(0, 2).toUpperCase();
                  const soldOut = r.seats_available === 0;
                  const canBook = r.booking_open && !soldOut;
                  const isBoarding = r.status === "loading";

                  return (
                    <div
                      key={r.trip_id}
                      className="bg-card rounded-[32px] p-7 md:p-8 transition-all duration-300 hover:-translate-y-0.5"
                      style={{
                        borderLeft: `4px solid ${accentColor}`,
                        boxShadow: "0 8px 48px rgba(13, 31, 23, 0.05)",
                      }}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
                        {/* Company badge */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div
                            className="h-11 w-11 rounded-2xl flex items-center justify-center text-white text-sm font-black"
                            style={{ backgroundColor: accentColor }}
                          >
                            {initials}
                          </div>
                          <div>
                            <p
                              className="text-sm font-bold text-foreground leading-tight"
                              style={{ fontFamily: "var(--font-jakarta)" }}
                            >
                              {r.company_name}
                            </p>
                            <p
                              className="text-xs text-muted-foreground uppercase tracking-wide"
                              style={{ fontFamily: "var(--font-inter)" }}
                            >
                              {r.company_code}
                            </p>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="hidden md:block w-px h-12 bg-border shrink-0" />

                        {/* Route + meta */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {isBoarding && (
                            <span className="inline-block px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-bold uppercase tracking-widest">
                              Boarding
                            </span>
                          )}
                          <div className="flex items-center gap-2 text-xl font-black tracking-tight flex-wrap text-foreground"
                            style={{ fontFamily: "var(--font-jakarta)" }}
                          >
                            <span>
                              {r.departure_station_name}
                              {r.departure_station_city && (
                                <span className="text-base font-normal text-muted-foreground">
                                  {" "}({r.departure_station_city})
                                </span>
                              )}
                            </span>
                            <svg
                              className="w-5 h-5 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              style={{ color: accentColor }}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span>
                              {r.destination_station_name}
                              {r.destination_station_city && (
                                <span className="text-base font-normal text-muted-foreground">
                                  {" "}({r.destination_station_city})
                                </span>
                              )}
                            </span>
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground"
                            style={{ fontFamily: "var(--font-inter)" }}
                          >
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {formatDateTime(r.departure_time)}
                            </span>
                            <span
                              className={`flex items-center gap-1.5 font-semibold ${
                                soldOut
                                  ? "text-muted-foreground"
                                  : r.seats_available < 5
                                  ? "text-amber-600"
                                  : "text-primary"
                              }`}
                            >
                              <Users className="h-3.5 w-3.5 shrink-0" />
                              {soldOut
                                ? "Sold out"
                                : `${r.seats_available} seat${r.seats_available !== 1 ? "s" : ""} left`}
                            </span>
                          </div>
                        </div>

                        {/* Price + CTA */}
                        <div className="flex items-center gap-6 shrink-0 md:ml-auto">
                          {r.price_ticket_base != null && (
                            <div className="text-right">
                              <p className="text-xs font-bold uppercase tracking-tighter text-muted-foreground mb-0.5" style={{ fontFamily: "var(--font-inter)" }}>
                                Fare from
                              </p>
                              <p className="text-2xl md:text-3xl font-black text-foreground leading-none" style={{ fontFamily: "var(--font-jakarta)" }}>
                                GHS {r.price_ticket_base.toFixed(2)}
                              </p>
                            </div>
                          )}
                          {soldOut ? (
                            <span
                              className="inline-flex items-center rounded-2xl bg-secondary px-6 py-3.5 text-sm font-black text-muted-foreground uppercase tracking-widest"
                              style={{ fontFamily: "var(--font-jakarta)" }}
                            >
                              Sold out
                            </span>
                          ) : !canBook ? (
                            <span
                              className="inline-flex items-center rounded-2xl bg-secondary px-6 py-3.5 text-sm font-black text-muted-foreground uppercase tracking-widest"
                              style={{ fontFamily: "var(--font-jakarta)" }}
                            >
                              Not open yet
                            </span>
                          ) : (
                            <a
                              href={`/book/${r.trip_id}`}
                              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black text-white transition-all shadow-lg hover:shadow-xl hover:opacity-90 active:scale-95"
                              style={{
                                fontFamily: "var(--font-jakarta)",
                                backgroundColor: accentColor,
                              }}
                            >
                              Book
                              <ArrowRight className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverContent />
    </Suspense>
  );
}
