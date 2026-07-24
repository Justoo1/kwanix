export interface PublicTicket {
  id: number;
  trip_id: number;
  passenger_name: string;
  passenger_phone: string;
  passenger_email: string | null;
  seat_number: number;
  fare_ghs: number;
  status: string;
  payment_status: string;
  payment_ref: string | null;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  company_name: string;
  brand_color: string;
}

export interface BookResponse {
  ticket_id: number;
  authorization_url: string;
  reference: string;
}

export interface ParcelStatus {
  tracking_number: string;
  description: string;
  sender_name: string;
  receiver_name: string;
  receiver_phone: string;
  origin_station_name: string;
  destination_station_name: string;
  status: string;
  fee_ghs: number | null;
  created_at: string;
  updated_at: string;
}
