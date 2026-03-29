"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export type CreateVehicleState = { error?: string } | undefined;

export async function createVehicle(
  _prev: CreateVehicleState,
  formData: FormData
): Promise<CreateVehicleState> {
  const plate_number = formData.get("plate_number") as string;
  const model = (formData.get("model") as string) || undefined;
  const capacity = Number(formData.get("capacity") || 50);

  try {
    await apiFetch("/api/v1/vehicles", {
      method: "POST",
      body: JSON.stringify({ plate_number, model, capacity }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to add vehicle.";
    return { error: msg };
  }

  revalidatePath("/vehicles");
  return {};
}
