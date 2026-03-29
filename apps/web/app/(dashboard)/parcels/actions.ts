"use server";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import type { ParcelStatus } from "@/lib/definitions";

export type CreateParcelState =
  | { message?: string; tracking_number?: string; qr_code_base64?: string }
  | undefined;

interface ParcelResponse {
  id: number;
  tracking_number: string;
  status: ParcelStatus;
  qr_code_base64: string | null;
}

export async function createParcel(
  _state: CreateParcelState,
  formData: FormData
): Promise<CreateParcelState> {
  const session = await getSession();
  if (!session) return { message: "Not authenticated." };

  const body = {
    sender_name: formData.get("sender_name"),
    sender_phone: formData.get("sender_phone"),
    receiver_name: formData.get("receiver_name"),
    receiver_phone: formData.get("receiver_phone"),
    origin_station_id: Number(formData.get("origin_station_id")),
    destination_station_id: Number(formData.get("destination_station_id")),
    weight_kg: formData.get("weight_kg") ? Number(formData.get("weight_kg")) : null,
    fee_ghs: Number(formData.get("fee_ghs") ?? 0),
    description: formData.get("description") || null,
  };

  try {
    const parcel = await apiFetch<ParcelResponse>("/api/v1/parcels", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      tracking_number: parcel.tracking_number,
      qr_code_base64: parcel.qr_code_base64 ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "An error occurred.";
    return { message: msg };
  }
}
