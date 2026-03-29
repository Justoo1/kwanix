import type { Metadata } from "next";
import { Package, MapPin, Truck, CheckCircle, Clock } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PublicParcelStatus {
  tracking_number: string;
  status: string;
  origin: string;
  destination: string;
  bus_plate: string | null;
  last_updated: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Track ${id} — RoutePass` };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  pending: { label: "Logged — awaiting pickup", icon: Clock, color: "text-zinc-500" },
  in_transit: { label: "In Transit", icon: Truck, color: "text-blue-600" },
  arrived: { label: "Arrived — ready for collection", icon: MapPin, color: "text-amber-600" },
  picked_up: { label: "Collected", icon: CheckCircle, color: "text-emerald-600" },
};

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let parcel: PublicParcelStatus | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(`${API_BASE}/api/v1/track/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">RoutePass Tracking</h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time parcel status</p>
        </div>

        {error ? (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-center">
            <Package className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-zinc-700">{error}</p>
            <p className="text-xs text-zinc-400 mt-1">ID: {id}</p>
          </div>
        ) : parcel ? (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="bg-zinc-900 px-5 py-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">
                Tracking Number
              </p>
              <p className="font-mono text-white font-bold text-lg mt-0.5">
                {parcel.tracking_number}
              </p>
            </div>

            {/* Status */}
            <div className="px-5 py-5 border-b border-zinc-100">
              <StatusBadge status={parcel.status} />
              {parcel.bus_plate && (
                <p className="text-sm text-zinc-500 mt-2">
                  Bus: <span className="font-medium">{parcel.bus_plate}</span>
                </p>
              )}
            </div>

            {/* Route */}
            <div className="px-5 py-4 space-y-3">
              <RouteRow label="From" value={parcel.origin} />
              <RouteRow label="To" value={parcel.destination} />
              <RouteRow
                label="Last updated"
                value={new Date(parcel.last_updated).toLocaleString("en-GH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
            </div>

            {/* Progress */}
            <div className="px-5 pb-5">
              <ProgressBar status={parcel.status} />
            </div>
          </div>
        ) : null}

        <p className="text-center text-xs text-zinc-400 mt-6">
          For assistance, contact your station manager.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    icon: Package,
    color: "text-zinc-600",
  };
  const Icon = config.icon;
  return (
    <div className={`flex items-center gap-2 ${config.color}`}>
      <Icon className="h-5 w-5" />
      <span className="font-semibold text-sm">{config.label}</span>
    </div>
  );
}

function RouteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  );
}

const STEPS = ["pending", "in_transit", "arrived", "picked_up"];

function ProgressBar({ status }: { status: string }) {
  const currentIndex = STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {STEPS.map((step, i) => (
        <div
          key={step}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= currentIndex ? "bg-emerald-500" : "bg-zinc-200"
          }`}
        />
      ))}
    </div>
  );
}
