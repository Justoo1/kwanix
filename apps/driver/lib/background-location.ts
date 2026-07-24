import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { GPS_TASK_NAME } from "./constants";
import { getAccessToken } from "./auth-store";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

// Background tasks only work in standalone/development builds, not Expo Go
const isExpoGo = Constants.executionEnvironment === "storeClient";

if (!isExpoGo) {
  TaskManager.defineTask(GPS_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
    if (error) return;
    const locationData = data as { locations: Array<{ coords: { latitude: number; longitude: number } }> };
    const location = locationData?.locations?.[0];
    if (!location) return;

    const token = await getAccessToken();
    if (!token) return;

    try {
      await fetch(`${BASE_URL}/api/driver/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }),
      });
    } catch {
      // Ignore network errors in background task
    }
  });
}
