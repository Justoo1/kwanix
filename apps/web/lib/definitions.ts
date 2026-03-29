/**
 * Shared TypeScript types for the RoutePass web dashboard.
 * These mirror the FastAPI Pydantic response schemas.
 */

export type UserRole =
  | "super_admin"
  | "company_admin"
  | "station_manager"
  | "station_clerk";

export interface SessionUser {
  id: number;
  full_name: string;
  role: UserRole;
  company_id: number | null;
  station_id: number | null;
}

export interface SessionPayload {
  accessToken: string;
  user: SessionUser;
}

// ── API response types ──────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface TripResponse {
  id: number;
  status: string;
  vehicle_plate: string;
  vehicle_capacity: number | null;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  parcel_count: number;
  booking_open: boolean;
  price_ticket_base: number | null;
}

export interface TicketResponse {
  id: number;
  trip_id: number;
  passenger_name: string;
  passenger_phone: string;
  seat_number: number;
  fare_ghs: number;
  status: string;
  payment_status: string;
  source?: "counter" | "online";
}

export interface CompanyResponse {
  id: number;
  name: string;
  company_code: string;
  subdomain: string | null;
  is_active: boolean;
}

export interface UserResponse {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  company_id: number | null;
  station_id: number | null;
  is_active: boolean;
}

export type ParcelStatus = "pending" | "in_transit" | "arrived" | "picked_up";

export interface TrackResponse {
  tracking_number: string;
  status: ParcelStatus;
  origin_station: string;
  destination_station: string;
  last_updated: string;
}
