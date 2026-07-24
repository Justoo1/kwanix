import { useQuery, useMutation } from "@tanstack/react-query";
import { publicApi } from "@/lib/api";
import type { BookPayload } from "@routpass/mobile-shared";

export function usePublicRoutes() {
  return useQuery({
    queryKey: ["public", "routes"],
    queryFn: () => publicApi.searchRoutes({}),
    staleTime: 5 * 60_000,
  });
}

export function useTrips(params: { from_city?: string; to_city?: string; date?: string }) {
  return useQuery({
    queryKey: ["public", "trips", params],
    queryFn: () => publicApi.listTrips(params),
    enabled: !!(params.from_city || params.to_city),
    staleTime: 60_000,
  });
}

export function useTripDetail(tripId: number) {
  return useQuery({
    queryKey: ["public", "trip", tripId],
    queryFn: () => publicApi.getTrip(tripId),
    staleTime: 60_000,
  });
}

export function useSeatMap(tripId: number) {
  return useQuery({
    queryKey: ["public", "seats", tripId],
    queryFn: () => publicApi.getSeatMap(tripId),
    staleTime: 30_000,
  });
}

export function useBookTrip(tripId: number) {
  return useMutation({
    mutationFn: (payload: BookPayload) => publicApi.bookTrip(tripId, payload),
  });
}

export function useVerifyPayment(reference: string) {
  return useQuery({
    queryKey: ["payment", "verify", reference],
    queryFn: () => publicApi.verifyPayment(reference),
    enabled: !!reference,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.payment_status === "paid") return false;
      return 2_000;
    },
    retry: 10,
  });
}

export function useTicket(ticketId: number) {
  return useQuery({
    queryKey: ["public", "ticket", ticketId],
    queryFn: () => publicApi.getTicket(ticketId),
    staleTime: 5 * 60_000,
    enabled: ticketId > 0,
  });
}

export function useParcelTracking(trackingNumber: string) {
  return useQuery({
    queryKey: ["public", "parcel", trackingNumber],
    queryFn: () => publicApi.trackParcel(trackingNumber),
    enabled: !!trackingNumber,
    staleTime: 60_000,
  });
}
