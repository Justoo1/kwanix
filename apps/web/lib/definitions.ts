/**
 * Shared TypeScript types for the RoutePass web dashboard.
 *
 * Session / auth types are defined here.
 * Domain types (TripResponse, TicketResponse, etc.) are re-exported from the
 * auto-generated API types file — run `bash infrastructure/scripts/generate_types.sh`
 * to regenerate after backend schema changes.
 */

import type { components } from "@/types/api.generated";

// ── Re-export generated domain types ────────────────────────────────────────
export type { components };
export type UserRole = components["schemas"]["UserRole"];
export type TripResponse = components["schemas"]["TripResponse"];
export type TicketResponse = components["schemas"]["TicketResponse"];
export type CompanyResponse = components["schemas"]["CompanyResponse"];
export type UserResponse = components["schemas"]["UserResponse"];
export type ParcelResponse = components["schemas"]["ParcelResponse"];
export type ParcelStatus = "pending" | "in_transit" | "arrived" | "picked_up" | "returned";
export type TrackResponse = components["schemas"]["PublicParcelStatus"];

// ── Session / auth types (not in OpenAPI schema) ─────────────────────────────

export interface SessionUser {
  id: number;
  full_name: string;
  role: UserRole;
  company_id: number | null;
  station_id: number | null;
}

export interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp in milliseconds — when the access token expires. */
  accessTokenExpiresAt?: number;
  user: SessionUser;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
