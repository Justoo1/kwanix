"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/client-api";

interface WeightTier {
  max_kg: number | null;
  fee_ghs: number;
}

interface WeightTiersResponse {
  tiers: WeightTier[];
}

export default function WeightTierCard({
  initialTiers,
}: {
  initialTiers: WeightTier[];
}) {
  const [tiers, setTiers] = useState<WeightTier[]>(initialTiers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function addTier() {
    setTiers([...tiers, { max_kg: null, fee_ghs: 0 }]);
  }

  function removeTier(idx: number) {
    setTiers(tiers.filter((_, i) => i !== idx));
  }

  function updateTier(idx: number, field: keyof WeightTier, value: string) {
    const updated = [...tiers];
    if (field === "max_kg") {
      updated[idx] = { ...updated[idx], max_kg: value === "" ? null : Number(value) };
    } else {
      updated[idx] = { ...updated[idx], fee_ghs: Number(value) };
    }
    setTiers(updated);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await clientFetch<WeightTiersResponse>("admin/companies/me/weight-tiers", {
        method: "PUT",
        body: JSON.stringify({ tiers }),
      });
      setTiers(result.tiers);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save weight tiers.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg space-y-4">
      <div>
        <h2 className="text-base font-medium text-zinc-800">Parcel weight tiers</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Auto-calculate the parcel fee when a clerk enters a weight. Tiers are matched
          top-to-bottom; leave &ldquo;Max kg&rdquo; blank for the catch-all tier.
        </p>
      </div>

      {tiers.length === 0 ? (
        <p className="text-sm text-zinc-400">No tiers configured. Add one below.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wide px-1">
            <span>Max kg (blank = unlimited)</span>
            <span>Fee (GHS)</span>
            <span />
          </div>
          {tiers.map((tier, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="unlimited"
                value={tier.max_kg ?? ""}
                onChange={(e) => updateTier(idx, "max_kg", e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
                value={tier.fee_ghs}
                onChange={(e) => updateTier(idx, "fee_ghs", e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <button
                type="button"
                onClick={() => removeTier(idx)}
                className="rounded-md p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Weight tiers saved.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addTier}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add tier
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save tiers"}
        </button>
      </div>
    </div>
  );
}
