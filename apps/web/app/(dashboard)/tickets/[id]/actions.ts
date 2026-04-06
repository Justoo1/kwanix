"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";

export async function cancelTicket(
  ticketId: number
): Promise<{ error?: string; success?: boolean }> {
  try {
    await apiFetch(`/api/v1/tickets/${ticketId}/cancel`, { method: "PATCH" });
    revalidatePath(`/tickets/${ticketId}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to cancel ticket.";
    return { error: msg };
  }
}

export async function shareTicket(
  ticketId: number,
  phone: string
): Promise<{ url?: string; sms_sent?: boolean; error?: string }> {
  try {
    const res = await apiFetch<{ url: string; sms_sent: boolean }>(
      `/api/v1/tickets/${ticketId}/share`,
      { method: "POST", body: JSON.stringify({ phone }) }
    );
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send SMS.";
    return { error: msg };
  }
}
