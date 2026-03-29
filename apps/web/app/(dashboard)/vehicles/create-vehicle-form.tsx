"use client";

import { useActionState } from "react";
import { createVehicle, type CreateVehicleState } from "./actions";

export default function CreateVehicleForm() {
  const [state, action, pending] = useActionState<CreateVehicleState, FormData>(
    createVehicle,
    undefined
  );

  if (state !== undefined && !state?.error) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-sm font-medium text-emerald-600">Vehicle added!</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-blue-600 hover:underline"
        >
          Add another
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Plate number
          </label>
          <input
            name="plate_number"
            type="text"
            required
            placeholder="GR-1234-24"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Model <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="model"
            type="text"
            placeholder="DAF CF, VW Crafter…"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Capacity (seats)
          </label>
          <input
            name="capacity"
            type="number"
            min="1"
            defaultValue={50}
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Adding…" : "Add vehicle"}
        </button>
      </div>
    </form>
  );
}
