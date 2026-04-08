"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, deleteSession } from "@/lib/session";
import type { LoginResponse, SessionUser } from "@/lib/definitions";

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

const LoginSchema = z.object({
  username: z.string().min(1, "Phone or email is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginState =
  | { errors?: { username?: string[]; password?: string[] }; message?: string }
  | undefined;

export async function login(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const validated = LoginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  // FastAPI expects form-encoded username/password for OAuth2PasswordRequestForm
  const body = new URLSearchParams({
    username: validated.data.username,
    password: validated.data.password,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    return { message: "Could not reach the server. Please try again." };
  }

  if (!tokenRes.ok) {
    return { message: "Invalid phone/email or password." };
  }

  const { access_token, refresh_token } = (await tokenRes.json()) as LoginResponse;

  // Fetch the user profile to store in session
  const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!meRes.ok) {
    return { message: "Login succeeded but could not load user profile." };
  }

  const user = (await meRes.json()) as SessionUser;

  await createSession({ accessToken: access_token, refreshToken: refresh_token, user });

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
