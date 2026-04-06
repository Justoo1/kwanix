import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { apiFetch } from "@/lib/api";
import CancelButton from "./cancel-button";
import PrintButton from "./print-button";
import QrButton from "./qr-button";
import ShareButton from "./share-button";

interface TicketDetail {
  id: number;
  trip_id: number;
  passenger_name: string;
  passenger_phone: string;
  seat_number: number;
  fare_ghs: number;
  status: string;
  payment_status: string;
  company_name: string | null;
  brand_color: string | null;
  departure_station: string | null;
  destination_station: string | null;
  departure_time: string | null;
  vehicle_plate: string | null;
}

/** Generate a deterministic fake barcode pattern from a number */
function barcodeStripes(seed: number): number[] {
  const bars: number[] = [];
  let s = seed * 1000003;
  for (let i = 0; i < 36; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    bars.push((Math.abs(s) % 3) + 1);
  }
  return bars;
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await apiFetch<TicketDetail>(`/api/v1/tickets/${id}`).catch(
    () => null
  );

  if (!ticket) notFound();

  const accent = ticket.brand_color ?? "#1d4ed8";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ticketUrl = `${appUrl}/ticket/${ticket.id}`;
  const PLACEHOLDER_PHONE = "233200000000";
  const hasRealPhone = ticket.passenger_phone && ticket.passenger_phone !== PLACEHOLDER_PHONE;

  // Derive light background from brand color
  const lightBg = `${accent}14`; // 8% opacity
  const midBg = `${accent}22`;   // 13% opacity

  const departure = ticket.departure_time
    ? new Date(ticket.departure_time)
    : null;

  const dateStr = departure
    ? departure.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const timeStr = departure
    ? departure.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const bars = barcodeStripes(ticket.id);

  return (
    <div className="space-y-4">
      {/* Nav bar — hidden on print */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/trips/${ticket.trip_id}`}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">
            Ticket #{ticket.id}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <QrButton ticketId={ticket.id} />
          <ShareButton
            ticketId={ticket.id}
            defaultPhone={hasRealPhone ? ticket.passenger_phone : null}
            ticketUrl={ticketUrl}
          />
          <PrintButton />
          {ticket.status !== "cancelled" && (
            <CancelButton ticketId={ticket.id} />
          )}
        </div>
      </div>

      {/* ── THE TICKET ── */}
      <div
        id="ticket"
        className="rounded-2xl overflow-hidden shadow-lg max-w-2xl"
        style={{ background: lightBg, border: `1.5px solid ${accent}30` }}
      >
        <div className="flex">

          {/* ══ LEFT / MAIN BODY ══════════════════════════════════════ */}
          <div className="flex-1 flex flex-col">

            {/* Header bar */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ background: accent }}
            >
              <span className="text-white font-extrabold text-lg tracking-wider uppercase">
                Bus Ticket
              </span>
              <span className="text-white text-sm font-semibold opacity-90">
                {ticket.company_name ?? "RoutePass"}
              </span>
            </div>

            {/* Body */}
            <div className="flex flex-1 px-4 py-4 gap-4">

              {/* Bus icon */}
              <div className="flex items-center justify-center pr-3"
                style={{ borderRight: `1.5px dashed ${accent}50` }}>
                <svg
                  viewBox="0 0 64 64"
                  className="w-16 h-16 shrink-0"
                  fill={accent}
                >
                  <rect x="4" y="10" width="56" height="34" rx="6" />
                  <rect x="8" y="14" width="22" height="14" rx="2" fill="white" />
                  <rect x="34" y="14" width="22" height="14" rx="2" fill="white" />
                  <rect x="4" y="38" width="56" height="6" rx="2" />
                  <circle cx="16" cy="50" r="6" fill={accent} stroke="white" strokeWidth="2" />
                  <circle cx="48" cy="50" r="6" fill={accent} stroke="white" strokeWidth="2" />
                  <rect x="28" y="42" width="8" height="4" rx="1" fill="white" />
                </svg>
              </div>

              {/* Main fields */}
              <div className="flex-1 space-y-2.5">
                <TicketField label="DATE" value={dateStr} accent={accent} />
                <TicketField label="TIME" value={timeStr} accent={accent} />
                <TicketField label="FROM" value={ticket.departure_station ?? "—"} accent={accent} />
                <TicketField label="TO" value={ticket.destination_station ?? "—"} accent={accent} />
              </div>

              {/* Right side boxes */}
              <div className="flex flex-col gap-3 justify-center">
                <BoxField label="Bus No." value={ticket.vehicle_plate ?? "—"} accent={accent} />
                <BoxField label="Seat No." value={String(ticket.seat_number)} accent={accent} large />
                <BoxField label="Fare" value={`GHS ${Number(ticket.fare_ghs).toFixed(2)}`} accent={accent} />
              </div>
            </div>

            {/* Status footer */}
            <div
              className="flex items-center justify-between px-5 py-2"
              style={{ borderTop: `1px solid ${accent}25`, background: midBg }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: accent }}
              >
                {ticket.status}
              </span>
              <span className="text-xs font-mono text-zinc-500">
                {ticket.passenger_phone}
              </span>
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{
                  color:
                    ticket.payment_status === "paid"
                      ? "#16a34a"
                      : ticket.payment_status === "pending"
                        ? "#d97706"
                        : "#dc2626",
                }}
              >
                {ticket.payment_status}
              </span>
            </div>
          </div>

          {/* ══ PERFORATED DIVIDER ══ */}
          <div
            className="flex flex-col items-center justify-between py-2 px-0 select-none"
            style={{ width: "22px", background: `${accent}10` }}
          >
            <div
              className="w-3 h-3 rounded-full -ml-1.5"
              style={{ background: `${accent}30`, marginLeft: "-12px", marginTop: "-8px" }}
            />
            <div
              className="flex-1 border-l-2 border-dashed"
              style={{ borderColor: `${accent}40` }}
            />
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: `${accent}30`, marginLeft: "-12px", marginBottom: "-8px" }}
            />
          </div>

          {/* ══ RIGHT STUB ══════════════════════════════════════════ */}
          <div
            className="flex flex-col"
            style={{ width: "140px", background: midBg }}
          >
            {/* Stub header */}
            <div
              className="px-3 py-2 text-center"
              style={{ background: accent }}
            >
              <p className="text-white font-bold text-[11px] tracking-widest uppercase leading-tight">
                Passenger
              </p>
              <p className="text-white font-bold text-[11px] tracking-widest uppercase leading-tight">
                Ticket
              </p>
            </div>

            {/* Stub fields */}
            <div className="flex-1 px-3 py-3 space-y-2">
              <StubField label="DATE" value={dateStr} accent={accent} />
              <StubField label="TIME" value={timeStr} accent={accent} />
              <StubField label="FROM" value={ticket.departure_station ?? "—"} accent={accent} />
              <StubField label="TO" value={ticket.destination_station ?? "—"} accent={accent} />
              <div className="pt-1">
                <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: accent }}>
                  Passenger
                </p>
                <p className="text-[10px] font-semibold text-zinc-800 truncate">
                  {ticket.passenger_name}
                </p>
              </div>
            </div>

            {/* Barcode */}
            <div className="px-3 pb-3 flex flex-col items-center">
              <div className="flex items-end gap-px h-10 bg-white rounded px-1.5 py-1 w-full justify-center">
                {bars.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${w}px`,
                      height: i % 5 === 0 ? "100%" : i % 3 === 0 ? "80%" : "90%",
                      background: i % 2 === 0 ? "#1a1a1a" : "transparent",
                    }}
                  />
                ))}
              </div>
              <p className="text-[8px] font-mono text-zinc-500 mt-1">
                {String(ticket.id).padStart(8, "0")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles — ticket-sized page, hides all dashboard chrome */}
      <style
        dangerouslySetInnerHTML={{
          __html: [
            "@media print {",
            "  @page { size: 5.5in 2.6in landscape; margin: 6mm; }",
            "  body * { visibility: hidden !important; }",
            "  #ticket, #ticket * { visibility: visible !important; }",
            "  #ticket {",
            "    position: fixed !important;",
            "    inset: 0 !important;",
            "    width: 100% !important;",
            "    max-width: 100% !important;",
            "    box-shadow: none !important;",
            "    border: none !important;",
            "  }",
            "}",
          ].join(" "),
        }}
      />
    </div>
  );
}

function TicketField({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-bold uppercase tracking-wider w-10 shrink-0"
        style={{ color: accent }}
      >
        {label}
      </span>
      <div
        className="flex-1 bg-white rounded px-2 py-1 text-xs font-semibold text-zinc-800 truncate"
        style={{ border: `1px solid ${accent}25` }}
      >
        {value}
      </div>
    </div>
  );
}

function BoxField({
  label,
  value,
  accent,
  large,
}: {
  label: string;
  value: string;
  accent: string;
  large?: boolean;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-center min-w-18"
      style={{ border: `1.5px solid ${accent}40`, background: "white" }}
    >
      <p className="text-[9px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: accent }}>
        {label}
      </p>
      <p
        className={`font-extrabold truncate ${large ? "text-xl" : "text-sm"}`}
        style={{ color: accent }}
      >
        {value}
      </p>
    </div>
  );
}

function StubField({
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
      <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: accent }}>
        {label}
      </p>
      <p className="text-[10px] font-medium text-zinc-800 truncate">{value}</p>
    </div>
  );
}
