import { useQuery } from "@tanstack/react-query";
import { driverApi } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";

export function useDriverTrip() {
  return useQuery({
    queryKey: QUERY_KEYS.trip,
    queryFn: () => driverApi.getTrip(),
    staleTime: 60_000,
    retry: false,
  });
}
