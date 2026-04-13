"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Loader2, Bus } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 10;

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

/** Parse ticket ID from reference format: KX-{ticket_id}-{hex} */
function parseTicketId(reference: string): number | null {
  const match = /^KX-(\d+)-/.exec(reference);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return isNaN(id) ? null : id;
}

async function fetchTicket(ticketId: number, reference: string): Promise<PublicTicket> {
  const url = `${API_BASE}/api/v1/public/tickets/${ticketId}?payment_ref=${encodeURIComponent(reference)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PublicTicket>;
}

/** Verify payment with Paystack via the backend and get the ticket back. */
async function verifyPayment(reference: string): Promise<PublicTicket> {
  const res = await fetch(`${API_BASE}/api/v1/public/payments/${encodeURIComponent(reference)}/verify`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PublicTicket>;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? "";

  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [state, setState] = useState<"polling" | "success" | "timeout" | "error">("polling");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const ticketId = parseTicketId(reference);
    if (!ticketId) {
      setState("error");
      setErrorMsg("Invalid payment reference. Please contact support.");
      return;
    }

    let attempts = 0;
    let stopped = false;

    async function poll() {
      if (stopped) return;
      attempts++;
      try {
        const t = await fetchTicket(ticketId!, reference);
        if (t.payment_status === "paid") {
          setTicket(t);
          setState("success");
          return;
        }
      } catch {
        // keep polling until max attempts
      }

      if (attempts >= MAX_ATTEMPTS) {
        setState("timeout");
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    }

    async function start() {
      if (stopped) return;
      // First: attempt an immediate server-side Paystack verify so we don't
      // have to wait for the async webhook (handles both prod race and local dev).
      try {
        const t = await verifyPayment(reference);
        if (!stopped && t.payment_status === "paid") {
          setTicket(t);
          setState("success");
          return;
        }
      } catch {
        // verify failed (network error, non-2xx) — fall through to polling
      }
      // Fallback: poll in case the verify call itself races with the webhook
      void poll();
    }

    void start();
    return () => { stopped = true; };
  }, [reference]);

  // ── Polling ────────────────────────────────────────────────────────────────

  if (state === "polling") {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-sm text-zinc-600 font-medium">Confirming your payment…</p>
        <p className="text-xs text-zinc-400">This may take a few seconds.</p>
      </div>
    );
  }

  // ── Header shared by success / error states ────────────────────────────────

  const header = (
    <div className="bg-white border-b border-zinc-200">
      <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-2">
        <Bus className="h-5 w-5 text-emerald-600" />
        <span className="font-bold text-zinc-900 text-lg">Kwanix</span>
      </div>
    </div>
  );

  // ── Error / timeout ────────────────────────────────────────────────────────

  if (state === "error" || state === "timeout") {
    const msg =
      state === "timeout"
        ? "Payment confirmation is taking longer than expected. If you completed payment, your ticket will be updated shortly."
        : (errorMsg ?? "Something went wrong.");

    return (
      <div className="min-h-screen bg-zinc-50">
        {header}
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-900 mb-2">
            {state === "timeout" ? "Still processing…" : "Something went wrong"}
          </h1>
          <p className="text-sm text-zinc-600 mb-8">{msg}</p>
          <a
            href="/discover"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Back to trip search
          </a>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (!ticket) return null;

  const accent = ticket.brand_color ?? "#1d4ed8";
  const lightBg = `${accent}14`;
  const midBg = `${accent}22`;

  const departure = ticket.departure_time ? new Date(ticket.departure_time) : null;
  const dateStr = departure
    ? departure.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  const timeStr = departure
    ? departure.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="min-h-screen bg-zinc-50">
      {header}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-zinc-900">Booking confirmed!</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Your payment was successful. Show this ticket to the driver.
          </p>
        </div>

        {/* ── Styled ticket — matches dashboard design ── */}
        <div
          id="passenger-ticket"
          className="rounded-2xl overflow-hidden shadow-lg"
          style={{ background: lightBg, border: `1.5px solid ${accent}30` }}
        >
          <div className="flex">

            {/* ══ LEFT / MAIN BODY ══ */}
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
                  {ticket.company_name ?? "Kwanix"}
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-1 px-4 py-4 gap-4">

                {/* Bus icon */}
                <div
                  className="flex items-center justify-center pr-3"
                  style={{ borderRight: `1.5px dashed ${accent}50` }}
                >
                  <svg viewBox="0 0 64 64" className="w-16 h-16 shrink-0" fill={accent}>
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
                  <TField label="DATE"  value={dateStr} accent={accent} />
                  <TField label="TIME"  value={timeStr} accent={accent} />
                  <TField label="FROM"  value={ticket.departure_station ?? "—"} accent={accent} />
                  <TField label="TO"    value={ticket.destination_station ?? "—"} accent={accent} />
                </div>

                {/* Right side boxes */}
                <div className="flex flex-col gap-3 justify-center">
                  <TBox label="Bus No."  value={ticket.vehicle_plate ?? "—"} accent={accent} />
                  <TBox label="Seat No." value={String(ticket.seat_number)} accent={accent} large />
                  <TBox label="Fare"     value={`GHS ${Number(ticket.fare_ghs).toFixed(2)}`} accent={accent} />
                </div>
              </div>

              {/* Status footer */}
              <div
                className="flex items-center justify-between px-5 py-2"
                style={{ borderTop: `1px solid ${accent}25`, background: midBg }}
              >
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                  VALID
                </span>
                <span className="text-xs font-mono text-zinc-500">{reference}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  PAID
                </span>
              </div>
            </div>

            {/* ══ PERFORATED DIVIDER ══ */}
            <div
              className="flex flex-col items-center justify-between py-2 px-0 select-none"
              style={{ width: "22px", background: `${accent}10` }}
            >
              <div className="w-3 h-3 rounded-full" style={{ background: `${accent}30`, marginLeft: "-12px", marginTop: "-8px" }} />
              <div className="flex-1 border-l-2 border-dashed" style={{ borderColor: `${accent}40` }} />
              <div className="w-3 h-3 rounded-full" style={{ background: `${accent}30`, marginLeft: "-12px", marginBottom: "-8px" }} />
            </div>

            {/* ══ RIGHT STUB — QR code ══ */}
            <div className="flex flex-col" style={{ width: "150px", background: midBg }}>

              {/* Stub header */}
              <div className="px-3 py-2 text-center" style={{ background: accent }}>
                <p className="text-white font-bold text-[11px] tracking-widest uppercase leading-tight">Passenger</p>
                <p className="text-white font-bold text-[11px] tracking-widest uppercase leading-tight">Ticket</p>
              </div>

              {/* Stub fields */}
              <div className="flex-1 px-3 py-3 space-y-2">
                <TStub label="DATE"      value={dateStr} accent={accent} />
                <TStub label="TIME"      value={timeStr} accent={accent} />
                <TStub label="FROM"      value={ticket.departure_station ?? "—"} accent={accent} />
                <TStub label="TO"        value={ticket.destination_station ?? "—"} accent={accent} />
                <div className="pt-1">
                  <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: accent }}>Passenger</p>
                  <p className="text-[10px] font-semibold text-zinc-800 truncate">{ticket.passenger_name}</p>
                </div>
              </div>

              {/* QR code */}
              <div className="px-3 pb-3 flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}/api/v1/public/tickets/${ticket.id}/qr`}
                  alt="Boarding QR"
                  className="w-full rounded bg-white p-1"
                />
                <p className="text-[8px] font-mono text-zinc-500">
                  {String(ticket.id).padStart(8, "0")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Download QR + search links */}
        <TicketDownloadButtons ticketId={ticket.id} passengerName={ticket.passenger_name} />

        <div className="mt-3 text-center">
          <a href="/discover" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            Search for another trip
          </a>
        </div>
      </div>
    </div>
  );
}

function TField({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider w-10 shrink-0" style={{ color: accent }}>
        {label}
      </span>
      <div className="flex-1 bg-white rounded px-2 py-1 text-xs font-semibold text-zinc-800 truncate" style={{ border: `1px solid ${accent}25` }}>
        {value}
      </div>
    </div>
  );
}

function TBox({ label, value, accent, large }: { label: string; value: string; accent: string; large?: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2 text-center min-w-18" style={{ border: `1.5px solid ${accent}40`, background: "white" }}>
      <p className="text-[9px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: accent }}>{label}</p>
      <p className={`font-extrabold truncate ${large ? "text-xl" : "text-sm"}`} style={{ color: accent }}>{value}</p>
    </div>
  );
}

function TStub({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: accent }}>{label}</p>
      <p className="text-[10px] font-medium text-zinc-800 truncate">{value}</p>
    </div>
  );
}

function TicketDownloadButtons({
  ticketId,
  passengerName,
}: {
  ticketId: number;
  passengerName: string;
}) {
  const [busy, setBusy] = useState<"image" | "pdf" | null>(null);

  const slug = passengerName.replace(/\s+/g, "-");

  async function captureDataUrl(): Promise<string> {
    const { toPng } = await import("html-to-image");
    const el = document.getElementById("passenger-ticket");
    if (!el) throw new Error("Ticket element not found");
    // Cap at 800 px wide — standard ticket print width, ~1:2.5 aspect ratio
    const targetW = 500;
    const scale = targetW / el.offsetWidth;
    return toPng(el, { pixelRatio: scale, cacheBust: true });
  }

  async function downloadImage() {
    setBusy("image");
    try {
      const dataUrl = await captureDataUrl();
      const link = document.createElement("a");
      link.download = `ticket-${slug}-${ticketId}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const dataUrl = await captureDataUrl();
      const { jsPDF } = await import("jspdf");
      // Measure the element to set the PDF page to the same aspect ratio
      const el = document.getElementById("passenger-ticket")!;
      const { width: elW, height: elH } = el.getBoundingClientRect();
      const ratio = elH / elW;
      const pageW = 297; // mm — A4 landscape width
      const pageH = pageW * ratio;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageW, pageH] });
      pdf.addImage(dataUrl, "PNG", 0, 0, pageW, pageH);
      pdf.save(`ticket-${slug}-${ticketId}.pdf`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
      <button
        onClick={downloadImage}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
      >
        {busy === "image" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save as image
      </button>
      <button
        onClick={downloadPdf}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save as PDF
      </button>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
