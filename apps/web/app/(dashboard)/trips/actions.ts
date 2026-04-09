"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export type CreateTripState = { error?: string } | undefined;

export async function createTrip(
  _prev: CreateTripState,
  formData: FormData
): Promise<CreateTripState> {
  const vehicle_id = Number(formData.get("vehicle_id"));
  const departure_station_id = Number(formData.get("departure_station_id"));
  const destination_station_id = Number(formData.get("destination_station_id"));
  const departure_time = formData.get("departure_time") as string;
  const base_fare_raw = formData.get("base_fare_ghs") as string;
  const base_fare_ghs = base_fare_raw ? parseFloat(base_fare_raw) : undefined;
  const booking_open = formData.get("booking_open") === "on";

  try {
    await apiFetch("/api/v1/trips", {
      method: "POST",
      body: JSON.stringify({
        vehicle_id,
        departure_station_id,
        destination_station_id,
        departure_time,
        base_fare_ghs,
        booking_open,
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create trip.";
    return { error: msg };
  }

  revalidatePath("/trips");
  return {};
}
