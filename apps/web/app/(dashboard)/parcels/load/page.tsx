"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Package2, Truck } from "lucide-react";
import Link from "next/link";
import { Html5Qrcode } from "html5-qrcode";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveTrips, useLoadParcel, useUnloadParcel, useCollectParcel, parcelKeys, type ParcelRow } from "@/hooks/use-parcels";
import type { TripResponse } from "@/lib/definitions";

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
    // Browser may block AudioContext without user gesture — fail silently
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ScanResult =
  | { kind: "success"; message: string; trackingNumber: string }
  | {
      kind: "mismatch";
      trackingNumber: string;
      description: string | null;
      correctDest: string;
      busDest: string;
      busPlate: string;
    }
  | null;

type ActiveTab = "load" | "unload" | "collect";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScanToLoadPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("load");

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/parcels"
          className="text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-zinc-900">Parcel Operations</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-xl p-1">
        {(["load", "unload", "collect"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "load" ? "Scan & Load" : tab === "unload" ? "Unload / Arrive" : "Collect (OTP)"}
          </button>
        ))}
      </div>

      {activeTab === "load" && <LoadTab />}
      {activeTab === "unload" && <UnloadTab />}
      {activeTab === "collect" && <CollectTab />}
    </div>
  );
}

// ── Load Tab ──────────────────────────────────────────────────────────────────

function LoadTab() {
  "use no memo";
  const { data: trips = [], isLoading: tripsLoading } = useActiveTrips();
  const [selectedTripId, setSelectedTripId] = useState<number | "">("");
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);

  const loadMutation = useLoadParcel();
  const queryClient = useQueryClient();

  // html5-qrcode does not catch the Promise rejection that video.play()
  // produces when scanner.stop() removes the video element mid-playback.
  // Turbopack's error overlay intercepts this at the module level — before
  // window "unhandledrejection" fires — so event-listener suppression alone
  // is not enough.
  //
  // Fix: patch HTMLVideoElement.prototype.play to catch AbortErrors at the
  // call site so the rejection never escapes as unhandled. All other errors
  // are re-thrown normally. The original is restored on unmount.
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
      if (isProcessingRef.current || !selectedTripId) return;
      isProcessingRef.current = true;

      // Pause QR detection but keep the video stream running (pause(false)).
      // pause(true) would stop the video element, triggering an AbortError
      // when the browser's play() promise is interrupted.
      try {
        scannerRef.current?.pause(false);
      } catch { /* ignore */ }

      try {
        const result = await loadMutation.mutateAsync({
          tracking_number: decodedText.trim(),
          trip_id: Number(selectedTripId),
        });
        playBeep("success");
        setScanResult({
          kind: "success",
          message: result.message,
          trackingNumber: result.tracking_number,
        });
      } catch (err) {
        playBeep("error");
        navigator.vibrate?.([300, 100, 400, 100, 1000]);

        // clientFetch serialises structured FastAPI detail objects to JSON,
        // so err.message is either a plain string or a JSON-encoded object.
        const msg = err instanceof Error ? err.message : "";
        let detail: { code?: string; correct_destination?: string; bus_destination?: string; bus_plate?: string } = {};
        try { detail = JSON.parse(msg); } catch { /* plain-text error */ }

        // Look up the parcel description from the React Query cache so we
        // can show it on the mismatch overlay without an extra network call.
        const cached = queryClient.getQueryData<ParcelRow[]>(parcelKeys.list());
        const cachedParcel = cached?.find(
          (p) => p.tracking_number === decodedText.trim()
        );

        if (detail?.code === "DESTINATION_MISMATCH") {
          setScanResult({
            kind: "mismatch",
            trackingNumber: decodedText.trim(),
            description: cachedParcel?.description ?? null,
            correctDest: detail.correct_destination ?? "Unknown",
            busDest: detail.bus_destination ?? "Unknown",
            busPlate: detail.bus_plate ?? "Unknown",
          });
        } else {
          setScanResult({
            kind: "mismatch",
            trackingNumber: decodedText.trim(),
            description: cachedParcel?.description ?? null,
            correctDest: "Unknown",
            busDest: "Unknown",
            busPlate: msg,
          });
        }
      }
    },
    [selectedTripId, loadMutation, queryClient]
  );

  // Start/stop scanner
  useEffect(() => {
    if (!scanning) return;

    // Guards against the race between start() (async) and cleanup (sync).
    // If cleanup runs before start() resolves, we set pendingCleanup=true
    // and let the .then() handler call safeStop() once the scanner is ready.
    let startResolved = false;
    let pendingCleanup = false;

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    isProcessingRef.current = false;

    async function safeStop() {
      // stop() is valid from both SCANNING and PAUSED states.
      // clear() must only be called after a successful stop().
      try {
        await scanner.stop();
      } catch { /* already stopped or never started */ }
      try {
        scanner.clear();
      } catch { /* ignore */ }
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
        // Cleanup already requested while start() was in-flight — stop now.
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
      // Only call stop() if start() has already resolved; otherwise the
      // .then() branch above will call safeStop() once it finishes.
      if (startResolved) safeStop();
    };
  }, [scanning, onScanSuccess]);

  function resetScan() {
    setScanResult(null);
    isProcessingRef.current = false;
    // Resume camera preview — scanner is still alive in PAUSED state.
    // Guard with try/catch in case the user navigated away mid-scan.
    if (scannerRef.current) {
      try { scannerRef.current.resume(); } catch { /* ignore */ }
    }
  }

  // Single return — overlays are rendered as fixed children so the
  // #qr-reader div is never unmounted while the scanner is alive.
  return (
    <div className="space-y-5">
      {/* Trip selector */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 space-y-3">
        <label className="block text-sm font-semibold text-zinc-800">
          1. Select Active Trip
        </label>
        {tripsLoading ? (
          <div className="text-sm text-zinc-400">Loading trips…</div>
        ) : trips.length === 0 ? (
          <div className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            No trips currently in loading status. Ask the manager to open a trip first.
          </div>
        ) : (
          <select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value ? Number(e.target.value) : "")}
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="">Select a trip…</option>
            {trips.map((t) => (
              <TripOption key={t.id} trip={t} />
            ))}
          </select>
        )}
      </div>

      {/* Scanner */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 space-y-3">
        <label className="block text-sm font-semibold text-zinc-800">
          2. Scan Parcel QR Code
        </label>

        {!selectedTripId && (
          <div className="text-sm text-zinc-400 bg-zinc-50 rounded-lg px-3 py-2">
            Select a trip above before scanning.
          </div>
        )}

        {selectedTripId && !scanning && (
          <button
            onClick={() => setScanning(true)}
            className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            Start Camera Scanner
          </button>
        )}

        {selectedTripId && scanning && (
          <>
            {/* html5-qrcode owns this div — must stay in the DOM while
                scanning=true regardless of whether an overlay is showing */}
            <div
              id="qr-reader"
              ref={containerRef}
              className="w-full rounded-lg overflow-hidden"
            />
            <button
              onClick={() => setScanning(false)}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Stop Scanner
            </button>
          </>
        )}
      </div>

      {/* ── Result overlays — fixed so they sit on top without unmounting
           the #qr-reader element, which would crash html5-qrcode ── */}

      {scanResult?.kind === "success" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-green-500 text-white">
          <CheckCircle2 className="h-24 w-24 mb-6 animate-bounce" />
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">VALID — LOAD NOW</h2>
          <p className="text-lg font-medium opacity-90">{scanResult.message}</p>
          <p className="mt-2 font-mono text-sm opacity-75">{scanResult.trackingNumber}</p>
          <button
            onClick={resetScan}
            className="mt-10 rounded-full bg-white text-green-700 font-bold px-8 py-3 text-sm hover:bg-green-100 transition-colors"
          >
            Scan Next Parcel
          </button>
        </div>
      )}

      {scanResult?.kind === "mismatch" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600 text-white px-6 text-center">
          <XCircle className="h-20 w-20 mb-4 animate-pulse" />
          <h2 className="text-3xl font-extrabold tracking-tight mb-4">WRONG BUS!</h2>

          {/* Parcel identifiers */}
          <div className="mb-4 space-y-1">
            <p className="font-mono text-sm font-bold bg-red-700 rounded-lg px-4 py-1 inline-block">
              {scanResult.trackingNumber}
            </p>
            {scanResult.description && (
              <p className="text-sm opacity-85 italic">{scanResult.description}</p>
            )}
          </div>

          <p className="text-xl font-bold">
            THIS PARCEL GOES TO{" "}
            <span className="underline">{scanResult.correctDest.toUpperCase()}</span>
          </p>
          <p className="text-sm opacity-80 mt-2">
            This bus ({scanResult.busPlate}) goes to {scanResult.busDest}
          </p>

          <button
            onClick={resetScan}
            className="mt-8 rounded-full bg-white text-red-700 font-bold px-8 py-3 text-sm hover:bg-red-100 transition-colors"
          >
            Dismiss & Scan Again
          </button>
        </div>
      )}
    </div>
  );
}

function TripOption({ trip }: { trip: TripResponse }) {
  const dt = new Intl.DateTimeFormat("en-GH", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(trip.departure_time));
  return (
    <option value={trip.id}>
      {trip.vehicle_plate} · {trip.departure_station_name} → {trip.destination_station_name} · {dt}
    </option>
  );
}

// ── Unload Tab ────────────────────────────────────────────────────────────────

function UnloadTab() {
  const [parcelId, setParcelId] = useState("");
  const [done, setDone] = useState(false);
  const mutation = useUnloadParcel();

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const id = Number(parcelId.trim());
    if (!id) return;
    await mutation.mutateAsync({ parcel_id: id });
    setDone(true);
    setParcelId("");
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Truck className="h-5 w-5 text-purple-600" />
        <h2 className="font-semibold text-zinc-900">Unload / Mark Arrived</h2>
      </div>
      <p className="text-sm text-zinc-500">
        Enter the parcel ID to mark it as arrived at destination. An OTP will be sent to the receiver.
      </p>

      {done && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
          Parcel marked arrived. OTP sent to receiver via SMS.
        </div>
      )}

      {mutation.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {mutation.error instanceof Error ? mutation.error.message : "Error"}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          type="number"
          value={parcelId}
          onChange={(e) => { setParcelId(e.target.value); setDone(false); mutation.reset(); }}
          placeholder="Parcel ID…"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
        />
        <button
          type="submit"
          disabled={mutation.isPending || !parcelId}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60 transition-colors"
        >
          {mutation.isPending ? "…" : "Unload"}
        </button>
      </form>
    </div>
  );
}

// ── Collect Tab ───────────────────────────────────────────────────────────────

function CollectTab() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [done, setDone] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const mutation = useCollectParcel();

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    const otpStr = otp.join("").trim();
    if (!trackingNumber || otpStr.length < 4) return;
    await mutation.mutateAsync({ tracking_number: trackingNumber.trim(), otp: otpStr });
    setDone(true);
    setTrackingNumber("");
    setOtp(["", "", "", "", "", ""]);
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center gap-3">
        <Package2 className="h-5 w-5 text-emerald-600" />
        <h2 className="font-semibold text-zinc-900">Release to Receiver (OTP)</h2>
      </div>
      <p className="text-sm text-zinc-500">
        Enter the tracking number and the 6-digit OTP sent to the receiver&apos;s phone.
      </p>

      {done && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 font-medium">
          Parcel released to receiver successfully.
        </div>
      )}

      {mutation.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {mutation.error instanceof Error ? mutation.error.message : "Invalid OTP"}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Tracking Number
          </label>
          <input
            value={trackingNumber}
            onChange={(e) => { setTrackingNumber(e.target.value); setDone(false); mutation.reset(); }}
            placeholder="RP-STC-2024-001"
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-2">
            OTP Code (sent via SMS)
          </label>
          <div className="flex gap-2 justify-center">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="w-11 h-12 rounded-lg border-2 border-zinc-300 text-center text-lg font-bold focus:border-emerald-500 focus:ring-0 outline-none transition-colors"
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending || !trackingNumber || otp.join("").length < 4}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          {mutation.isPending ? "Verifying…" : "Verify OTP & Release Parcel"}
        </button>
      </form>
    </div>
  );
}
