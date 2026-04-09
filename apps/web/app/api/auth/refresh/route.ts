import { NextResponse } from "next/server";

import { createSession, deleteSession, getSession } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Server-side refresh handler for clientFetch.
 * Reads the HttpOnly session cookie, calls the FastAPI refresh endpoint,
 * and updates the session cookie with the new tokens.
 *
 * Returns 200 on success, 401 if the refresh token is missing or expired.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });

  if (!res.ok) {
    await deleteSession();
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const { access_token, refresh_token } = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };
  await createSession({ ...session, accessToken: access_token, refreshToken: refresh_token });
  return NextResponse.json({ ok: true });
}
