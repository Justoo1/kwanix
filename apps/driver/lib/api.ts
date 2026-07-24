import { createApiClient, createDriverApi } from "@routpass/mobile-shared";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth-store";
import { router } from "expo-router";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

let _refresh: Promise<string> | null = null;

async function getTokenWithRefresh(): Promise<string | null> {
  const token = await getAccessToken();
  return token;
}

function onUnauthorized() {
  // Attempt token refresh then re-navigate
  (async () => {
    if (_refresh) return; // already in-flight
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error("no refresh token");

      _refresh = fetch(`${BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
        .then((r) => {
          if (!r.ok) throw new Error("refresh failed");
          return r.json();
        })
        .then(async (data: { access_token: string; refresh_token: string }) => {
          await setTokens(data.access_token, data.refresh_token);
          return data.access_token;
        });

      await _refresh;
    } catch {
      await clearTokens();
      router.replace("/auth/login");
    } finally {
      _refresh = null;
    }
  })();
}

export const { apiFetch } = createApiClient(BASE_URL, getTokenWithRefresh, onUnauthorized);
export const driverApi = createDriverApi(apiFetch);
