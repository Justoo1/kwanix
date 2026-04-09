/**
 * lib/auth.ts — Central authentication surface for Kwanix.
 *
 * The FastAPI backend issues JWTs via POST /api/v1/auth/login.
 * We store the access token inside an encrypted kx_session HttpOnly cookie
 * (managed by lib/session.ts). This module provides the auth helpers
 * consumed by Server Components, Server Actions, and the proxy.
 *
 * JWT payload from FastAPI includes: id, full_name, role,
 * company_id, station_id — all surfaced via SessionUser.
 */

import "server-only";

import { redirect } from "next/navigation";
import { getSession, createSession, deleteSession } from "@/lib/session";
import type { SessionPayload, SessionUser } from "@/lib/definitions";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export { createSession, deleteSession };
export type { SessionPayload, SessionUser };

/**
 * Returns the current session or redirects to /login.
 * Use in Server Components that require authentication.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Returns the current session or null (no redirect).
 * Use when auth is optional (e.g. public pages checking login state).
 */
export { getSession };

/**
 * Authenticates against the FastAPI backend.
 * Calls POST /api/v1/auth/login then GET /api/v1/auth/me to populate
 * the full SessionUser (including company_id, station_id, role).
 *
 * Returns null on failure so callers can surface meaningful errors.
 */
export async function authorizeCredentials(
  username: string,
  password: string
): Promise<{ accessToken: string; user: SessionUser } | null> {
  const body = new URLSearchParams({ username, password });

  let tokenRes: Response;
  try {
    tokenRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    return null;
  }

  if (!tokenRes.ok) return null;

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!meRes.ok) return null;

  const user = (await meRes.json()) as SessionUser;
  return { accessToken: access_token, user };
}
