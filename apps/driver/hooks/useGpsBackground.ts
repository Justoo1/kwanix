import { useEffect } from "react";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { GPS_TASK_NAME, GPS_INTERVAL_MS } from "@/lib/constants";

const isExpoGo = Constants.executionEnvironment === "storeClient";

export function useGpsBackground(tripStatus: string | undefined) {
  const active = tripStatus === "loading" || tripStatus === "departed";

  useEffect(() => {
    // Background location tasks are not supported in Expo Go
    if (isExpoGo) return;

    if (!active) {
      Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).then((started) => {
        if (started) Location.stopLocationUpdatesAsync(GPS_TASK_NAME).catch(() => {});
      });
      return;
    }

    (async () => {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== "granted") return;

      const started = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME);
      if (!started) {
        await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: GPS_INTERVAL_MS,
          distanceInterval: 0,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "Kwanix Driver",
            notificationBody: "Sharing your location with passengers.",
            notificationColor: "#18181b",
          },
        });
      }
    })();

    return () => {
      Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).then((started) => {
        if (started) Location.stopLocationUpdatesAsync(GPS_TASK_NAME).catch(() => {});
      });
    };
  }, [active]);
}
