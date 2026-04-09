import "server-only";

import { redirect } from "next/navigation";

import { createSession, deleteSession, getSession } from "@/lib/session";

// Server-side: prefer API_INTERNAL_URL (Docker service name) so requests stay
// on the internal network. Falls back to NEXT_PUBLIC_API_URL for local dev
// without Docker, or plain localhost as last resort.
const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

/**
 * Authenticated fetch wrapper for Server Components and Server Actions.
 * Reads the session cookie and injects the Bearer token automatically.
 * On 401, attempts a token refresh once before redirecting to /login.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const session = await getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (session?.accessToken) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (res.ok) {
    return res.json() as Promise<T>;
  }

  if (res.status === 401 && session?.refreshToken) {
    const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (refreshRes.ok) {
      const { access_token, refresh_token } = await refreshRes.json();
      await createSession({
        ...session,
        accessToken: access_token,
        refreshToken: refresh_token,
      });

      // Retry original request with new token
      headers["Authorization"] = `Bearer ${access_token}`;
      const retryRes = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });

      if (!retryRes.ok) {
        const text = await retryRes.text().catch(() => "");
        throw new ApiError(retryRes.status, text);
      }
      return retryRes.json() as Promise<T>;
    }

    await deleteSession();
    redirect("/login");
  }

  const text = await res.text().catch(() => "");
  throw new ApiError(res.status, text);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
