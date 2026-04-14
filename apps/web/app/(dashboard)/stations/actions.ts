"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export type CreateStationState = { error?: string } | undefined;

export async function createStation(
  _prev: CreateStationState,
  formData: FormData
): Promise<CreateStationState> {
  const name = formData.get("name") as string;
  const location_code = (formData.get("location_code") as string) || undefined;
  const contact_number = (formData.get("contact_number") as string) || undefined;
  const address = (formData.get("address") as string) || undefined;
  const is_hub = formData.get("is_hub") === "true";
  const latRaw = formData.get("latitude") as string;
  const lngRaw = formData.get("longitude") as string;
  const latitude = latRaw ? parseFloat(latRaw) : undefined;
  const longitude = lngRaw ? parseFloat(lngRaw) : undefined;

  try {
    await apiFetch("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ name, location_code, contact_number, address, is_hub, latitude, longitude }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create station.";
    return { error: msg };
  }

  revalidatePath("/stations");
  return {};
}
