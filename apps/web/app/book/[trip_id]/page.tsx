"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PublicTrip {
  id: number;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  vehicle_capacity: number;
  available_seat_count: number;
  price_ghs: number | null;
  company_name: string;
  brand_color: string | null;
  booking_open: boolean;
  status: string;
}

interface SeatMap {
  capacity: number;
  taken: number[];
}

interface BookResponse {
  ticket_id: number;
  authorization_url: string;
  reference: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchPublic<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg: string = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string | object };
      msg = typeof parsed?.detail === "string" ? parsed.detail : text;
    } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

function isValidGhPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, "");
  return /^(0\d{9}|233\d{9})$/.test(cleaned);
}

// ── Seat grid ──────────────────────────────────────────────────────────────────

function SeatGrid({
  seatMap,
  selected,
  onChange,
  color,
}: {
  seatMap: SeatMap;
  selected: number | null;
  onChange: (seat: number) => void;
  color: string;
}) {
  const seats = Array.from({ length: seatMap.capacity }, (_, i) => i + 1);
  const AISLE_AFTER = Math.min(20, Math.floor(seatMap.capacity / 2));
  const firstHalf  = seats.slice(0, AISLE_AFTER);
  const secondHalf = seats.slice(AISLE_AFTER);

  function Seat({ n }: { n: number }) {
    const taken  = seatMap.taken.includes(n);
    const active = selected === n;
    return (
      <button
        type="button"
        disabled={taken}
        onClick={() => !taken && onChange(n)}
        className="w-11 h-11 rounded-xl text-[11px] font-bold transition-all active:scale-95"
        style={
          active
            ? { backgroundColor: color, color: "#ffffff", boxShadow: `0 4px 12px ${color}40` }
            : taken
            ? { backgroundColor: "#f4f4f5", color: "#d4d4d8", cursor: "not-allowed" }
            : { border: `2px solid ${color}`, color, backgroundColor: "transparent" }
        }
      >
        {String(n).padStart(2, "0")}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {firstHalf.map(n => <Seat key={n} n={n} />)}
      </div>
      {secondHalf.length > 0 && (
        <>
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300">Aisle</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            {secondHalf.map(n => <Seat key={n} n={n} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ── Route SVG ──────────────────────────────────────────────────────────────────

function RouteViz({
  from,
  to,
  color,
}: {
  from: string;
  to: string;
  color: string;
}) {
  const fromLabel = from.length > 12 ? from.slice(0, 12) + "…" : from;
  const toLabel   = to.length > 12   ? to.slice(0, 12) + "…"   : to;

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-zinc-50">
      <svg viewBox="0 0 600 300" className="w-full h-full" fill="none">
        {/* Grid lines */}
        <line x1="0" y1="150" x2="600" y2="150" stroke="#e4e4e7" strokeWidth="1" />
        <line x1="300" y1="0"  x2="300" y2="300" stroke="#e4e4e7" strokeWidth="1" />
        <circle cx="300" cy="150" r="100" stroke="#e4e4e7" strokeWidth="1" />
        <circle cx="300" cy="150" r="55"  stroke="#e4e4e7" strokeWidth="0.5" />
        {/* Dashed route line */}
        <line x1="130" y1="150" x2="470" y2="150" stroke={color} strokeWidth="2" strokeDasharray="10 5" />
        {/* Departure */}
        <circle cx="130" cy="150" r="8"  fill={color} />
        <circle cx="130" cy="150" r="16" fill={color} fillOpacity="0.12" />
        {/* Destination */}
        <circle cx="470" cy="150" r="8"  fill={color} />
        <circle cx="470" cy="150" r="16" fill={color} fillOpacity="0.12" />
        {/* Labels */}
        <text x="130" y="128" textAnchor="middle" fontSize="11" fill="#3f3f46" fontWeight="700" fontFamily="Inter,sans-serif">
          {fromLabel}
        </text>
        <text x="470" y="128" textAnchor="middle" fontSize="11" fill="#3f3f46" fontWeight="700" fontFamily="Inter,sans-serif">
          {toLabel}
        </text>
      </svg>
      {/* Live badge */}
      <div
        className="absolute bottom-4 left-4 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 text-zinc-700"
        style={{ backgroundColor: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)" }}
      >
        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        Route Active
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BookTripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = String(params.trip_id);

  const [trip,      setTrip]      = useState<PublicTrip | null>(null);
  const [seatMap,   setSeatMap]   = useState<SeatMap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);

  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seat,  setSeat]  = useState<number | null>(null);

  const [phoneError,  setPhoneError]  = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    Promise.all([
      fetchPublic<PublicTrip>(`/api/v1/public/trips/${tripId}`),
      fetchPublic<SeatMap>(`/api/v1/public/trips/${tripId}/seats`),
    ])
      .then(([t, sm]) => { setTrip(t); setSeatMap(sm); })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load trip.");
      })
      .finally(() => setLoading(false));
  }, [tripId]);

  async function handleBook(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!isValidGhPhone(phone)) {
      setPhoneError("Enter a valid Ghana phone number (e.g. 0551234567).");
      return;
    }
    setPhoneError(null);
    if (!seat) { setSubmitError("Please select a seat."); return; }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const data = await fetchPublic<BookResponse>(`/api/v1/public/trips/${tripId}/book`, {
        method: "POST",
        body: JSON.stringify({
          passenger_name: name,
          passenger_phone: phone,
          passenger_email: email || undefined,
          seat_number: seat,
        }),
      });
      window.location.href = data.authorization_url;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Booking failed. Please try again.");
      setSubmitting(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fff8f7" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin" />
          <p className="text-sm text-zinc-400 font-medium">Loading trip…</p>
        </div>
      </div>
    );
  }

  if (loadError || !trip || !seatMap) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#fff8f7" }}>
        <div className="text-center space-y-3">
          <p className="text-zinc-700 font-semibold">Trip not available</p>
          <p className="text-sm text-zinc-400">{loadError ?? "This trip could not be found."}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-6 py-3 text-sm font-bold text-white hover:opacity-80 transition-opacity"
          >
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  const color    = trip.brand_color ?? "#18181b";
  const depTime  = fmt(trip.departure_time);
  const total    = seat && trip.price_ghs != null ? trip.price_ghs : null;
  const freeBerths = seatMap.capacity - seatMap.taken.length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fff8f7" }}>
      {/* Sticky glassmorphism header */}
      <header
        className="fixed top-0 w-full z-50 backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
        style={{ backgroundColor: "rgba(255,248,247,0.85)" }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="hover:opacity-60 transition-opacity"
              style={{ color }}
              aria-label="Go back"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <span className="text-2xl font-black italic tracking-tight" style={{ color }}>
              Kwanix
            </span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <button className="hover:opacity-60 transition-opacity" aria-label="Share">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            </button>
            <button className="hover:opacity-60 transition-opacity" aria-label="Save">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-32 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Hero + floating trip info card ── */}
        <section className="relative w-full mb-16">
          {/* Hero panel */}
          <div
            className="relative h-[380px] md:h-[460px] w-full rounded-3xl overflow-hidden flex items-end"
            style={{ backgroundColor: color }}
          >
            {/* Bus photo — luminosity blend lets brand color tint the image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Luxury coach bus"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDR-D2SnoNnZrkdymlMiYWQWAnXs1-H7YzRzgyoq_fAolJs37ZU4VokpjTWaZlq5zXknVje6xkfL3NQZCT7vCTodx_uQ0rsZKF7X3lz3Dp2Vvx01DNLIcuLlMF4VYcgxjJdsmbK0V8hlkWh__66CDxl_RzznBo8AsxTzO0UxY2kG83ZKJwhAunqXQdXxAkSHxh4Xldt-QprUsLEEo8IlpkSDMxeWEiNE1WRkZ76jle44ZUFt8-UImWMr_CFtMGH0NiyGbPyfYszCsWl"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.55, mixBlendMode: "luminosity" }}
            />

            {/* Gradient: bottom-to-top for text + left-to-right to protect text column */}
            <div className="absolute inset-0 bg-linear-to-t from-black/65 via-black/10 to-transparent" />
            <div className="absolute inset-0 bg-linear-to-r from-black/30 via-transparent to-transparent" />

            {/* Hero text */}
            <div className="relative z-10 p-8 md:p-12">
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">
                {trip.company_name}
              </p>
              <h2 className="font-black text-white text-4xl md:text-6xl tracking-tighter leading-none">
                {trip.departure_station_name}
                <br />
                <span className="opacity-50 text-3xl md:text-4xl font-extrabold">to</span>{" "}
                {trip.destination_station_name}
              </h2>
            </div>
          </div>

          {/* Floating glassmorphism trip info card */}
          <div
            className="absolute -bottom-10 right-4 left-4 md:right-12 md:left-auto md:w-96 p-6 rounded-3xl border-l-[6px] shadow-[0_24px_48px_rgba(0,0,0,0.14)]"
            style={{
              backgroundColor: "rgba(255,255,255,0.80)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderLeftColor: color,
            }}
          >
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color }}>
                  {trip.company_name}
                </p>
                <h3 className="font-black text-lg text-zinc-900 tracking-tight leading-snug">
                  {trip.departure_station_name} → {trip.destination_station_name}
                </h3>
              </div>
              <span className="shrink-0 px-3 py-1 bg-zinc-100 text-zinc-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {trip.status ?? "Scheduled"}
              </span>
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-zinc-200/60">
              <div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">Departure</p>
                <p className="font-black text-sm text-zinc-900">{depTime}</p>
              </div>
              {trip.price_ghs != null && (
                <div className="ml-auto text-right">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">Fare</p>
                  <p className="font-black text-xl" style={{ color }}>
                    GHS {trip.price_ghs.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mt-12">

          {/* Left column: route viz + features */}
          <div className="lg:col-span-7 space-y-12">
            <div className="space-y-5">
              <h4 className="text-2xl font-black tracking-tight text-zinc-900">The Route</h4>
              <RouteViz
                from={trip.departure_station_name}
                to={trip.destination_station_name}
                color={color}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-8 bg-white rounded-3xl space-y-4 shadow-[0_8px_48px_rgba(0,0,0,0.04)]">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${color}18` }}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                  </svg>
                </div>
                <h5 className="font-black text-zinc-900">Onboard Connectivity</h5>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Stay connected throughout your journey with onboard wifi on select routes.
                </p>
              </div>
              <div className="p-8 bg-white rounded-3xl space-y-4 shadow-[0_8px_48px_rgba(0,0,0,0.04)]">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-50">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h5 className="font-black text-zinc-900">Safe & Comfortable</h5>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  All vehicles are regularly inspected and maintained to the highest safety standards.
                </p>
              </div>
            </div>
          </div>

          {/* Right column: sticky booking panel */}
          <div className="lg:col-span-5">
            <div className="sticky top-28">
              <form id="booking-form" onSubmit={handleBook}>
                <div className="bg-white p-8 rounded-4xl shadow-[0_24px_48px_rgba(0,0,0,0.08)] space-y-8">

                  {!trip.booking_open && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4 text-sm text-amber-700 font-medium">
                      Online bookings are currently closed for this trip.
                    </div>
                  )}

                  {/* Seat selection */}
                  <div>
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <h4 className="text-2xl font-black tracking-tight text-zinc-900">Select Cabin</h4>
                        <p className="text-xs text-zinc-400 font-medium mt-0.5">
                          {freeBerths} of {seatMap.capacity} berths available
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <span className="w-3 h-3 rounded-sm bg-zinc-100 inline-block" />
                          Taken
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <span className="w-3 h-3 rounded-sm border-2 inline-block" style={{ borderColor: color }} />
                          Free
                        </span>
                      </div>
                    </div>

                    <div className="bg-zinc-50 rounded-2xl p-5">
                      <SeatGrid
                        seatMap={seatMap}
                        selected={seat}
                        onChange={setSeat}
                        color={color}
                      />
                    </div>
                  </div>

                  {/* Passenger details */}
                  <div className="space-y-4">
                    <h5 className="text-base font-black text-zinc-900 tracking-tight">Passenger Details</h5>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                        Full Name
                      </label>
                      <input
                        required
                        maxLength={100}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Kwame Mensah"
                        className="w-full rounded-2xl bg-zinc-50 px-4 py-3.5 text-sm font-medium text-zinc-900 placeholder-zinc-300 focus:outline-none focus:bg-white transition-all"
                        style={{ boxShadow: "0 0 0 0px transparent" }}
                        onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${color}20`; e.currentTarget.style.backgroundColor = "#fff"; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.backgroundColor = "#fafafa"; }}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                        Phone{" "}
                        <span className="normal-case font-medium text-zinc-300 tracking-normal">
                          (Ghana: 055… or 233…)
                        </span>
                      </label>
                      <input
                        required
                        maxLength={20}
                        value={phone}
                        onChange={e => { setPhone(e.target.value); setPhoneError(null); }}
                        placeholder="0551234567"
                        className={`w-full rounded-2xl bg-zinc-50 px-4 py-3.5 text-sm font-medium text-zinc-900 placeholder-zinc-300 focus:outline-none focus:bg-white transition-all ${phoneError ? "ring-2 ring-red-400" : ""}`}
                        onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${color}20`; e.currentTarget.style.backgroundColor = "#fff"; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.backgroundColor = "#fafafa"; }}
                      />
                      {phoneError && (
                        <p className="mt-1.5 text-xs text-red-500 font-medium">{phoneError}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                        Email{" "}
                        <span className="normal-case font-medium text-zinc-300 tracking-normal">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="email"
                        maxLength={100}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-2xl bg-zinc-50 px-4 py-3.5 text-sm font-medium text-zinc-900 placeholder-zinc-300 focus:outline-none focus:bg-white transition-all"
                        onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${color}20`; e.currentTarget.style.backgroundColor = "#fff"; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.backgroundColor = "#fafafa"; }}
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="space-y-3 pt-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-400 font-medium">Selected seat</span>
                      <span className="font-black text-zinc-900">
                        {seat ? `Seat ${String(seat).padStart(2, "0")}` : "—"}
                      </span>
                    </div>
                    {total != null && (
                      <div className="flex justify-between items-center">
                        <span className="font-black text-zinc-900 text-lg">Total Due</span>
                        <span className="font-black text-xl" style={{ color }}>
                          GHS {total.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {submitError && (
                    <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-600 font-medium">
                      {submitError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !seat || !trip.booking_open}
                    className="w-full py-5 rounded-2xl text-lg font-black text-white tracking-tight transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 12px 32px ${color}35`,
                    }}
                  >
                    {submitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Redirecting to payment…
                      </>
                    ) : (
                      <>
                        Book & Pay
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-end pb-6 pt-3 px-6 backdrop-blur-2xl rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.08)]"
        style={{ backgroundColor: "rgba(255,248,247,0.92)" }}
      >
        <button
          onClick={() => router.back()}
          className="flex flex-col items-center gap-1 text-zinc-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
        <button
          type="submit"
          form="booking-form"
          disabled={submitting || !seat || !trip.booking_open}
          className="flex flex-col items-center gap-1 text-white rounded-full px-8 py-3 -translate-y-1 text-[10px] font-bold uppercase tracking-widest shadow-lg disabled:opacity-40"
          style={{ backgroundColor: color }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Book
        </button>
        <button className="flex flex-col items-center gap-1 text-zinc-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:opacity-60 transition-opacity">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          Share
        </button>
      </nav>
    </div>
  );
}
