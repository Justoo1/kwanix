import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bus } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { TicketResponse } from "@/lib/definitions";
import StatusForm from "./status-form";
import BookingToggle from "./booking-toggle";

interface TripDetail {
  id: number;
  status: string;
  vehicle_id: number;
  vehicle_plate: string | null;
  departure_station_name: string | null;
  destination_station_name: string | null;
  departure_time: string;
  parcel_count: number;
  booking_open: boolean;
  price_ticket_base: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-zinc-100 text-zinc-700",
  loading: "bg-amber-100 text-amber-800",
  departed: "bg-blue-100 text-blue-800",
  arrived: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

const MANAGER_ROLES = ["station_manager", "company_admin", "super_admin"];

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const [trip, tickets] = await Promise.all([
    apiFetch<TripDetail>(`/api/v1/trips/${id}`).catch(() => null),
    apiFetch<TicketResponse[]>(`/api/v1/tickets?trip_id=${id}`).catch(
      () => [] as TicketResponse[]
    ),
  ]);

  if (!trip) notFound();

  const canManage = MANAGER_ROLES.includes(session?.user.role ?? "");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/trips"
          className="text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900">Trip #{trip.id}</h1>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[trip.status] ?? "bg-zinc-100 text-zinc-600"}`}
        >
          {trip.status}
        </span>
      </div>

      {/* Trip info card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="bg-zinc-100 rounded-lg p-3">
            <Bus className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-lg">
              {trip.departure_station_name}{" "}
              <span className="text-zinc-400">→</span>{" "}
              {trip.destination_station_name}
            </p>
            <p className="text-sm text-zinc-500">
              {trip.vehicle_plate} &middot;{" "}
              {new Date(trip.departure_time).toLocaleString("en-GH", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-zinc-100">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Tickets</p>
            <p className="text-xl font-bold text-zinc-900 mt-1">{tickets.length}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Online</p>
            <p className="text-xl font-bold text-zinc-900 mt-1">
              {tickets.filter((t) => t.source === "online").length}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Counter</p>
            <p className="text-xl font-bold text-zinc-900 mt-1">
              {tickets.filter((t) => !t.source || t.source === "counter").length}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Parcels</p>
            <p className="text-xl font-bold text-zinc-900 mt-1">{trip.parcel_count}</p>
          </div>
        </div>
      </div>

      {/* Online booking toggle — managers only */}
      {canManage && (
        <BookingToggle
          tripId={trip.id}
          bookingOpen={trip.booking_open}
          baseFare={trip.price_ticket_base}
        />
      )}

      {/* Status update */}
      {canManage && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-base font-medium text-zinc-800 mb-4">
            Update status
          </h2>
          <StatusForm tripId={trip.id} currentStatus={trip.status} />
        </div>
      )}

      {/* Ticket list */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-base font-medium text-zinc-800">
            Tickets
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({tickets.length})
            </span>
          </h2>
        </div>
        {tickets.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No tickets issued yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Seat</th>
                <th className="px-6 py-3 text-left font-medium">Passenger</th>
                <th className="px-6 py-3 text-left font-medium">Phone</th>
                <th className="px-6 py-3 text-left font-medium">Fare</th>
                <th className="px-6 py-3 text-left font-medium">Source</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4 font-mono text-zinc-700">{t.seat_number}</td>
                  <td className="px-6 py-4 font-medium text-zinc-900">{t.passenger_name}</td>
                  <td className="px-6 py-4 text-zinc-500">{t.passenger_phone}</td>
                  <td className="px-6 py-4 text-zinc-700">GHS {Number(t.fare_ghs).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.source === "online"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {t.source ?? "counter"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
