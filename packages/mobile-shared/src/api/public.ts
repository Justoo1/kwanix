import type { PublicTrip, SeatMap } from "../types/trip";
import type { PublicTicket, BookResponse, ParcelStatus } from "../types/ticket";

type Fetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface BookPayload {
  passenger_name: string;
  passenger_phone: string;
  passenger_email?: string;
  seat_number: number;
}

export function createPublicApi(apiFetch: Fetch) {
  return {
    searchRoutes: (params: { from_city?: string; to_city?: string }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return apiFetch<{ from_city: string; to_city: string }[]>(`api/public/routes?${q}`);
    },

    listTrips: (params: { from_city?: string; to_city?: string; date?: string }) => {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>
      ).toString();
      return apiFetch<PublicTrip[]>(`api/public/trips?${q}`);
    },

    getTrip: (tripId: number) =>
      apiFetch<PublicTrip>(`api/public/trips/${tripId}`),

    getSeatMap: (tripId: number) =>
      apiFetch<SeatMap>(`api/public/trips/${tripId}/seats`),

    bookTrip: (tripId: number, payload: BookPayload) =>
      apiFetch<BookResponse>(`api/public/trips/${tripId}/book`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    verifyPayment: (reference: string) =>
      apiFetch<{ payment_status: string; ticket_id: number }>(
        `api/public/payments/${reference}/verify`,
        { method: "POST" }
      ),

    getTicket: (ticketId: number, paymentRef?: string) => {
      const q = paymentRef ? `?payment_ref=${paymentRef}` : "";
      return apiFetch<PublicTicket>(`api/public/tickets/${ticketId}${q}`);
    },

    trackParcel: (trackingNumber: string) =>
      apiFetch<ParcelStatus>(`api/track/${trackingNumber}`),
  };
}
