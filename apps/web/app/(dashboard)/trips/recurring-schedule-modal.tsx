"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RepeatIcon } from "lucide-react";
import { clientFetch } from "@/lib/client-api";
import { useStations, useVehicles } from "@/hooks/use-trips";

interface GenerateScheduleResponse {
  trip_ids: number[];
  created: number;
}

interface FormState {
  vehicle_id: string;
  departure_station_id: string;
  destination_station_id: string;
  departure_time: string;
  days_ahead: string;
  base_fare_ghs: string;
}

const BLANK: FormState = {
  vehicle_id: "",
  departure_station_id: "",
  destination_station_id: "",
  departure_time: "08:00",
  days_ahead: "7",
  base_fare_ghs: "",
};

export default function RecurringScheduleModal() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(BLANK);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GenerateScheduleResponse | null>(null);

  const { data: stations = [], isLoading: loadingStations } = useStations();
  const { data: vehicles = [], isLoading: loadingVehicles } = useVehicles();

  function closeModal() {
    setOpen(false);
    setForm(BLANK);
    setError(null);
    setResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await clientFetch<GenerateScheduleResponse>("trips/generate-schedule", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: Number(form.vehicle_id),
          departure_station_id: Number(form.departure_station_id),
          destination_station_id: Number(form.destination_station_id),
          departure_time: form.departure_time,
          days_ahead: Number(form.days_ahead),
          base_fare_ghs: form.base_fare_ghs ? Number(form.base_fare_ghs) : undefined,
        }),
      });
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        <RepeatIcon className="h-4 w-4" />
        Schedule recurring
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900">Schedule recurring trips</h2>

            {result ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-700">
                  Successfully created <strong>{result.created}</strong> trip
                  {result.created !== 1 ? "s" : ""}.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={closeModal}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                {/* Vehicle */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Vehicle</label>
                  <select
                    required
                    value={form.vehicle_id}
                    onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                    disabled={loadingVehicles}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  >
                    <option value="">{loadingVehicles ? "Loading…" : "Select vehicle"}</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate_number}{v.capacity ? ` (${v.capacity} seats)` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Route */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">From</label>
                    <select
                      required
                      value={form.departure_station_id}
                      onChange={(e) => setForm({ ...form, departure_station_id: e.target.value })}
                      disabled={loadingStations}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    >
                      <option value="">{loadingStations ? "Loading…" : "Station"}</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">To</label>
                    <select
                      required
                      value={form.destination_station_id}
                      onChange={(e) => setForm({ ...form, destination_station_id: e.target.value })}
                      disabled={loadingStations}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    >
                      <option value="">{loadingStations ? "Loading…" : "Station"}</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Time + days */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Daily departure time</label>
                    <input
                      type="time"
                      required
                      value={form.departure_time}
                      onChange={(e) => setForm({ ...form, departure_time: e.target.value })}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Days ahead (1–30)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="30"
                      value={form.days_ahead}
                      onChange={(e) => setForm({ ...form, days_ahead: e.target.value })}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                  </div>
                </div>

                {/* Base fare */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Base fare (GHS){" "}
                    <span className="text-zinc-400 font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.base_fare_ghs}
                    onChange={(e) => setForm({ ...form, base_fare_ghs: e.target.value })}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </div>

                <p className="text-xs text-zinc-500">
                  Creates one trip per day for the next {form.days_ahead || "N"} day(s) at {form.departure_time}.
                </p>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? "Generating…" : "Generate schedule"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
