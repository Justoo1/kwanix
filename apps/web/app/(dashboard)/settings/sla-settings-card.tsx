"use client";

import { useState } from "react";
import { clientFetch } from "@/lib/client-api";

interface Props {
  initialThresholdDays: number;
}

export default function SlaSettingsCard({ initialThresholdDays }: Props) {
  const [days, setDays] = useState(initialThresholdDays);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await clientFetch("admin/company/settings", {
        method: "PATCH",
        body: JSON.stringify({ sla_threshold_days: days }),
      });
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg">
      <h2 className="text-base font-medium text-zinc-800 mb-1">SLA Settings</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Parcels that take longer than this threshold to arrive are counted as
        &ldquo;late&rdquo; in SLA reports.
      </p>
      <div className="flex items-center gap-3">
        <label className="text-sm text-zinc-700 shrink-0" htmlFor="sla-days">
          SLA threshold (days)
        </label>
        <input
          id="sla-days"
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value))))}
          className="w-20 rounded-md border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {message && (
        <p className="mt-2 text-sm text-zinc-600">{message}</p>
      )}
    </div>
  );
}
