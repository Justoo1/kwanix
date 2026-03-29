"use client";

import { useActionState } from "react";
import { createStation, type CreateStationState } from "./actions";

export default function CreateStationForm() {
  const [state, action, pending] = useActionState<CreateStationState, FormData>(
    createStation,
    undefined
  );

  if (state !== undefined && !state?.error) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-sm font-medium text-emerald-600">Station created!</p>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Station name
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="Accra — Neoplan"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Location code <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="location_code"
            type="text"
            maxLength={10}
            placeholder="ACC"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Contact number <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="contact_number"
            type="tel"
            placeholder="233302123456"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Address <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            name="address"
            type="text"
            placeholder="Ring Road, Accra"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="is_hub"
            value="true"
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
          />
          <span className="text-sm text-zinc-700">Hub station</span>
        </label>
        <span className="text-xs text-zinc-400">(central depot for parcel collection)</span>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating…" : "Create station"}
        </button>
      </div>
    </form>
  );
}
