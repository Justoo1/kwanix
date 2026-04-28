"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import {
  useDriverPassengers,
  useDriverScan,
  useDriverTrip,
} from "@/hooks/use-driver";
import type { DriverPassenger, DriverTripData } from "@/hooks/use-driver";

// ── GPS location push ──────────────────────────────────────────────────────────

function useGpsPush(tripStatus: string | undefined) {
  useEffect(() => {
    const active = tripStatus === "loading" || tripStatus === "departed";
    if (!active || !navigator.geolocation) return;

    async function pushLocation(lat: number, lng: number) {
      try {
        await fetch("/api/proxy/driver/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
      } catch { /* fire and forget */ }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => pushLocation(pos.coords.latitude, pos.coords.longitude),
      () => { /* ignore */ },
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => pushLocation(pos.coords.latitude, pos.coords.longitude),
        () => { /* ignore */ }
      );
    }, 30_000);

    return () => { navigator.geolocation.clearWatch(watchId); clearInterval(interval); };
  }, [tripStatus]);
}

// ── Audio feedback ─────────────────────────────────────────────────────────────

function playBeep(type: "success" | "error") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "success") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch { /* AudioContext may need user gesture */ }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ScanOverlay =
  | { kind: "valid"; passengerName: string; seatNumber: number }
  | { kind: "invalid"; reason: string }
  | null;

type ActiveTab = "manifest" | "scan";

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: "bg-blue-500/15",   text: "text-blue-400",   label: "Scheduled" },
  loading:   { bg: "bg-amber-500/15",  text: "text-amber-400",  label: "Boarding"  },
  departed:  { bg: "bg-emerald-500/15",text: "text-emerald-400",label: "Departed"  },
  arrived:   { bg: "bg-zinc-500/15",   text: "text-zinc-400",   label: "Arrived"   },
  cancelled: { bg: "bg-red-500/15",    text: "text-red-400",    label: "Cancelled" },
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function DriverDashboardClient({
  initialData,
}: {
  initialData: DriverTripData | null;
}) {
  const [activeTab, setActiveTab]     = useState<ActiveTab>("manifest");
  const [scanTrigger, setScanTrigger] = useState(0);
  const { data: trip } = useDriverTrip(initialData ?? undefined);
  useGpsPush(trip?.status);

  function goToScan() {
    setActiveTab("scan");
    setScanTrigger(t => t + 1);
  }

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-zinc-100 flex items-center justify-center">
          <svg className="w-9 h-9 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-bold text-zinc-800">No trip assigned</p>
          <p className="text-sm text-zinc-500 mt-1">Contact your manager to get assigned to a trip.</p>
        </div>
      </div>
    );
  }

  const depTime = new Date(trip.departure_time);
  const timeStr = depTime.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
  const dateStr = depTime.toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short" });
  const st = STATUS_STYLES[trip.status] ?? STATUS_STYLES.scheduled;

  return (
    <div className="flex flex-col">
      {/* ── Trip hero ── */}
      <div className="bg-zinc-900 text-white px-5 py-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
              Assigned Trip
            </p>
            <h1 className="text-2xl font-black tracking-tight leading-tight">
              {trip.departure_station_name}
              <span className="text-zinc-500 mx-2">→</span>
              {trip.destination_station_name}
            </h1>
            <p className="text-zinc-400 text-sm mt-1.5">
              {dateStr} · {timeStr}
            </p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${st.bg} ${st.text}`}>
            {st.label}
          </span>
        </div>

        {/* Vehicle + passengers */}
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            {trip.vehicle_plate}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            {trip.passenger_count} passenger{trip.passenger_count !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Boarding progress — loaded from manifest */}
        <BoardingProgressBar tripId={trip.id} total={trip.passenger_count} />
      </div>

      {/* ── Live tracking panel ── */}
      {(trip.status === "loading" || trip.status === "departed") && (
        <LiveBroadcastPanel
          tripId={trip.id}
          initialBroadcastEnabled={trip.location_broadcast_enabled}
          from={trip.departure_station_name}
          to={trip.destination_station_name}
        />
      )}

      {/* ── Tab bar ── */}
      <div className="sticky top-14 z-30 bg-white border-b border-zinc-200 flex">
        {(["manifest", "scan"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors ${
              activeTab === tab
                ? "text-zinc-900 border-b-2 border-zinc-900"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {tab === "manifest" ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Manifest
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4.5 19.5l.5.5M19.5 4.5l.5.5M4.5 4.5L5 5M19.5 19.5l.5.5" />
                </svg>
                Scan Ticket
              </>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 p-4 bg-zinc-50">
        {activeTab === "manifest" && (
          <ManifestTab tripId={trip.id} tripStatus={trip.status} onStartScan={goToScan} />
        )}
        {activeTab === "scan" && (
          <ScanTab tripId={trip.id} tripStatus={trip.status} autoStartTrigger={scanTrigger} />
        )}
      </div>
    </div>
  );
}

// ── Boarding progress bar ──────────────────────────────────────────────────────

function BoardingProgressBar({ tripId, total }: { tripId: number; total: number }) {
  const { data: passengers = [] } = useDriverPassengers(tripId);
  const boarded = passengers.filter((p) => p.status === "used").length;
  const pct = total > 0 ? Math.round((boarded / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-bold">
        <span className="text-emerald-400">{boarded} boarded</span>
        <span className="text-zinc-500">{total - boarded} pending</span>
      </div>
      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-2 bg-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-600 text-right font-medium">{pct}% boarded</p>
    </div>
  );
}

// ── Live broadcast panel ───────────────────────────────────────────────────────

function LiveBroadcastPanel({
  tripId,
  initialBroadcastEnabled,
  from,
  to,
}: {
  tripId: number;
  initialBroadcastEnabled: boolean;
  from: string;
  to: string;
}) {
  const [enabled, setEnabled]     = useState(initialBroadcastEnabled);
  const [loading, setLoading]     = useState(false);
  const [shareState, setShareState] = useState<"idle" | "sending" | "done">("idle");
  const liveUrl = typeof window !== "undefined"
    ? `${window.location.origin}/track/bus/${tripId}`
    : `/track/bus/${tripId}`;

  async function toggleBroadcast() {
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/driver/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) setEnabled(!enabled);
    } catch { /* fail silently */ }
    finally { setLoading(false); }
  }

  async function shareWithPassengers() {
    setShareState("sending");
    try {
      await fetch("/api/proxy/driver/share-link", { method: "POST" });
      setShareState("done");
      setTimeout(() => setShareState("idle"), 4000);
    } catch { setShareState("idle"); }
  }

  return (
    <div className="bg-white border-b border-zinc-200 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${enabled ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
          <span className="text-sm font-bold text-zinc-800">Live Tracking</span>
        </div>
        <button
          onClick={toggleBroadcast}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50 ${enabled ? "bg-emerald-500" : "bg-zinc-200"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {enabled ? (
        <div className="space-y-2.5">
          <p className="text-xs text-zinc-500">{from} → {to} · passengers can track in real time</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={liveUrl}
              className="flex-1 rounded-xl bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-500 truncate border border-zinc-200"
            />
            <button
              onClick={() => navigator.clipboard.writeText(liveUrl)}
              className="text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors whitespace-nowrap"
            >
              Copy
            </button>
          </div>
          <button
            onClick={shareWithPassengers}
            disabled={shareState === "sending"}
            className="flex items-center gap-2 w-full justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {shareState === "sending" ? "Sending…" : shareState === "done" ? "Sent to all passengers!" : "SMS Link to Passengers"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">Toggle on to share your live location and get smart ETA alerts.</p>
      )}
    </div>
  );
}

// ── Manifest tab ───────────────────────────────────────────────────────────────

function ManifestTab({
  tripId,
  tripStatus,
  onStartScan,
}: {
  tripId: number;
  tripStatus: string;
  onStartScan: () => void;
}) {
  const { data: passengers = [], isLoading } = useDriverPassengers(tripId);
  const [search, setSearch] = useState("");

  const canCheckin = tripStatus === "loading" || tripStatus === "departed";

  const filtered = search
    ? passengers.filter(
        (p) =>
          p.passenger_name.toLowerCase().includes(search.toLowerCase()) ||
          String(p.seat_number).includes(search) ||
          p.passenger_phone.includes(search)
      )
    : passengers;

  const boarded = passengers.filter((p) => p.status === "used").length;
  const pending = passengers.length - boarded;

  if (isLoading) {
    return (
      <div className="space-y-3 mt-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-zinc-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (passengers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <p className="text-sm text-zinc-500 font-medium">No passengers yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total"   value={passengers.length} color="zinc" />
        <StatCard label="Boarded" value={boarded}           color="emerald" />
        <StatCard label="Pending" value={pending}            color="amber" />
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, seat or phone…"
          className="w-full rounded-2xl bg-white border border-zinc-200 pl-10 pr-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Passenger list */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-zinc-400 py-8">No passengers match &quot;{search}&quot;</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p) => (
            <PassengerCard
              key={p.ticket_id}
              passenger={p}
              canCheckin={canCheckin && p.status === "valid"}
              onCheckin={onStartScan}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "zinc" | "emerald" | "amber" }) {
  const styles = {
    zinc:    "bg-white text-zinc-900",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-2xl p-3 text-center ${styles[color]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mt-0.5">{label}</p>
    </div>
  );
}

function PassengerCard({
  passenger: p,
  canCheckin,
  onCheckin,
}: {
  passenger: DriverPassenger;
  canCheckin: boolean;
  onCheckin: () => void;
}) {
  const boarded = p.status === "used";
  return (
    <div
      className={`rounded-2xl flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
        boarded ? "bg-emerald-50" : "bg-white border border-zinc-200"
      }`}
    >
      {/* Seat badge */}
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
          boarded ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-700"
        }`}
      >
        {p.seat_number}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-zinc-900 truncate text-sm">{p.passenger_name}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{p.passenger_phone}</p>
      </div>

      {/* Status / action */}
      {boarded ? (
        <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : canCheckin ? (
        <button
          onClick={onCheckin}
          className="shrink-0 rounded-xl bg-zinc-900 text-white text-xs font-bold px-3.5 py-2.5 hover:bg-zinc-700 active:scale-95 transition-all min-w-[72px]"
        >
          Check In
        </button>
      ) : (
        <span className="shrink-0 text-xs font-medium text-zinc-400 capitalize">{p.payment_status}</span>
      )}
    </div>
  );
}

// ── Scan tab ───────────────────────────────────────────────────────────────────

function ScanTab({ tripStatus, autoStartTrigger }: { tripId: number; tripStatus: string; autoStartTrigger: number }) {
  const [scanning, setScanning] = useState(false);
  const [overlay, setOverlay]   = useState<ScanOverlay>(null);
  const scannerRef         = useRef<Html5Qrcode | null>(null);
  const isProcessingRef    = useRef(false);
  const lastScanTimestamp  = useRef<number>(0);
  const scanMutation       = useDriverScan();
  const canScan = tripStatus === "loading" || tripStatus === "departed";

  useEffect(() => {
    if (autoStartTrigger > 0) setScanning(true);
  }, [autoStartTrigger]);

  useEffect(() => {
    const original = HTMLVideoElement.prototype.play;
    // eslint-disable-next-line react-hooks/unsupported-syntax
    HTMLVideoElement.prototype.play = async function (this: HTMLVideoElement) {
      try {
        return await original.apply(this);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        throw err;
      }
    };
    return () => { HTMLVideoElement.prototype.play = original; };
  }, []);

  const onScanSuccess = useCallback(async (decodedText: string) => {
    const now = Date.now();
    if (now - lastScanTimestamp.current < 1_000) return;
    lastScanTimestamp.current = now;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try { scannerRef.current?.pause(false); } catch { /* ignore */ }

    try {
      const result = await scanMutation.mutateAsync(decodedText.trim());
      if (result.valid) {
        playBeep("success");
        setOverlay({ kind: "valid", passengerName: result.passenger_name ?? "", seatNumber: result.seat_number ?? 0 });
      } else {
        playBeep("error");
        navigator.vibrate?.([300, 100, 400]);
        setOverlay({ kind: "invalid", reason: result.reason ?? "Invalid ticket" });
      }
    } catch {
      playBeep("error");
      navigator.vibrate?.([300, 100, 400]);
      setOverlay({ kind: "invalid", reason: "Could not verify ticket. Try again." });
    }
  }, [scanMutation]);

  useEffect(() => {
    if (!scanning) return;
    let startResolved = false;
    let pendingCleanup = false;
    const scanner = new Html5Qrcode("driver-qr-reader");
    scannerRef.current = scanner;
    isProcessingRef.current = false;

    async function safeStop() {
      try { await scanner.stop(); } catch { /* already stopped */ }
      try { scanner.clear(); } catch { /* ignore */ }
      if (scannerRef.current === scanner) scannerRef.current = null;
    }

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      onScanSuccess,
      () => { /* suppress frame errors */ }
    ).then(() => {
      startResolved = true;
      if (pendingCleanup) safeStop();
    }).catch((err) => {
      startResolved = true;
      if (!pendingCleanup) { console.error("QR scanner failed:", err); setScanning(false); }
      try { scanner.clear(); } catch { /* ignore */ }
    });

    return () => { pendingCleanup = true; if (startResolved) safeStop(); };
  }, [scanning, onScanSuccess]);

  function resetScan() {
    setOverlay(null);
    isProcessingRef.current = false;
    lastScanTimestamp.current = 0;
    try { scannerRef.current?.resume(); } catch { /* ignore */ }
  }

  if (!canScan) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-zinc-800">Scanning unavailable</p>
          <p className="text-sm text-zinc-500 mt-1">
            Trip must be in <span className="font-semibold text-amber-600">Boarding</span> or{" "}
            <span className="font-semibold text-emerald-600">Departed</span> status to scan tickets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!scanning ? (
        <div className="bg-white rounded-3xl border border-zinc-200 p-8 flex flex-col items-center gap-5">
          <div className="w-20 h-20 rounded-3xl bg-zinc-900 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-bold text-zinc-900">Scan Ticket QR</p>
            <p className="text-sm text-zinc-500 mt-1">
              Point the camera at a passenger&apos;s ticket QR code to validate boarding.
            </p>
          </div>
          <button
            onClick={() => setScanning(true)}
            className="w-full rounded-2xl bg-zinc-900 py-4 text-base font-bold text-white hover:bg-zinc-700 active:scale-95 transition-all"
          >
            Start Camera
          </button>
          <p className="text-xs text-zinc-400 text-center">
            No QR code? Use <strong>Manifest → Check In</strong> to manually board a passenger.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div id="driver-qr-reader" className="rounded-2xl overflow-hidden border border-zinc-200" />
          <button
            onClick={() => setScanning(false)}
            className="w-full rounded-2xl border border-zinc-200 bg-white py-3.5 text-sm font-bold text-zinc-500 hover:bg-zinc-50 transition-colors"
          >
            Stop Camera
          </button>
        </div>
      )}

      {/* Success overlay */}
      {overlay?.kind === "valid" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-600 text-white px-6">
          <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6">
            <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-5xl font-black tracking-tight mb-2">BOARD</p>
          <p className="text-2xl font-bold">{overlay.passengerName}</p>
          <p className="text-xl opacity-70 mt-1">Seat {overlay.seatNumber}</p>
          <button
            onClick={resetScan}
            className="mt-12 rounded-2xl bg-white/20 hover:bg-white/30 transition-colors px-10 py-4 text-base font-bold"
          >
            Scan Next →
          </button>
        </div>
      )}

      {/* Error overlay */}
      {overlay?.kind === "invalid" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600 text-white px-6">
          <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6">
            <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-3xl font-black tracking-tight text-center mb-2">INVALID</p>
          <p className="text-base text-white/80 text-center">{overlay.reason}</p>
          <button
            onClick={resetScan}
            className="mt-12 rounded-2xl bg-white/20 hover:bg-white/30 transition-colors px-10 py-4 text-base font-bold"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
