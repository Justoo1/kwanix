"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export type SaveSettingsState = { error?: string; success?: boolean } | undefined;
export type ChangePasswordState = { error?: string; success?: boolean } | undefined;

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

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const current_password = formData.get("current_password") as string;
  const new_password = formData.get("new_password") as string;
  const confirm_password = formData.get("confirm_password") as string;

  if (new_password !== confirm_password) {
    return { error: "New passwords do not match." };
  }

  try {
    await apiFetch("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to change password.";
    return { error: msg };
  }

  return { success: true };
}
