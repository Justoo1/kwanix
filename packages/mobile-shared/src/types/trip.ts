export interface PublicTrip {
  id: number;
  company_id: number;
  company_name: string;
  company_code: string;
  brand_color: string;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  status: string;
  price_ticket_base: number | null;
  booking_open: boolean;
  vehicle_plate: string | null;
  available_seats: number;
  total_seats: number;
}

export interface SeatMap {
  capacity: number;
  taken: number[];
}
