"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Bus, ArrowLeft, Loader2, MapPin } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Ghana phone validation ────────────────────────────────────────────────────

function isValidGhPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, "");
  return /^(0\d{9}|233\d{9})$/.test(cleaned);
}

// ── Seat grid ─────────────────────────────────────────────────────────────────

function SeatPicker({
  seatMap,
  selected,
  onChange,
}: {
  seatMap: SeatMap;
  selected: number | null;
  onChange: (seat: number) => void;
}) {
  const seats = Array.from({ length: seatMap.capacity }, (_, i) => i + 1);
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-2">Select your seat</p>
      <div className="grid grid-cols-8 gap-1.5">
        {seats.map((n) => {
          const taken = seatMap.taken.includes(n);
          const active = selected === n;
          return (
            <button
              key={n}
              type="button"
              disabled={taken}
              onClick={() => !taken && onChange(n)}
              className={[
                "h-8 w-8 rounded text-xs font-semibold transition-colors",
                taken ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : "",
                !taken && !active ? "bg-zinc-100 hover:bg-emerald-100 text-zinc-700" : "",
                active ? "bg-emerald-600 text-white ring-2 ring-emerald-400" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-zinc-200 inline-block" /> Taken
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-zinc-100 inline-block" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-600 inline-block" /> Selected
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BookTripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = String(params.trip_id);

  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seat, setSeat] = useState<number | null>(null);

  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchPublic<PublicTrip>(`/api/v1/public/trips/${tripId}`),
      fetchPublic<SeatMap>(`/api/v1/public/trips/${tripId}/seats`),
    ])
      .then(([t, sm]) => {
        setTrip(t);
        setSeatMap(sm);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load trip.");
      })
      .finally(() => setLoading(false));
  }, [tripId]);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();

    if (!isValidGhPhone(phone)) {
      setPhoneError("Enter a valid Ghana phone number (e.g. 0551234567 or 233551234567).");
      return;
    }
    setPhoneError(null);

    if (!seat) {
      setSubmitError("Please select a seat.");
      return;
    }
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
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (loadError || !trip || !seatMap) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="bg-zinc-100 rounded-full p-4 w-fit mx-auto mb-4">
            <MapPin className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="text-sm font-medium text-zinc-700 mb-1">Trip not available</p>
          <p className="text-xs text-zinc-500 mb-6">{loadError ?? "This trip could not be found."}</p>
          <a
            href="/discover"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to search
          </a>
        </div>
      </div>
    );
  }

  // ── Booking form ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-emerald-600" />
            <span className="font-bold text-zinc-900 text-lg">RoutePass</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Online ticket booking</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Trip summary card */}
        <div
          className="rounded-xl border border-zinc-200 bg-white p-4 mb-6 shadow-sm"
          style={trip.brand_color ? { borderLeftColor: trip.brand_color, borderLeftWidth: 3 } : {}}
        >
          <p className="text-xs text-zinc-500 mb-1">{trip.company_name}</p>
          <p className="font-semibold text-zinc-900">
            {trip.departure_station_name} → {trip.destination_station_name}
          </p>
          <p className="text-sm text-zinc-500 mt-0.5">{fmt(trip.departure_time)}</p>
          {trip.price_ghs != null && (
            <p className="text-sm font-medium text-emerald-700 mt-1">
              GHS {trip.price_ghs.toFixed(2)}
            </p>
          )}
          <p className="text-xs text-zinc-400 mt-1">
            {trip.available_seat_count} seat{trip.available_seat_count !== 1 ? "s" : ""} available
          </p>
        </div>

        {!trip.booking_open && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-2">
            Online bookings are currently closed for this trip.
          </div>
        )}

        <form onSubmit={handleBook} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Full name</label>
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kwame Mensah"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Phone{" "}
              <span className="text-zinc-400 font-normal">(Ghana format: 055… or 23355…)</span>
            </label>
            <input
              required
              maxLength={20}
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
              placeholder="0551234567"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                phoneError ? "border-red-400" : "border-zinc-300"
              }`}
            />
            {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Email{" "}
              <span className="text-zinc-400 font-normal">(optional — for receipt)</span>
            </label>
            <input
              type="email"
              maxLength={100}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <SeatPicker seatMap={seatMap} selected={seat} onChange={setSeat} />

          {submitError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !seat || !trip.booking_open}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to payment…
              </span>
            ) : (
              "Book & Pay"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
