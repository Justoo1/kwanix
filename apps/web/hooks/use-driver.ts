"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { clientFetch } from "@/lib/client-api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriverTripData {
  id: number;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  status: string;
  vehicle_plate: string;
  passenger_count: number;
  location_broadcast_enabled: boolean;
}

export interface DriverPassenger {
  ticket_id: number;
  seat_number: number;
  passenger_name: string;
  passenger_phone: string;
  status: string;
  payment_status: string;
}

export interface DriverScanResult {
  valid: boolean;
  marked_used: boolean;
  passenger_name: string | null;
  seat_number: number | null;
  status: string | null;
  trip_info: string | null;
  reason: string | null;
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const driverKeys = {
  trip: ["driver", "trip"] as const,
  passengers: (tripId: number) => ["driver", "passengers", tripId] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useDriverTrip(initialData?: DriverTripData) {
  return useQuery({
    queryKey: driverKeys.trip,
    queryFn: () => clientFetch<DriverTripData>("driver/trip"),
    initialData,
    staleTime: 60_000,
    retry: false,
  });
}

export function useDriverPassengers(tripId: number) {
  return useQuery({
    queryKey: driverKeys.passengers(tripId),
    queryFn: () => clientFetch<DriverPassenger[]>("driver/trip/passengers"),
    staleTime: 30_000,
  });
}

export function useDriverScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: string) =>
      clientFetch<DriverScanResult>("driver/scan", {
        method: "POST",
        body: JSON.stringify({ payload }),
      }),
    onSuccess: (result) => {
      if (result.valid) {
        qc.invalidateQueries({ queryKey: ["driver", "passengers"] });
      }
    },
  });
}

export function useDriverCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, tripId, seatNumber }: { ticketId: number; tripId: number; seatNumber: number }) =>
      clientFetch<DriverScanResult>("driver/scan", {
        method: "POST",
        body: JSON.stringify({ payload: `TICKET:${ticketId}:${tripId}:${seatNumber}` }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver", "passengers"] });
    },
  });
}
