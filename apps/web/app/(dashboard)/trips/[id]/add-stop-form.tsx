"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { useStations } from "@/hooks/use-trips";
import { clientFetch } from "@/lib/client-api";
import { addTripStop } from "./actions";

interface TripStop {
  id: number;
  station_id: number;
  sequence_order: number;
  eta: string | null;
  station_name: string | null;
}

export default function AddStopForm({
  tripId,
  departureTimeIso,
  stops,
}: {
  tripId: number;
  departureTimeIso: string;
  stops: TripStop[];
}) {
  const router = useRouter();
  const { data: stations = [], isLoading } = useStations();
  const boundAction = addTripStop.bind(null, tripId);
  const [state, action, pending] = useActionState(boundAction, undefined);

  const nextSequence = stops.length > 0 ? Math.max(...stops.map((s) => s.sequence_order)) + 1 : 1;

  async function handleRemove(stopId: number) {
    if (!window.confirm("Remove this stop?")) return;
    try {
      await clientFetch(`trips/${tripId}/stops/${stopId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      // no-op — button stays, user can retry
    }
  }

  return (
    <div className="divide-y divide-zinc-100">
      {stops.length > 0 && (
        <ol className="divide-y divide-zinc-100">
          {stops.map((stop) => (
            <li key={stop.id} className="flex items-center gap-4 px-6 py-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                {stop.sequence_order}
              </span>
              <span className="flex-1 text-sm font-medium text-zinc-800">
                {stop.station_name ?? `Station #${stop.station_id}`}
              </span>
              {stop.eta && (
                <span className="text-xs text-zinc-400">
                  ETA{" "}
                  {new Date(stop.eta).toLocaleTimeString("en-GH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(stop.id)}
                className="text-zinc-300 hover:text-red-500 transition-colors"
                aria-label="Remove stop"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <form action={action} className="px-6 py-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="sequence_order" value={nextSequence} />
        <input type="hidden" name="departure_date_iso" value={departureTimeIso} />

        <div className="flex-1 min-w-[10rem]">
          <label className="block text-xs font-medium text-zinc-500 mb-1">Station</label>
          <select
            name="station_id"
            disabled={isLoading}
            required
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">{isLoading ? "Loading…" : "Select station"}</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.city ? ` (${s.city})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">
            ETA (optional)
          </label>
          <input
            type="time"
            name="eta_time"
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          {pending ? "Adding…" : "Add stop"}
        </button>
      </form>

      {state?.error && (
        <p className="px-6 pb-4 text-sm text-red-600">{state.error}</p>
      )}
    </div>
  );
}
