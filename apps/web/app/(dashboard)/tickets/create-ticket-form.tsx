"use client";

import { useActionState } from "react";

import type { TripResponse } from "@/lib/definitions";
import { createTicket, type CreateTicketState } from "./actions";

export default function CreateTicketForm({
  trips,
}: {
  trips: TripResponse[];
}) {
  const [state, action, pending] = useActionState<
    CreateTicketState,
    FormData
  >(createTicket, undefined);

  if (state?.ticket_id) {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="text-emerald-600 font-semibold text-sm">
          Ticket issued!
        </div>
        <p className="text-sm text-zinc-600">
          Ticket #<span className="font-bold">{state.ticket_id}</span> &mdash; Seat{" "}
          <span className="font-bold">{state.seat_number}</span>
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 hover:underline"
        >
          Issue another ticket
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">
          Trip
        </label>
        <select
          name="trip_id"
          required
          className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white"
        >
          <option value="">Select trip…</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.departure_station_name} → {t.destination_station_name} &mdash;{" "}
              {t.vehicle_plate}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Passenger Name
          </label>
          <input
            name="passenger_name"
            type="text"
            required
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Phone
          </label>
          <input
            name="passenger_phone"
            type="tel"
            required
            placeholder="0541234567"
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Seat Number
          </label>
          <input
            name="seat_number"
            type="number"
            min="1"
            required
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Fare (GHS)
          </label>
          <input
            name="fare_ghs"
            type="number"
            min="0"
            step="0.01"
            required
            className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {state?.message && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {pending ? "Issuing ticket…" : "Issue Ticket"}
      </button>
    </form>
  );
}
