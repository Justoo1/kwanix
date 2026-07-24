import type { DriverTripData, DriverPassenger, DriverScanResult } from "../types/driver";

type Fetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createDriverApi(apiFetch: Fetch) {
  return {
    getTrip: () =>
      apiFetch<DriverTripData>("api/driver/trip"),

    getPassengers: () =>
      apiFetch<DriverPassenger[]>("api/driver/trip/passengers"),

    scan: (payload: string) =>
      apiFetch<DriverScanResult>("api/driver/scan", {
        method: "POST",
        body: JSON.stringify({ payload }),
      }),

    pushLocation: (latitude: number, longitude: number) =>
      apiFetch<void>("api/driver/location", {
        method: "POST",
        body: JSON.stringify({ latitude, longitude }),
      }),

    setBroadcast: (enabled: boolean) =>
      apiFetch<void>("api/driver/broadcast", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),

    shareLink: () =>
      apiFetch<void>("api/driver/share-link", { method: "POST" }),
  };
}
