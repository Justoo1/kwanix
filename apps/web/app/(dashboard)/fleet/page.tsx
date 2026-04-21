import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, MapPin, Wifi } from "lucide-react";
import Link from "next/link";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import FleetMapClient, { type FleetVehicle } from "./FleetMapClient";

export const metadata: Metadata = { title: "Fleet Map — Kwanix" };

const ALLOWED_ROLES = ["company_admin", "super_admin", "station_manager"];

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
    // Render with empty state
  }

  const liveCount = fleet.filter((v) => !v.is_stale).length;
  const staleCount = fleet.filter((v) => v.is_stale).length;

  return (
    <div className="flex flex-col gap-5">
      {/* KPI strip */}
      <div className="flex gap-3.5 flex-wrap">
        {/* Tracked */}
        <div className="flex-1 min-w-[120px] bg-card rounded-[14px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.4px] mb-1.5">Tracked</div>
          <div className="text-[30px] font-bold text-foreground leading-none">{fleet.length}</div>
        </div>

        {/* Live GPS */}
        <div className="flex-1 min-w-[120px] bg-card rounded-[14px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[oklch(0.88_0.060_145)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="h-[7px] w-[7px] rounded-full bg-primary animate-scan-pulse" />
            <span className="text-[11px] font-semibold text-primary uppercase tracking-[0.4px]">Live GPS</span>
          </div>
          <div className="text-[30px] font-bold text-primary leading-none">{liveCount}</div>
        </div>

        {/* Stale GPS */}
        <div className={`flex-1 min-w-[120px] bg-card rounded-[14px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${staleCount > 0 ? "border border-amber-200" : ""}`}>
          <div className={`text-[11px] font-semibold uppercase tracking-[0.4px] mb-1.5 ${staleCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
            Stale GPS
          </div>
          <div className={`text-[30px] font-bold leading-none ${staleCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
            {staleCount}
          </div>
        </div>
      </div>

      {/* GPS silent alerts */}
      {deadVehicles.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-[18px] py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-[13px] font-bold text-amber-900">GPS Silent Alerts</span>
            </div>
            <span className="text-[12px] font-semibold text-amber-600">{deadVehicles.length} vehicle{deadVehicles.length !== 1 ? "s" : ""}</span>
          </div>

          {deadVehicles.map((alert) => (
            <div key={alert.vehicle_id} className="bg-amber-50 border border-amber-100 rounded-lg px-[18px] py-2.5 flex justify-between items-center">
              <div>
                <span className="font-bold text-[13px] text-amber-900">{alert.plate_number}</span>
                <span className="text-[12px] text-amber-700 ml-2.5">{alert.route}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[12px] text-amber-700 font-medium">{alert.minutes_silent} min silent</span>
                <Link href={`/trips/${alert.trip_id}`} className="text-[12px] font-semibold text-blue-600 hover:underline">
                  View trip →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Map + Active vehicle list side by side */}
      <div className="flex gap-5">
        {/* Map */}
        <div className="flex-1 bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden relative">
          {fleet.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[420px] text-center gap-3">
              <MapPin className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="text-[14px] font-semibold text-foreground/70">No vehicles with GPS data</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Vehicles appear once drivers start sharing their location.
                </p>
              </div>
            </div>
          ) : (
            <FleetMapClient vehicles={fleet} />
          )}
          {/* Map overlay badge */}
          {fleet.length > 0 && (
            <div className="absolute top-3 right-3 bg-white rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-foreground shadow-md flex items-center gap-1.5 z-[1000]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-scan-pulse" />
              Live · Ghana
            </div>
          )}
        </div>

        {/* Active vehicle list */}
        {fleet.length > 0 && (
          <div className="w-[280px] bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden shrink-0">
            <div className="px-[18px] py-3.5 border-b border-border text-[14px] font-bold text-foreground">
              Active Vehicles
            </div>
            <div className="divide-y divide-border">
              {fleet.map((v) => (
                <div key={v.vehicle_id} className="px-[18px] py-3.5 hover:bg-muted/40 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${v.is_stale ? "bg-amber-400" : "bg-primary"}`} />
                      <span className="font-bold text-[13px] text-foreground">{v.plate_number}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {v.last_update
                        ? new Date(v.last_update).toLocaleTimeString("en-GH", { timeStyle: "short" })
                        : "—"}
                    </span>
                  </div>
                  <div className="text-[12px] text-muted-foreground pl-4 mb-2">{v.route ?? "No route"}</div>
                  {v.trip_id && (
                    <div className="pl-4">
                      <a
                        href={`/track/bus/${v.trip_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] font-semibold text-blue-600 hover:underline"
                      >
                        Live link →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-[12px] text-muted-foreground px-1">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-primary border-2 border-white shadow-sm" />
          Live GPS
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-amber-400 border-2 border-white shadow-sm" />
          Stale GPS (&gt;15 min)
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <div className="w-8 border-t-2 border-dashed border-primary opacity-60" />
            <div className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          Route line
        </div>
      </div>
    </div>
  );
}
