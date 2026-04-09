import type { Metadata } from "next";
import { Bus } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PublicTicket {
  id: number;
  passenger_name: string;
  seat_number: number;
  fare_ghs: number;
  status: string;
  payment_status: string;
  departure_station: string | null;
  destination_station: string | null;
  departure_time: string | null;
  vehicle_plate: string | null;
  company_name: string | null;
  brand_color: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Ticket #${id} — RoutePass` };
}

/** Simple deterministic barcode */
function barcodeStripes(seed: number): number[] {
  const bars: number[] = [];
  let s = seed * 1000003;
  for (let i = 0; i < 36; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    bars.push((Math.abs(s) % 3) + 1);
  }
  return bars;
}

export default async function PublicTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let ticket: PublicTicket | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/public/tickets/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) {
      error = "Ticket not found.";
    } else if (!res.ok) {
      error = "Could not load ticket information.";
    } else {
      ticket = await res.json();
    }
  } catch {
    error = "Could not reach the server. Please try again.";
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Bus className="h-12 w-12 text-zinc-300 mx-auto" />
          <p className="font-medium text-zinc-700">{error ?? "Ticket not found."}</p>
          <p className="text-xs text-zinc-400">Ticket ID: {id}</p>
        </div>
      </div>
    );
  }

  const accent = ticket.brand_color ?? "#1d4ed8";
  const lightBg = `${accent}12`;
  const midBg = `${accent}20`;

  const departure = ticket.departure_time ? new Date(ticket.departure_time) : null;
  const dateStr = departure
    ? departure.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const timeStr = departure
    ? departure.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const bars = barcodeStripes(ticket.id);
  const isPaid = ticket.payment_status === "paid";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ background: lightBg }}
    >
      {/* Company header */}
      <div className="mb-4 text-center">
        <p className="text-sm font-semibold text-zinc-500">
          {ticket.company_name ?? "RoutePass"}
        </p>
      </div>

      {/* Ticket card — mobile-first, vertical layout */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ border: `2px solid ${accent}30` }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ background: accent }}
        >
          <div>
            <p className="text-white font-extrabold text-lg tracking-wide uppercase">
              Bus Ticket
            </p>
            <p className="text-white text-xs opacity-80 mt-0.5">
              {ticket.company_name ?? "RoutePass"}
            </p>
          </div>
          <div
            className="rounded-xl px-3 py-1 text-center"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <p className="text-white text-[9px] uppercase tracking-wide">Seat</p>
            <p className="text-white font-extrabold text-2xl leading-none">
              {ticket.seat_number}
            </p>
          </div>
        </div>

        {/* Route */}
        <div
          className="px-5 py-4 flex items-center gap-3"
          style={{ background: midBg }}
        >
          <div className="text-center flex-1">
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: accent }}>
              From
            </p>
            <p className="font-bold text-zinc-900 text-sm leading-tight mt-0.5">
              {ticket.departure_station ?? "—"}
            </p>
          </div>
          <div className="flex-1 flex items-center">
            <svg viewBox="0 0 60 12" className="w-full h-3">
              <line x1="0" y1="6" x2="48" y2="6" stroke={accent} strokeWidth="1.5" strokeDasharray="4,3" />
              <polygon points="48,2 60,6 48,10" fill={accent} />
            </svg>
          </div>
          <div className="text-center flex-1">
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: accent }}>
              To
            </p>
            <p className="font-bold text-zinc-900 text-sm leading-tight mt-0.5">
              {ticket.destination_station ?? "—"}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="bg-white px-5 py-4 grid grid-cols-2 gap-4">
          <InfoBox label="Date" value={dateStr} accent={accent} />
          <InfoBox label="Time" value={timeStr} accent={accent} />
          <InfoBox label="Bus No." value={ticket.vehicle_plate ?? "—"} accent={accent} />
          <InfoBox label="Fare" value={`GHS ${Number(ticket.fare_ghs).toFixed(2)}`} accent={accent} />
          <div className="col-span-2">
            <InfoBox label="Passenger" value={ticket.passenger_name} accent={accent} />
          </div>
        </div>

        {/* Perforated divider */}
        <div
          className="flex items-center px-3 py-2"
          style={{ background: lightBg }}
        >
          <div className="w-4 h-4 rounded-full -ml-6" style={{ background: "white" }} />
          <div
            className="flex-1 border-t-2 border-dashed mx-1"
            style={{ borderColor: `${accent}40` }}
          />
          <div className="w-4 h-4 rounded-full -mr-6" style={{ background: "white" }} />
        </div>

        {/* Stub / barcode section */}
        <div
          className="bg-white px-5 py-4 flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: accent }}>
              Status
            </p>
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
              style={{
                background: isPaid ? "#dcfce7" : "#fef9c3",
                color: isPaid ? "#15803d" : "#a16207",
              }}
            >
              {ticket.payment_status.toUpperCase()}
            </span>
            <p className="text-[9px] uppercase tracking-wide font-semibold mt-2" style={{ color: accent }}>
              Ticket
            </p>
            <p className="text-[9px] font-mono text-zinc-500">
              #{String(ticket.id).padStart(8, "0")}
            </p>
          </div>

          {/* Barcode */}
          <div className="flex flex-col items-center">
            <div className="flex items-end gap-px h-12 bg-zinc-50 rounded px-2 py-1.5 border border-zinc-100">
              {bars.map((w, i) => (
                <div
                  key={i}
                  style={{
                    width: `${w}px`,
                    height: i % 5 === 0 ? "100%" : i % 3 === 0 ? "75%" : "88%",
                    background: i % 2 === 0 ? "#1a1a1a" : "transparent",
                  }}
                />
              ))}
            </div>
            <p className="text-[8px] font-mono text-zinc-400 mt-1">
              {String(ticket.id).padStart(8, "0")}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 text-center"
          style={{ background: accent }}
        >
          <p className="text-white text-xs opacity-90 font-medium">
            Show this ticket to board your bus
          </p>
        </div>
      </div>

      <p className="text-xs text-zinc-400 mt-6 text-center">
        Powered by RoutePass · For queries, contact your station
      </p>
    </div>
  );
}

function InfoBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div>
      <p
        className="text-[9px] uppercase tracking-wide font-semibold mb-0.5"
        style={{ color: accent }}
      >
        {label}
      </p>
      <p className="text-sm font-semibold text-zinc-800 truncate">{value}</p>
    </div>
  );
}
