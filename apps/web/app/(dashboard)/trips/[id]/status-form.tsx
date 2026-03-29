"use client";

import { useActionState } from "react";
import { updateTripStatus } from "./actions";

const TRANSITIONS: Record<string, string[]> = {
  scheduled: ["loading", "cancelled"],
  loading: ["departed", "cancelled"],
  departed: ["arrived", "cancelled"],
  arrived: ["cancelled"],
  cancelled: [],
};

const STATUS_LABELS: Record<string, string> = {
  loading: "Mark as Loading",
  departed: "Mark as Departed",
  arrived: "Mark as Arrived",
  cancelled: "Cancel Trip",
};

const STATUS_STYLES: Record<string, string> = {
  loading: "bg-amber-600 hover:bg-amber-700",
  departed: "bg-blue-600 hover:bg-blue-700",
  arrived: "bg-emerald-600 hover:bg-emerald-700",
  cancelled: "bg-red-600 hover:bg-red-700",
};

export default function StatusForm({
  tripId,
  currentStatus,
}: {
  tripId: number;
  currentStatus: string;
}) {
  const boundAction = updateTripStatus.bind(null, tripId);
  const [state, action, pending] = useActionState(boundAction, undefined);

  const nextStatuses = TRANSITIONS[currentStatus] ?? [];

  if (nextStatuses.length === 0) {
    return (
      <p className="text-sm text-zinc-400">No further status changes available.</p>
    );
  }

  return (
    <div className="space-y-3">
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((s) => (
          <form key={s} action={action}>
            <input type="hidden" name="status" value={s} />
            <button
              type="submit"
              disabled={pending}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${STATUS_STYLES[s] ?? "bg-zinc-600 hover:bg-zinc-700"}`}
            >
              {STATUS_LABELS[s] ?? s}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
