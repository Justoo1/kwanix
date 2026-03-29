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
    const msg = err instanceof Error ? err.message : "Failed to update status.";
    return { error: msg };
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
