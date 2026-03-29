"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function createUser(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const full_name = formData.get("full_name") as string;
  const phone = formData.get("phone") as string;
  const email = (formData.get("email") as string) || undefined;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  const station_id_raw = formData.get("station_id") as string;
  const station_id = station_id_raw ? parseInt(station_id_raw, 10) : undefined;

  try {
    await apiFetch("/api/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ full_name, phone, email, password, role, station_id }),
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Failed to create user.";
    return { error: msg };
  }

  revalidatePath("/users");
  return {};
}
