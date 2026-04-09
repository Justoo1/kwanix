"use client";

import { useState } from "react";
import { clientFetch } from "@/lib/client-api";

interface CompanyResponse {
  max_parcel_weight_kg: number | null;
}

export default function MaxWeightCard({
  initialMaxWeight,
}: {
  initialMaxWeight: number | null;
}) {
  const [value, setValue] = useState<string>(
    initialMaxWeight != null ? String(initialMaxWeight) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await clientFetch<CompanyResponse>("admin/companies/me", {
        method: "PATCH",
        body: JSON.stringify({
          max_parcel_weight_kg: value === "" ? null : Number(value),
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg space-y-4">
      <div>
        <h2 className="text-base font-medium text-zinc-800">Maximum parcel weight</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Reject parcel bookings that exceed this weight. Leave blank to allow any weight.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="number"
          min="0"
          step="0.1"
          placeholder="No limit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-36 rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <span className="text-sm text-zinc-500">kg</span>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Maximum weight saved.
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
