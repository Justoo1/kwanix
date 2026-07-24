import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { driverApi } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";

export function useDriverPassengers(tripId: number) {
  return useQuery({
    queryKey: QUERY_KEYS.passengers(tripId),
    queryFn: () => driverApi.getPassengers(),
    staleTime: 30_000,
  });
}

export function useDriverScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: string) => driverApi.scan(payload),
    onSuccess: (result) => {
      if (result.valid) {
        qc.invalidateQueries({ queryKey: ["driver", "passengers"] });
      }
    },
  });
}
