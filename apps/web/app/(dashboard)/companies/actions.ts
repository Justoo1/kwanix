"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function createCompany(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const name = formData.get("name") as string;
  const company_code = formData.get("company_code") as string;
  const subdomain = (formData.get("subdomain") as string) || undefined;
  const billing_mode = (formData.get("billing_mode") as string) || "subscription";
  const feePctRaw = formData.get("transaction_fee_pct") as string;
  const transaction_fee_pct = feePctRaw ? Number(feePctRaw) : undefined;

  try {
    await apiFetch("/api/v1/admin/companies", {
      method: "POST",
      body: JSON.stringify({ name, company_code, subdomain, billing_mode, transaction_fee_pct }),
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Failed to create company.";
    return { error: msg };
  }

  revalidatePath("/companies");
  return {};
}
