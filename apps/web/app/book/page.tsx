"use client";

import { useState } from "react";
import { Bus, Clock, MapPin, ChevronRight, ArrowLeft, Loader2 } from "lucide-react";

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
    let msg = text;
    try {
      msg = JSON.parse(text)?.detail ?? text;
    } catch { /* noop */ }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json() as Promise<T>;
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
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
              className={`h-8 w-8 rounded text-xs font-semibold transition-colors
                ${taken ? "bg-zinc-200 text-zinc-400 cursor-not-allowed" : ""}
                ${!taken && !active ? "bg-zinc-100 hover:bg-emerald-100 text-zinc-700" : ""}
                ${active ? "bg-emerald-600 text-white ring-2 ring-emerald-400" : ""}
              `}
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

// ── Booking form ──────────────────────────────────────────────────────────────

function BookingForm({
  trip,
  onBack,
}: {
  trip: PublicTrip;
  onBack: () => void;
}) {
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [seatsLoaded, setSeatsLoaded] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seat, setSeat] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load seat map once on mount
  if (!seatsLoaded && !loadingSeats) {
    setLoadingSeats(true);
    fetchPublic<SeatMap>(`/api/v1/public/trips/${trip.id}/seats`)
      .then((sm) => { setSeatMap(sm); setSeatsLoaded(true); setLoadingSeats(false); })
      .catch(() => { setSeatsLoaded(true); setLoadingSeats(false); });
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!seat) { setError("Please select a seat."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const data = await fetchPublic<BookResponse>(
        `/api/v1/public/trips/${trip.id}/book`,
        {
          method: "POST",
          body: JSON.stringify({
            passenger_name: name,
            passenger_phone: phone,
            passenger_email: email || undefined,
            seat_number: seat,
          }),
        }
      );
      window.location.href = data.authorization_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to trips
      </button>

      {/* Trip summary */}
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
      </div>

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
            Phone <span className="text-zinc-400 font-normal">(Ghana format: 055…)</span>
          </label>
          <input
            required
            maxLength={20}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0551234567"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Email <span className="text-zinc-400 font-normal">(optional, for receipt)</span>
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

        {/* Seat picker */}
        {loadingSeats ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading seats…
          </div>
        ) : seatMap ? (
          <SeatPicker seatMap={seatMap} selected={seat} onChange={setSeat} />
        ) : (
          <p className="text-sm text-zinc-400">Could not load seat map.</p>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !seat}
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
  );
}

// ── Trip list ─────────────────────────────────────────────────────────────────

function TripCard({ trip, onSelect }: { trip: PublicTrip; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 text-sm">
            {trip.departure_station_name}{" "}
            <span className="text-zinc-400 font-normal">→</span>{" "}
            {trip.destination_station_name}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{trip.company_name}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 mt-0.5 shrink-0 transition-colors" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {fmt(trip.departure_time)}
        </span>
        <span className="flex items-center gap-1">
          <Bus className="h-3.5 w-3.5" />
          {trip.available_seat_count} seat{trip.available_seat_count !== 1 ? "s" : ""} left
        </span>
        {trip.price_ghs != null && (
          <span className="font-semibold text-emerald-700">GHS {trip.price_ghs.toFixed(2)}</span>
        )}
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BookPage() {
  const [trips, setTrips] = useState<PublicTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<PublicTrip | null>(null);

  // Fetch trips on first render
  if (!loaded && !loading) {
    setLoading(true);
    fetchPublic<PublicTrip[]>("/api/v1/public/trips")
      .then((data) => { setTrips(data); setLoaded(true); setLoading(false); })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load trips.");
        setLoaded(true);
        setLoading(false);
      });
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Bus className="h-5 w-5 text-emerald-600" />
            <span className="font-bold text-zinc-900 text-lg">Kwanix</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Online ticket booking</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {selectedTrip ? (
          <BookingForm trip={selectedTrip} onBack={() => setSelectedTrip(null)} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-zinc-900">Available Trips</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                Select a trip to book your seat and pay online.
              </p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {trips && trips.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-zinc-100 rounded-full p-4 mb-3">
                  <MapPin className="h-6 w-6 text-zinc-400" />
                </div>
                <p className="text-sm font-medium text-zinc-600">No trips available</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Check back later for available bookings.
                </p>
              </div>
            )}

            {trips && trips.length > 0 && (
              <div className="space-y-3">
                {trips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onSelect={() => setSelectedTrip(trip)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
