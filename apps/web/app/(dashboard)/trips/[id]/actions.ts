"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export type UpdateStatusState = { error?: string } | undefined;

export async function updateTripStatus(
  tripId: number,
  _prev: UpdateStatusState,
  formData: FormData
): Promise<UpdateStatusState> {
  const newStatus = formData.get("status") as string;
  try {
    await apiFetch(`/api/v1/trips/${tripId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      // Parse structured FastAPI error detail
      try {
        const detail = JSON.parse(err.message);
        if (detail?.code === "PARCELS_NOT_LOADED") {
          return {
            error: `Cannot depart — ${detail.count} parcel(s) still pending on this trip. Load or unload them first.`,
          };
        }
      } catch {
        // not JSON — fall through to generic message
      }
      return { error: err.message };
    }
    return { error: "Failed to update status." };
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return {};
}

export async function toggleBookingOpen(
  tripId: number,
  open: boolean
): Promise<{ error?: string }> {
  try {
    await apiFetch(`/api/v1/trips/${tripId}/booking`, {
      method: "PATCH",
      body: JSON.stringify({ booking_open: open }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to toggle booking.";
    return { error: msg };
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  return {};
}

export type AddStopState = { error?: string } | undefined;

export async function addTripStop(
  tripId: number,
  _prev: AddStopState,
  formData: FormData
): Promise<AddStopState> {
  const stationId = formData.get("station_id") as string;
  const etaTime = formData.get("eta_time") as string; // HH:MM, optional
  const departureDateIso = formData.get("departure_date_iso") as string;

  if (!stationId) {
    return { error: "Please select a station." };
  }

  let eta: string | undefined;
  if (etaTime) {
    const [h, m] = etaTime.split(":").map(Number);
    const dt = new Date(departureDateIso);
    dt.setHours(h, m, 0, 0);
    eta = dt.toISOString();
  }

  try {
    await apiFetch(`/api/v1/trips/${tripId}/stops`, {
      method: "POST",
      body: JSON.stringify({
        station_id: Number(stationId),
        sequence_order: Number(formData.get("sequence_order")),
        eta,
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to add stop.";
    return { error: msg };
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}
