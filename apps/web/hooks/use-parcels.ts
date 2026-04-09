"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-api";
import type { ParcelStatus, TripResponse } from "@/lib/definitions";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParcelRow {
  id: number;
  tracking_number: string;
  status: ParcelStatus;
  sender_name: string;
  receiver_name: string;
  receiver_phone: string;
  origin_station_id: number;
  destination_station_id: number;
  origin_station_name: string | null;
  destination_station_name: string | null;
  weight_kg: number | null;
  fee_ghs: number;
  description: string | null;
  created_at: string | null;
  loaded_at: string | null;
  arrived_at: string | null;
  collected_at: string | null;
  declared_value_ghs: number | null;
  qr_code_base64?: string | null;
}

export interface ParcelsParams {
  q?: string;
  status?: ParcelStatus;
  limit?: number;
  offset?: number;
}

export interface DestinationMismatch {
  code: "DESTINATION_MISMATCH";
  correct_destination: string;
  bus_destination: string;
  bus_plate: string;
}

// ── Query Keys ─────────────────────────────────────────────────────────────────

export const parcelKeys = {
  all: ["parcels"] as const,
  list: (params?: ParcelsParams) => ["parcels", "list", params ?? {}] as const,
  activeTrips: ["trips", "loading"] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────────

export function useParcels(params: ParcelsParams = {}) {
  return useQuery({
    queryKey: parcelKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.status) qs.set("status", params.status);
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.offset !== undefined) qs.set("offset", String(params.offset));
      const qsStr = qs.toString();
      return clientFetch<ParcelRow[]>(`parcels${qsStr ? "?" + qsStr : ""}`);
    },
  });
}

export function useActiveTrips() {
  return useQuery({
    queryKey: parcelKeys.activeTrips,
    queryFn: () =>
      clientFetch<TripResponse[]>("trips?status=loading"),
    staleTime: 30_000,
  });
}

export function useLoadParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tracking_number: string; trip_id: number }) =>
      clientFetch<{ success: boolean; message: string; tracking_number: string }>(
        "parcels/load",
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
    },
  });
}

export function useUnloadParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { parcel_id: number }) =>
      clientFetch<{ success: boolean; message: string }>("parcels/unload", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
    },
  });
}

export function useCollectParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tracking_number: string; otp: string }) =>
      clientFetch<{ success: boolean; message: string }>("parcels/collect", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
    },
  });
}

export interface BatchUnloadResponse {
  succeeded: number[];
  failed: { id: number; error: string }[];
}

export function useBatchUnload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parcel_ids: number[]) =>
      clientFetch<BatchUnloadResponse>("parcels/batch-unload", {
        method: "POST",
        body: JSON.stringify({ parcel_ids }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
    },
  });
}

export function useReturnParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parcelId, reason }: { parcelId: number; reason?: string }) =>
      clientFetch<ParcelRow>(`parcels/${parcelId}/return`, {
        method: "PATCH",
        body: JSON.stringify({ reason: reason ?? null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
    },
  });
}
