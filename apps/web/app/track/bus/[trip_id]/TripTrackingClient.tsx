"use client";

import { useEffect, useState } from "react";
import { MapPin, Clock, Wifi, WifiOff, ArrowRight } from "lucide-react";
import TripTrackingMapClient from "./TripTrackingMapClient";

interface TripPosition {
  trip_id: number;
  status: string;
  departure_station_name: string;
  destination_station_name: string;
  departure_station_lat: number | null;
  departure_station_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  departure_time: string;
  vehicle_lat: number | null;
  vehicle_lng: number | null;
  vehicle_last_update: string | null;
  eta_minutes: number | null;
  gps_fresh: boolean;
}

interface TripTrackingClientProps {
  tripId: string;
  initialData: TripPosition | null;
}

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  loading: "Boarding",
  departed: "In Transit",
  arrived: "Arrived",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  loading: "bg-amber-100 text-amber-700",
  departed: "bg-emerald-100 text-emerald-700",
  arrived: "bg-zinc-100 text-zinc-600",
  cancelled: "bg-red-100 text-red-700",
};

export default function TripTrackingClient({ tripId, initialData }: TripTrackingClientProps) {
  const [data, setData] = useState<TripPosition | null>(initialData);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/livetrack/trip/${tripId}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const json: TripPosition = await res.json();
          setData(json);
          setLastRefresh(new Date());
          setError(null);
        }
      } catch {
        setError("Connection lost — retrying...");
      }
    };

    // Refresh every 15 seconds
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [tripId]);

  if (!data) {
    return (
      <div className="text-center text-zinc-500 py-12">Trip not found.</div>
    );
  }

  const statusLabel = STATUS_LABELS[data.status] ?? data.status;
  const statusColor = STATUS_COLORS[data.status] ?? "bg-zinc-100 text-zinc-600";
  const departureFmt = new Date(data.departure_time).toLocaleString("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Header card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${statusColor}`}>
              {statusLabel}
            </span>
            {data.gps_fresh ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live GPS
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <WifiOff className="h-3 w-3" />
                No GPS signal
              </span>
            )}
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 text-white">
            <span className="font-bold text-lg">{data.departure_station_name}</span>
            <ArrowRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />
            <span className="font-bold text-lg">{data.destination_station_name}</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Departed {departureFmt}</p>
        </div>

        {/* ETA banner */}
        {data.eta_minutes != null && data.status === "departed" && (
          <div className="px-6 py-3 border-b border-zinc-800 bg-emerald-900/20">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">
                Estimated arrival in ~{data.eta_minutes} minute{data.eta_minutes !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="border-b border-zinc-800 overflow-hidden">
          <TripTrackingMapClient
            departureLat={data.departure_station_lat}
            departureLng={data.departure_station_lng}
            destinationLat={data.destination_lat}
            destinationLng={data.destination_lng}
            vehicleLat={data.vehicle_lat}
            vehicleLng={data.vehicle_lng}
            departureStationName={data.departure_station_name}
            destinationStationName={data.destination_station_name}
            tripStatus={data.status}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <MapPin className="h-3 w-3" />
            {data.vehicle_last_update
              ? `GPS updated ${new Date(data.vehicle_last_update).toLocaleTimeString("en-GH", { timeStyle: "short" })}`
              : "GPS position unavailable"}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Wifi className="h-3 w-3" />
            Refreshed {lastRefresh.toLocaleTimeString("en-GH", { timeStyle: "short" })}
          </div>
        </div>

        {error && (
          <div className="px-6 pb-4">
            <p className="text-xs text-amber-400">{error}</p>
          </div>
        )}
      </div>

      {data.status !== "departed" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 text-sm text-zinc-400 text-center">
          {data.status === "scheduled" || data.status === "loading"
            ? "Live tracking will be available once the bus departs."
            : data.status === "arrived"
            ? "This bus has arrived at its destination."
            : "This trip has been cancelled."}
        </div>
      )}

      <p className="text-center text-xs text-zinc-700">
        Powered by Kwanix · Updates every 15 seconds
      </p>
    </div>
  );
}
