export const GPS_TASK_NAME = "driver-gps-push";
export const GPS_INTERVAL_MS = 30_000;

export const QUERY_KEYS = {
  trip: ["driver", "trip"] as const,
  passengers: (tripId: number) => ["driver", "passengers", tripId] as const,
};
