import type { Metadata } from "next";
import {
  Package,
  Truck,
  MapPinCheck,
  UserCheck,
  AlertCircle,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PublicParcelStatus {
  tracking_number: string;
  status: string;
  origin: string;
  destination: string;
  bus_plate: string | null;
  last_updated: string;
  return_reason: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Track ${id} — Kwanix`,
    description: "Real-time parcel tracking for your Kwanix shipment.",
  };
}

// ── Timeline step configuration ────────────────────────────────────────────────

const TIMELINE_STEPS = [
  {
    key: "pending",
    label: "Package Logged",
    sub: "Registered at origin station",
    Icon: Package,
  },
  {
    key: "in_transit",
    label: "In Transit",
    sub: "On the way to destination",
    Icon: Truck,
  },
  {
    key: "arrived",
    label: "Arrived",
    sub: "Ready for collection at destination",
    Icon: MapPinCheck,
  },
  {
    key: "picked_up",
    label: "Collected",
    sub: "Delivered to recipient",
    Icon: UserCheck,
  },
] as const;

type StepKey = (typeof TIMELINE_STEPS)[number]["key"];

const STEP_ORDER: StepKey[] = ["pending", "in_transit", "arrived", "picked_up"];

function stepStatus(
  stepKey: StepKey,
  currentStatus: string
): "done" | "active" | "pending" {
  const ci = STEP_ORDER.indexOf(currentStatus as StepKey);
  const si = STEP_ORDER.indexOf(stepKey);
  if (ci < 0) return "pending";
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "pending";
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let parcel: PublicParcelStatus | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/track/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) {
      error = "Tracking ID not found.";
    } else if (!res.ok) {
      error = "Could not load tracking information.";
    } else {
      parcel = await res.json();
    }
  } catch {
    error = "Could not reach the server. Please try again.";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 flex flex-col items-center justify-center px-4 py-12">
      {/* Brand bar */}
      <div className="mb-8 flex flex-col items-center gap-1 select-none">
        <span className="text-xs font-bold tracking-[0.25em] uppercase text-zinc-500">
          Kwanix
        </span>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Parcel Tracker
        </h1>
      </div>

      <div className="w-full max-w-md">
        {error ? (
          <ErrorCard id={id} message={error} />
        ) : parcel ? (
          <TrackCard parcel={parcel} />
        ) : null}
      </div>

      <p className="mt-8 text-xs text-zinc-600 text-center">
        For assistance, contact your nearest Kwanix station.
      </p>
    </div>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────

function ErrorCard({ id, message }: { id: string; message: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm p-8 text-center shadow-2xl">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
        <AlertCircle className="h-6 w-6 text-red-400" />
      </div>
      <p className="font-semibold text-white">{message}</p>
      <p className="mt-1 font-mono text-xs text-zinc-500">{id}</p>
    </div>
  );
}

// ── Main tracking card ─────────────────────────────────────────────────────────

function TrackCard({ parcel }: { parcel: PublicParcelStatus }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1">
          Tracking Number
        </p>
        <p className="font-mono text-lg font-bold text-white leading-tight">
          {parcel.tracking_number}
        </p>
        {parcel.bus_plate && (
          <p className="mt-1.5 text-xs text-zinc-400">
            Vehicle:{" "}
            <span className="font-medium text-zinc-300">{parcel.bus_plate}</span>
          </p>
        )}
      </div>

      {/* Route row */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-200 truncate">{parcel.origin}</span>
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
        <span className="font-medium text-zinc-200 truncate">{parcel.destination}</span>
      </div>

      {/* Timeline */}
      <div className="px-6 py-6">
        <div className="relative">
          {/* Vertical spine */}
          <div className="absolute left-[19px] top-[20px] bottom-[20px] w-px bg-zinc-800" />

          <div className="space-y-0">
            {TIMELINE_STEPS.map((step, idx) => {
              const state = stepStatus(step.key, parcel.status);
              const isLast = idx === TIMELINE_STEPS.length - 1;
              const { Icon } = step;

              return (
                <div
                  key={step.key}
                  className={`relative flex gap-4 ${!isLast ? "pb-6" : ""}`}
                >
                  {/* Circle indicator */}
                  <div className="relative z-10 flex-shrink-0">
                    {state === "done" && (
                      <div className="h-10 w-10 rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/40 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-emerald-400" />
                      </div>
                    )}
                    {state === "active" && (
                      <div className="relative h-10 w-10">
                        {/* Outer pulse ring */}
                        <span className="absolute inset-0 rounded-full bg-sky-400/20 animate-ping" />
                        <div className="relative h-10 w-10 rounded-full bg-sky-500/20 ring-2 ring-sky-400 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-sky-300" />
                        </div>
                      </div>
                    )}
                    {state === "pending" && (
                      <div className="h-10 w-10 rounded-full bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="pt-1.5 min-w-0">
                    <p
                      className={`text-sm font-semibold leading-tight ${
                        state === "done"
                          ? "text-emerald-400"
                          : state === "active"
                            ? "text-sky-300"
                            : "text-zinc-600"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p
                      className={`text-xs mt-0.5 leading-snug ${
                        state === "pending" ? "text-zinc-700" : "text-zinc-500"
                      }`}
                    >
                      {step.sub}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Return reason callout */}
      {parcel.status === "returned" && (
        <div className="mx-6 mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
          <RotateCcw className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-0.5">
              Returned to Sender
            </p>
            <p className="text-sm text-red-300">
              {parcel.return_reason ?? "This parcel has been returned."}
            </p>
          </div>
        </div>
      )}

      {/* Footer: last updated */}
      <div className="px-6 pb-5">
        <p className="text-[11px] text-zinc-600 text-right">
          Last updated:{" "}
          <span className="text-zinc-500">
            {new Date(parcel.last_updated).toLocaleString("en-GH", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </p>
      </div>
    </div>
  );
}
