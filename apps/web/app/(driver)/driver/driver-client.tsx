"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Bus, CheckCircle2, QrCode, Users, XCircle } from "lucide-react";

import { useDriverPassengers, useDriverScan, useDriverTrip } from "@/hooks/use-driver";
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
      } catch {
        /* ignore — fire and forget */
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        pushLocation(pos.coords.latitude, pos.coords.longitude);
      },
      () => { /* ignore errors */ },
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => pushLocation(pos.coords.latitude, pos.coords.longitude),
        () => { /* ignore */ }
      );
    }, 30_000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(interval);
    };
  }, [tripStatus]);
}

// ── Audio helpers ──────────────────────────────────────────────────────────────

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
  } catch {
    /* AudioContext may be blocked without user gesture — fail silently */
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ScanOverlay =
  | { kind: "valid"; passengerName: string; seatNumber: number }
  | { kind: "invalid"; reason: string }
  | null;

type ActiveTab = "manifest" | "scan";

// ── Props ──────────────────────────────────────────────────────────────────────

interface DriverDashboardClientProps {
  initialData: DriverTripData | null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DriverDashboardClient({
  initialData,
}: DriverDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("manifest");
  const { data: tripData } = useDriverTrip(initialData ?? undefined);

  // Push GPS location to backend while trip is active
  useGpsPush(tripData?.status);

  if (!tripData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <Bus className="h-12 w-12 text-zinc-300" />
        <div>
          <p className="text-lg font-semibold text-zinc-700">No trip assigned for today</p>
          <p className="text-sm text-zinc-500 mt-1">
            Contact your manager to get assigned to a trip.
          </p>
        </div>
      </div>
    );
  }

  const trip = tripData;

  const departureTime = new Date(trip.departure_time);
  const formattedTime = departureTime.toLocaleTimeString("en-GH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const formattedDate = departureTime.toLocaleDateString("en-GH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="space-y-4">
      {/* Trip card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Assigned Trip
            </p>
            <p className="text-lg font-bold text-zinc-900 mt-0.5">
              {trip.departure_station_name} → {trip.destination_station_name}
            </p>
            <p className="text-sm text-zinc-500 mt-0.5">
              {formattedDate} at {formattedTime}
            </p>
          </div>
          <StatusPill status={trip.status} />
        </div>
        <div className="mt-3 flex items-center gap-4 text-sm text-zinc-500">
          <span className="flex items-center gap-1">
            <Bus className="h-4 w-4" />
            {trip.vehicle_plate}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {trip.passenger_count} passenger{trip.passenger_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-xl p-1">
        {(["manifest", "scan"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "manifest" ? "Manifest" : "Scan Ticket"}
          </button>
        ))}
      </div>

      {activeTab === "manifest" && <ManifestTab tripId={trip.id} />}
      {activeTab === "scan" && <ScanTab tripId={trip.id} tripStatus={trip.status} />}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const variants: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700",
    loading: "bg-amber-50 text-amber-700",
    departed: "bg-green-50 text-green-700",
    arrived: "bg-zinc-100 text-zinc-600",
    cancelled: "bg-red-50 text-red-700",
  };
  const cls = variants[status] ?? "bg-zinc-100 text-zinc-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

// ── Manifest tab ───────────────────────────────────────────────────────────────

function ManifestTab({ tripId }: { tripId: number }) {
  const { data: passengers = [], isLoading } = useDriverPassengers(tripId);

  const confirmed = passengers.filter((p) => p.status === "valid").length;
  const boarded = passengers.filter((p) => p.status === "used").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400 text-sm">
        Loading passengers...
      </div>
    );
  }

  if (passengers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400 text-sm">
        No passengers on this trip yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="text-sm text-zinc-500">
        {passengers.length} passengers · {confirmed} pending ·{" "}
        <span className="text-green-600 font-medium">{boarded} boarded</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide w-12">
                Seat
              </th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Passenger
              </th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {passengers.map((p) => (
              <PassengerRow key={p.ticket_id} passenger={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PassengerRow({ passenger: p }: { passenger: DriverPassenger }) {
  const statusBadge: Record<string, string> = {
    valid: "bg-blue-50 text-blue-700",
    used: "bg-green-50 text-green-700",
  };
  const cls = statusBadge[p.status] ?? "bg-zinc-100 text-zinc-500";

  return (
    <tr className="hover:bg-zinc-50 transition-colors">
      <td className="px-3 py-2.5 font-bold text-zinc-700 text-center">
        {p.seat_number}
      </td>
      <td className="px-3 py-2.5">
        <p className="font-medium text-zinc-900">{p.passenger_name}</p>
        <p className="text-xs text-zinc-400">{p.passenger_phone}</p>
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
          {p.status === "used" ? "Boarded" : "Pending"}
        </span>
      </td>
    </tr>
  );
}

// ── Scan tab ───────────────────────────────────────────────────────────────────

function ScanTab({ tripStatus }: { tripId: number; tripStatus: string }) {
  const [scanning, setScanning] = useState(false);
  const [overlay, setOverlay] = useState<ScanOverlay>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);
  const lastScanTimestampRef = useRef<number>(0);

  const scanMutation = useDriverScan();

  const canScan = tripStatus === "loading" || tripStatus === "departed";

  // Suppress AbortError from video.play() when scanner stops mid-playback
  useEffect(() => {
    const original = HTMLVideoElement.prototype.play;
    // eslint-disable-next-line react-hooks/unsupported-syntax
    HTMLVideoElement.prototype.play = function (this: HTMLVideoElement) {
      return original.apply(this).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        return Promise.reject(err);
      });
    };
    return () => {
      HTMLVideoElement.prototype.play = original;
    };
  }, []);

  const onScanSuccess = useCallback(
    async (decodedText: string) => {
      const now = Date.now();
      if (now - lastScanTimestampRef.current < 1_000) return;
      lastScanTimestampRef.current = now;
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        scannerRef.current?.pause(false);
      } catch { /* ignore */ }

      try {
        const result = await scanMutation.mutateAsync(decodedText.trim());
        if (result.valid) {
          playBeep("success");
          setOverlay({
            kind: "valid",
            passengerName: result.passenger_name ?? "",
            seatNumber: result.seat_number ?? 0,
          });
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
    },
    [scanMutation]
  );

  // Start/stop scanner lifecycle (same pattern as parcel scanner)
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

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => { /* suppress per-frame decode errors */ }
      )
      .then(() => {
        startResolved = true;
        if (pendingCleanup) safeStop();
      })
      .catch((err) => {
        startResolved = true;
        if (!pendingCleanup) {
          console.error("QR scanner failed to start:", err);
          setScanning(false);
        }
        try { scanner.clear(); } catch { /* ignore */ }
      });

    return () => {
      pendingCleanup = true;
      if (startResolved) safeStop();
    };
  }, [scanning, onScanSuccess]);

  function resetScan() {
    setOverlay(null);
    isProcessingRef.current = false;
    lastScanTimestampRef.current = 0;
    if (scannerRef.current) {
      try { scannerRef.current.resume(); } catch { /* ignore */ }
    }
  }

  if (!canScan) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-6 text-center text-sm text-zinc-500">
        <QrCode className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
        <p className="font-medium text-zinc-700">Scanning not available</p>
        <p className="mt-1">
          Ticket scanning is enabled when the trip is in{" "}
          <span className="font-medium">Loading</span> or{" "}
          <span className="font-medium">Departed</span> status.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!scanning ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col items-center gap-4">
          <QrCode className="h-10 w-10 text-zinc-400" />
          <p className="text-sm text-zinc-500 text-center">
            Point the camera at a passenger&apos;s ticket QR code to validate their boarding.
          </p>
          <button
            onClick={() => setScanning(true)}
            className="rounded-lg bg-sidebar-primary px-5 py-2.5 text-sm font-medium text-sidebar-primary-foreground hover:opacity-90 transition-opacity"
          >
            Start Scanner
          </button>
        </div>
      ) : (
        <div className="relative">
          {/* QR reader container — must be present before scanner starts */}
          <div
            id="driver-qr-reader"
            className="rounded-xl overflow-hidden border border-zinc-200"
          />

          <button
            onClick={() => setScanning(false)}
            className="mt-2 w-full rounded-lg border border-zinc-200 bg-white py-2 text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
          >
            Stop Scanner
          </button>

          {/* Success overlay */}
          {overlay?.kind === "valid" && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-green-600 text-white px-6">
              <CheckCircle2 className="h-20 w-20 mb-4" />
              <p className="text-4xl font-black tracking-tight">BOARD</p>
              <p className="text-xl font-semibold mt-2">{overlay.passengerName}</p>
              <p className="text-lg opacity-80">Seat {overlay.seatNumber}</p>
              <button
                onClick={resetScan}
                className="mt-10 rounded-xl bg-white/20 hover:bg-white/30 transition-colors px-8 py-3 text-base font-medium"
              >
                Scan Next
              </button>
            </div>
          )}

          {/* Error overlay */}
          {overlay?.kind === "invalid" && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600 text-white px-6">
              <XCircle className="h-20 w-20 mb-4" />
              <p className="text-3xl font-black tracking-tight text-center">
                {overlay.reason.toUpperCase()}
              </p>
              <button
                onClick={resetScan}
                className="mt-10 rounded-xl bg-white/20 hover:bg-white/30 transition-colors px-8 py-3 text-base font-medium"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
