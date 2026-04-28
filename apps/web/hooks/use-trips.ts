"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/client-api"
import type { TripResponse } from "@/lib/definitions"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StationOption {
  id: number
  name: string
  city: string | null
}

export interface VehicleOption {
  id: number
  plate_number: string
  model: string | null
  capacity: number | null
}

export interface TripStopInput {
  station_id: number
  eta?: string | null
}

export interface CreateTripPayload {
  vehicle_id: number
  departure_station_id: number
  destination_station_id: number
  /** ISO 8601 datetime string */
  departure_time: string
  base_fare_ghs?: number
  booking_open?: boolean
  stops?: TripStopInput[]
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const tripKeys = {
  all: ["trips"] as const,
  list: (status?: string) => ["trips", "list", status ?? "all"] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useTrips(status?: string) {
  return useQuery({
    queryKey: tripKeys.list(status),
    queryFn: () => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ""
      return clientFetch<TripResponse[]>(`trips${qs}`)
    },
  })
}

export function useStations() {
  return useQuery({
    queryKey: ["stations"],
    queryFn: () => clientFetch<StationOption[]>("stations"),
    staleTime: 5 * 60_000,
  })
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: () => clientFetch<VehicleOption[]>("vehicles"),
    staleTime: 5 * 60_000,
  })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTripPayload) =>
      clientFetch<TripResponse>("trips", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}
