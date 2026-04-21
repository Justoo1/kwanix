import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, MapPin, Wifi } from "lucide-react";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import FleetMapClient from "./FleetMapClient";

export const metadata: Metadata = { title: "Fleet Map — Kwanix" };

const ALLOWED_ROLES = ["company_admin", "super_admin", "station_manager"];

interface FleetVehicle {
  vehicle_id: number;
  plate_number: string;
  trip_id: number | null;
  trip_status: string | null;
  route: string | null;
  lat: number;
  lng: number;
  last_update: string;
  is_stale: boolean;
}

interface DeadVehicleAlert {
  vehicle_id: number;
  plate_number: string;
  trip_id: number;
  route: string;
  minutes_silent: number;
  departure_time: string;
}

export default async function FleetPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!ALLOWED_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  let fleet: FleetVehicle[] = [];
  let deadVehicles: DeadVehicleAlert[] = [];

  try {
    [fleet, deadVehicles] = await Promise.all([
      apiFetch<FleetVehicle[]>("/api/v1/livetrack/fleet"),
      apiFetch<DeadVehicleAlert[]>("/api/v1/livetrack/dead-vehicles"),
    ]);
  } catch {
    // Render with empty state — error handled below
  }

  const liveCount = fleet.filter((v) => !v.is_stale).length;
  const staleCount = fleet.filter((v) => v.is_stale).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Fleet Map</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Live GPS positions for all active vehicles.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Tracked</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{fleet.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
            <Wifi className="inline h-3 w-3 mr-1" />
            Live GPS
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{liveCount}</p>
        </div>
        <div className={`rounded-xl border p-4 shadow-sm ${staleCount > 0 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${staleCount > 0 ? "text-amber-600" : "text-zinc-500"}`}>
            Stale GPS
          </p>
          <p className={`text-2xl font-bold mt-1 ${staleCount > 0 ? "text-amber-700" : "text-zinc-400"}`}>
            {staleCount}
          </p>
        </div>
      </div>

      {/* Dead vehicle alerts */}
      {deadVehicles.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-700">GPS Silent Alerts</h2>
            <span className="ml-auto text-xs text-red-500">{deadVehicles.length} vehicle{deadVehicles.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-2">
            {deadVehicles.map((alert) => (
              <div
                key={alert.vehicle_id}
                className="flex items-center justify-between rounded-lg bg-white border border-red-100 px-3 py-2"
              >
                <div>
                  <span className="font-mono text-sm font-semibold text-zinc-800">
                    {alert.plate_number}
                  </span>
                  <span className="text-xs text-zinc-500 ml-2">{alert.route}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-600 font-medium">
                    {alert.minutes_silent} min silent
                  </span>
                  <a
                    href={`/trips/${alert.trip_id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View trip →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {fleet.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-center gap-3">
            <MapPin className="h-10 w-10 text-zinc-300" />
            <div>
              <p className="text-sm font-semibold text-zinc-600">No vehicles with GPS data</p>
              <p className="text-xs text-zinc-400 mt-1">
                Vehicles will appear here once drivers start sharing their location.
              </p>
            </div>
          </div>
        ) : (
          <FleetMapClient vehicles={fleet} />
        )}
      </div>

      {/* Vehicle list */}
      {fleet.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-700">Active Vehicles</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {fleet.map((v) => (
              <div key={v.vehicle_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${v.is_stale ? "bg-amber-400" : "bg-emerald-400"}`} />
                  <span className="font-mono text-sm font-semibold text-zinc-800">
                    {v.plate_number}
                  </span>
                  <span className="text-xs text-zinc-500">{v.route ?? "No route"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">
                    {v.last_update
                      ? new Date(v.last_update).toLocaleTimeString("en-GH", { timeStyle: "short" })
                      : "—"}
                  </span>
                  {v.trip_id && (
                    <a
                      href={`/track/bus/${v.trip_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Live link →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
