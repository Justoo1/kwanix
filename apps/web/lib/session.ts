import "server-only";

import { SignJWT, decodeJwt, jwtVerify } from "jose";
import { cookies } from "next/headers";

import type { SessionPayload } from "@/lib/definitions";

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

const REFRESH_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

const COOKIE_NAME = "kx_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (matches refresh token lifetime)

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable must be set in production");
    }
    return new TextEncoder().encode("kwanix-dev-secret-32chars!!");
  }
  return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getSecretKey());
}

export async function decrypt(
  session: string | undefined
): Promise<SessionPayload | null> {
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(data: SessionPayload): Promise<void> {
  const token = await encrypt(data);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return decrypt(token);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export function isExpiringSoon(expiresAt: number | undefined): boolean {
  if (expiresAt === undefined) return false;
  return Date.now() > expiresAt - REFRESH_THRESHOLD_MS;
}

/**
 * Exchanges the stored refresh token for a new access token and overwrites
 * the session cookie. Only call this from Route Handlers or Server Actions
 * (not plain Server Components) — those are the only contexts that can write
 * cookies in Next.js.
 *
 * Returns the refreshed payload, or null if the refresh token is expired /
 * the backend is unreachable (caller should fall back to the existing session).
 */
export async function refreshSession(
  payload: SessionPayload
): Promise<SessionPayload | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: payload.refreshToken }),
    });
    if (!res.ok) return null;

    const { access_token, refresh_token } = await res.json();
    const { exp } = decodeJwt(access_token);
    const accessTokenExpiresAt = exp
      ? exp * 1000
      : Date.now() + 60 * 60 * 1000;

    const newPayload: SessionPayload = {
      ...payload,
      accessToken: access_token,
      refreshToken: refresh_token,
      accessTokenExpiresAt,
    };
    await createSession(newPayload);
    return newPayload;
  } catch {
    return null;
  }
}
