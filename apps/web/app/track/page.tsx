"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Package,
  Search,
  Truck,
  MapPinCheck,
  UserCheck,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Loader2,
} from "lucide-react";

const TrackingMap = dynamic(() => import("./[id]/TrackingMap"), { ssr: false });

interface PublicParcelStatus {
  tracking_number: string;
  status: string;
  origin: string;
  destination: string;
  bus_plate: string | null;
  last_updated: string;
  return_reason: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  vehicle_lat: number | null;
  vehicle_lng: number | null;
  departure_time: string | null;
  trip_status: string | null;
}

interface AIInsight {
  message: string;
  eta: string | null;
}

const TIMELINE_STEPS = [
  { key: "pending", label: "Package Logged", sub: "Registered at origin station", Icon: Package },
  { key: "in_transit", label: "In Transit", sub: "On the way to destination", Icon: Truck },
  { key: "arrived", label: "Arrived", sub: "Ready for collection at destination", Icon: MapPinCheck },
  { key: "picked_up", label: "Collected", sub: "Delivered to recipient", Icon: UserCheck },
] as const;

type StepKey = (typeof TIMELINE_STEPS)[number]["key"];
const STEP_ORDER: StepKey[] = ["pending", "in_transit", "arrived", "picked_up"];

function stepStatus(stepKey: StepKey, currentStatus: string): "done" | "active" | "pending" {
  const ci = STEP_ORDER.indexOf(currentStatus as StepKey);
  const si = STEP_ORDER.indexOf(stepKey);
  if (ci < 0) return "pending";
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "pending";
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Logged",
  in_transit: "In Transit",
  arrived: "Arrived",
  picked_up: "Collected",
  returned: "Returned",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_transit: "bg-blue-100 text-blue-700",
  arrived: "bg-primary/10 text-primary",
  picked_up: "bg-primary/10 text-primary",
  returned: "bg-red-100 text-red-700",
};

export default function TrackLandingPage() {
  const [trackingId, setTrackingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [parcel, setParcel] = useState<PublicParcelStatus | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = trackingId.trim();
    if (!id) return;

    setLoading(true);
    setParcel(null);
    setAiInsight(null);
    setError(null);
    setSearched(true);

    try {
      const [trackRes, aiRes] = await Promise.allSettled([
        fetch(`/api/proxy/track/${encodeURIComponent(id)}`),
        fetch(`/api/proxy/track/${encodeURIComponent(id)}/ai-insight`),
      ]);

      if (trackRes.status === "fulfilled") {
        const res = trackRes.value;
        if (res.status === 404) {
          setError("Tracking number not found. Please check and try again.");
        } else if (!res.ok) {
          setError("Could not load tracking information. Please try again.");
        } else {
          const data: PublicParcelStatus = await res.json();
          setParcel(data);
        }
      } else {
        setError("Could not reach the server. Please try again.");
      }

      if (aiRes.status === "fulfilled" && aiRes.value.ok) {
        const ai: AIInsight = await aiRes.value.json();
        setAiInsight(ai);
      }
    } finally {
      setLoading(false);
    }
  }

  const hasMap =
    parcel &&
    parcel.origin_lat != null &&
    parcel.origin_lng != null &&
    parcel.destination_lat != null &&
    parcel.destination_lng != null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav bar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/85 border-b border-border/50 shadow-[0_1px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="font-[family-name:var(--font-jakarta)] text-xl font-extrabold tracking-tighter text-primary"
          >
            Kwanix
          </Link>
          <Link
            href="/discover"
            className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Find a trip →
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
        {/* Page heading */}
        <div className="mb-8 lg:mb-10">
          <h1 className="font-[family-name:var(--font-jakarta)] text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
            Track your parcel
          </h1>
          <p className="text-[14px] text-muted-foreground mt-1.5">
            Enter your tracking number to see real-time delivery status.
          </p>
        </div>

        {/* Side-by-side layout: result left, form right */}
        <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start">

          {/* ── Left: Result panel ── */}
          <div>
            {!searched && !loading && (
              <EmptyState />
            )}

            {loading && <LoadingState />}

            {!loading && error && <ErrorCard id={trackingId.trim()} message={error} />}

            {!loading && parcel && (
              <div className="flex flex-col gap-4">
                {/* Status badge + route header */}
                <div className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
                        Tracking Number
                      </p>
                      <p className="font-mono text-lg font-bold text-foreground leading-tight">
                        {parcel.tracking_number}
                      </p>
                      {parcel.bus_plate && (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          Vehicle:{" "}
                          <span className="font-medium text-foreground">{parcel.bus_plate}</span>
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS_STYLES[parcel.status] ?? "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABELS[parcel.status] ?? parcel.status}
                    </span>
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-2 text-[14px] bg-secondary rounded-xl px-4 py-3">
                    <span className="font-semibold text-foreground truncate">{parcel.origin}</span>
                    <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="font-semibold text-foreground truncate">{parcel.destination}</span>
                  </div>
                </div>

                {/* Map */}
                {hasMap && (
                  <div className="bg-card rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                    <div className="px-5 py-3.5 border-b border-border">
                      <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Route Map
                      </p>
                    </div>
                    <TrackingMap
                      originLat={parcel.origin_lat!}
                      originLng={parcel.origin_lng!}
                      destinationLat={parcel.destination_lat!}
                      destinationLng={parcel.destination_lng!}
                      originName={parcel.origin}
                      destinationName={parcel.destination}
                      vehicleLat={parcel.vehicle_lat}
                      vehicleLng={parcel.vehicle_lng}
                      status={parcel.status}
                    />
                  </div>
                )}

                {/* AI Insight */}
                {aiInsight && (
                  <div className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-primary/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                        AI Update
                      </span>
                    </div>
                    <p className="text-[13px] text-foreground leading-relaxed">{aiInsight.message}</p>
                    {aiInsight.eta && (
                      <p className="mt-1.5 text-[12px] text-primary font-medium">{aiInsight.eta}</p>
                    )}
                  </div>
                )}

                {/* Timeline */}
                <div className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                  <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-5">
                    Delivery Timeline
                  </p>
                  <div className="relative">
                    <div className="absolute left-[19px] top-[20px] bottom-[20px] w-px bg-border" />
                    <div className="space-y-0">
                      {TIMELINE_STEPS.map((step, idx) => {
                        const state = stepStatus(step.key, parcel.status);
                        const isLast = idx === TIMELINE_STEPS.length - 1;
                        const { Icon } = step;
                        return (
                          <div key={step.key} className={`relative flex gap-4 ${!isLast ? "pb-6" : ""}`}>
                            <div className="relative z-10 flex-shrink-0">
                              {state === "done" && (
                                <div className="h-10 w-10 rounded-full bg-primary/10 ring-2 ring-primary/30 flex items-center justify-center">
                                  <Icon className="h-4 w-4 text-primary" />
                                </div>
                              )}
                              {state === "active" && (
                                <div className="relative h-10 w-10">
                                  <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                                  <div className="relative h-10 w-10 rounded-full bg-primary/15 ring-2 ring-primary flex items-center justify-center">
                                    <Icon className="h-4 w-4 text-primary" />
                                  </div>
                                </div>
                              )}
                              {state === "pending" && (
                                <div className="h-10 w-10 rounded-full bg-secondary ring-1 ring-border flex items-center justify-center">
                                  <Icon className="h-4 w-4 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                            <div className="pt-1.5 min-w-0">
                              <p className={`text-[13px] font-semibold leading-tight ${state === "pending" ? "text-muted-foreground/50" : "text-foreground"}`}>
                                {step.label}
                              </p>
                              <p className={`text-[12px] mt-0.5 leading-snug ${state === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                                {step.sub}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Return reason */}
                {parcel.status === "returned" && (
                  <div className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-red-200">
                    <div className="flex items-start gap-3">
                      <RotateCcw className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[12px] font-semibold text-red-600 uppercase tracking-wide mb-0.5">
                          Returned to Sender
                        </p>
                        <p className="text-[13px] text-red-700">
                          {parcel.return_reason ?? "This parcel has been returned."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <p className="text-[11px] text-muted-foreground text-right px-1">
                  Last updated:{" "}
                  {new Date(parcel.last_updated).toLocaleString("en-GH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            )}
          </div>

          {/* ── Right: Search form (always visible) ── */}
          <div className="lg:sticky lg:top-24">
            <div className="bg-card rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.07)]">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-foreground">Track a parcel</p>
                  <p className="text-[12px] text-muted-foreground">Enter your tracking number</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="tracking-id"
                    className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-1.5"
                  >
                    Tracking number
                  </label>
                  <input
                    id="tracking-id"
                    type="text"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    placeholder="e.g. KX-2024-ABCD1234"
                    className="w-full rounded-xl bg-secondary border-0 px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!trackingId.trim() || loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {loading ? "Tracking…" : "Track parcel"}
                </button>
              </form>

              <p className="text-[11px] text-muted-foreground mt-4 text-center">
                Your tracking number is on your receipt or confirmation SMS.
              </p>
            </div>

            {/* Back link */}
            <p className="text-center text-[12px] text-muted-foreground mt-4">
              <Link href="/" className="hover:text-foreground transition-colors">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-card rounded-2xl p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center text-center min-h-[320px]">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Package className="h-7 w-7 text-primary" />
      </div>
      <p className="text-[14px] font-semibold text-foreground/70">No parcel tracked yet</p>
      <p className="text-[12px] text-muted-foreground mt-1 max-w-[220px]">
        Enter a tracking number on the right to see the delivery status here.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="bg-card rounded-2xl p-10 shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col items-center justify-center text-center min-h-[320px]">
      <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
      <p className="text-[14px] font-semibold text-foreground/70">Fetching parcel status…</p>
    </div>
  );
}

function ErrorCard({ id, message }: { id: string; message: string }) {
  return (
    <div className="bg-card rounded-2xl p-8 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-red-200 flex flex-col items-center text-center min-h-[320px] justify-center">
      <div className="h-12 w-12 rounded-full bg-red-50 ring-1 ring-red-200 flex items-center justify-center mb-4">
        <AlertCircle className="h-5 w-5 text-red-500" />
      </div>
      <p className="text-[14px] font-semibold text-foreground">{message}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{id}</p>
    </div>
  );
}
