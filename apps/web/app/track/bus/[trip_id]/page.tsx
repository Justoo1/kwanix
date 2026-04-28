import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import TripTrackingClient from "./TripTrackingClient";

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trip_id: string }>;
}): Promise<Metadata> {
  const { trip_id } = await params;
  return {
    title: `Live Bus Tracking — Trip ${trip_id} · Kwanix`,
    description: "Track your Kwanix bus in real time.",
  };
}

export default async function BusTrackingPage({
  params,
}: {
  params: Promise<{ trip_id: string }>;
}) {
  const { trip_id } = await params;

  let initialData = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/livetrack/trip/${encodeURIComponent(trip_id)}`,
      { cache: "no-store" }
    );
    if (res.status === 404) {
      fetchError = "Trip not found.";
    } else if (!res.ok) {
      fetchError = "Could not load trip information.";
    } else {
      initialData = await res.json();
    }
  } catch {
    fetchError = "Could not reach the server. Please try again.";
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-1 select-none">
        <span className="text-xs font-bold tracking-[0.25em] uppercase text-zinc-500">
          Kwanix
        </span>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Live Bus Tracker
        </h1>
      </div>

      {fetchError ? (
        <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <p className="font-semibold text-white">{fetchError}</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">Trip #{trip_id}</p>
        </div>
      ) : (
        <TripTrackingClient tripId={trip_id} initialData={initialData} />
      )}

      <p className="mt-8 text-xs text-zinc-600 text-center">
        For assistance, contact your nearest Kwanix station.
      </p>
    </div>
  );
}
