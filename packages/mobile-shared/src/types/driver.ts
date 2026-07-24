export interface DriverTripData {
  id: number;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  status: string;
  vehicle_plate: string;
  passenger_count: number;
  location_broadcast_enabled: boolean;
}

export interface DriverPassenger {
  ticket_id: number;
  seat_number: number;
  passenger_name: string;
  passenger_phone: string;
  status: string;
  payment_status: string;
}

export interface DriverScanResult {
  valid: boolean;
  marked_used: boolean;
  passenger_name: string | null;
  seat_number: number | null;
  status: string | null;
  trip_info: string | null;
  reason: string | null;
}
