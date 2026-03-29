import type { Metadata } from "next";
import Link from "next/link";
import { Bus, ChevronRight } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { TripResponse } from "@/lib/definitions";
import CreateTripForm from "./create-trip-form";

export const metadata: Metadata = { title: "Trips — RoutePass" };

interface StationResponse {
  id: number;
  name: string;
}

interface VehicleResponse {
  id: number;
  plate_number: string;
  model: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-zinc-100 text-zinc-700",
  loading: "bg-amber-100 text-amber-800",
  departed: "bg-blue-100 text-blue-800",
  arrived: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

const MANAGER_ROLES = ["station_manager", "company_admin", "super_admin"];

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const session = await getSession();
  const canCreate = MANAGER_ROLES.includes(session?.user.role ?? "");

  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const [trips, stations, vehicles] = await Promise.all([
    apiFetch<TripResponse[]>(`/api/v1/trips${query}`).catch(() => [] as TripResponse[]),
    canCreate
      ? apiFetch<StationResponse[]>("/api/v1/stations").catch(() => [] as StationResponse[])
      : Promise.resolve([] as StationResponse[]),
    canCreate
      ? apiFetch<VehicleResponse[]>("/api/v1/vehicles").catch(() => [] as VehicleResponse[])
      : Promise.resolve([] as VehicleResponse[]),
  ]);

  const statuses = ["scheduled", "loading", "departed", "arrived", "cancelled"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">Trips</h1>
      </div>

      {/* Create trip form — managers only */}
      {canCreate && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-medium text-zinc-800 mb-4">
            Schedule new trip
          </h2>
          <CreateTripForm stations={stations} vehicles={vehicles} />
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <FilterTab href="/trips" label="All" active={!status} />
        {statuses.map((s) => (
          <FilterTab
            key={s}
            href={`/trips?status=${s}`}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            active={status === s}
          />
        ))}
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Bus className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No trips found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm divide-y divide-zinc-100">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="bg-zinc-100 rounded-lg p-2">
                  <Bus className="h-4 w-4 text-zinc-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {trip.departure_station_name}{" "}
                    <span className="text-zinc-400">→</span>{" "}
                    {trip.destination_station_name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {trip.vehicle_plate} &middot;{" "}
                    {new Date(trip.departure_time).toLocaleString("en-GH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {trip.booking_open && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800">
                    Booking open
                  </span>
                )}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    STATUS_STYLES[trip.status] ?? "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {trip.status}
                </span>
                <Link
                  href={`/trips/${trip.id}`}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300"
      }`}
    >
      {label}
    </Link>
  );
}
