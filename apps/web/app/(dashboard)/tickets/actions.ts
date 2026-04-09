"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api";
import type { TicketResponse } from "@/lib/definitions";

export type CreateTicketState =
  | { message?: string; ticket_id?: number; seat_number?: number }
  | undefined;

export interface SeatInfo {
  seat_number: number;
  passenger_name: string | null;
  payment_status: string;
  source: string;
}

export interface TripSeats {
  capacity: number;
  base_fare: number | null;
  taken: SeatInfo[];
}

export async function fetchSeatsForTrip(tripId: number): Promise<TripSeats | null> {
  try {
    const [trip, tickets] = await Promise.all([
      apiFetch<{ vehicle_capacity: number | null; price_ticket_base: number | null }>(
        `/api/v1/trips/${tripId}`
      ),
      apiFetch<TicketResponse[]>(`/api/v1/tickets?trip_id=${tripId}`),
    ]);
    const taken: SeatInfo[] = tickets
      .filter((t) => t.status !== "cancelled")
      .map((t) => ({
        seat_number: t.seat_number,
        passenger_name: t.passenger_name,
        payment_status: t.payment_status,
        source: t.source ?? "counter",
      }));
    return {
      capacity: trip.vehicle_capacity ?? 50,
      base_fare: trip.price_ticket_base,
      taken,
    };
  } catch {
    return null;
  }
}

export async function createTicket(
  _state: CreateTicketState,
  formData: FormData
): Promise<CreateTicketState> {
  const body = {
    trip_id: Number(formData.get("trip_id")),
    passenger_name: (formData.get("passenger_name") as string) || "Walk-in",
    passenger_phone: (formData.get("passenger_phone") as string) || "0200000000",
    seat_number: Number(formData.get("seat_number")),
    fare_ghs: Number(formData.get("fare_ghs")),
  };

  try {
    const ticket = await apiFetch<TicketResponse>("/api/v1/tickets", {
      method: "POST",
      body: JSON.stringify(body),
    });
    revalidatePath("/tickets");
    return { ticket_id: ticket.id, seat_number: ticket.seat_number };
  } catch (err) {
    if (err instanceof Error) {
      try {
        const parsed = JSON.parse(err.message);
        const detail = parsed?.detail;
        // Pydantic v2 returns an array of validation error objects
        if (Array.isArray(detail)) {
          return { message: detail.map((e: { msg: string }) => e.msg).join("; ") };
        }
        if (detail?.code === "SEAT_TAKEN") {
          return { message: `Seat ${body.seat_number} is already taken.` };
        }
        if (detail?.code === "TRIP_FULL") {
          return { message: "This trip is fully booked — no seats available." };
        }
        return { message: typeof detail === "string" ? detail : err.message };
      } catch {
        return { message: err.message };
      }
    }
    return { message: "An unexpected error occurred." };
  }
}
