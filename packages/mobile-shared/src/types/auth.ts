export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SessionUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  company_id: number;
  station_id: number | null;
}
