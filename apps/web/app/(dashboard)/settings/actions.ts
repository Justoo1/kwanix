"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export type SaveSettingsState = { error?: string; success?: boolean } | undefined;

export async function saveCompanySettings(
  _prev: SaveSettingsState,
  formData: FormData
): Promise<SaveSettingsState> {
  const brand_color = formData.get("brand_color") as string;

  try {
    await apiFetch("/api/v1/admin/companies/me", {
      method: "PATCH",
      body: JSON.stringify({ brand_color }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save settings.";
    return { error: msg };
  }

  revalidatePath("/settings");
  return { success: true };
}
