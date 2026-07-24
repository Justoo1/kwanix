import { useState } from "react";
import { router } from "expo-router";
import { setTokens, clearTokens } from "@/lib/auth-store";
import type { SessionUser } from "@routpass/mobile-shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const body = new URLSearchParams({ username: email, password });
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) {
        setError("Invalid email or password.");
        return;
      }
      const data: { access_token: string; refresh_token: string } = await res.json();

      // Fetch user profile to verify role
      const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (!meRes.ok) {
        setError("Failed to load profile.");
        return;
      }
      const user: SessionUser = await meRes.json();
      if (user.role !== "driver") {
        setError("This app is for drivers only.");
        return;
      }

      await setTokens(data.access_token, data.refresh_token);
      router.replace("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await clearTokens();
    router.replace("/auth/login");
  }

  return { login, logout, loading, error };
}
