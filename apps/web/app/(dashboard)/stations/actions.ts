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

  try {
    await apiFetch("/api/v1/stations", {
      method: "POST",
      body: JSON.stringify({ name, location_code, contact_number, address, is_hub }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create station.";
    return { error: msg };
  }

  revalidatePath("/stations");
  return {};
}
