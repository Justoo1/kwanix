"use client";

import { useActionState } from "react";

import { createTrip, type CreateTripState } from "./actions";

interface Station {
  id: number;
  name: string;
}

interface Vehicle {
  id: number;
  plate_number: string;
  model: string | null;
}

export default function CreateTripForm({
  stations,
  vehicles,
}: {
  stations: Station[];
  vehicles: Vehicle[];
}) {
  const [state, action, pending] = useActionState<CreateTripState, FormData>(
    createTrip,
    undefined
  );

  if (state !== undefined && !state?.error) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-sm font-medium text-emerald-600">Trip scheduled!</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 hover:underline"
        >
          Schedule another
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Vehicle
          </label>
          <select
            name="vehicle_id"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="">Select vehicle…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number}{v.model ? ` — ${v.model}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Departure time
          </label>
          <input
            name="departure_time"
            type="datetime-local"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            From
          </label>
          <select
            name="departure_station_id"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="">Select station…</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            To
          </label>
          <select
            name="destination_station_id"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="">Select station…</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">
            Base fare (GHS){" "}
            <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="base_fare_ghs"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          name="booking_open"
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
        />
        <span className="text-sm text-zinc-700">
          Allow passengers to book seats online
        </span>
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Scheduling…" : "Schedule trip"}
        </button>
      </div>
    </form>
  );
}
