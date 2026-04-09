"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-api";

interface Props {
  companyId: number;
  currentStatus: string;
  currentPeriodEnd: string | null;
}

const STATUSES = ["trialing", "active", "grace", "suspended", "cancelled"] as const;

export default function BillingOverrideForm({ companyId, currentStatus, currentPeriodEnd }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [periodEnd, setPeriodEnd] = useState(
    currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const body: Record<string, string | null> = { subscription_status: status };
    if (periodEnd) {
      body.current_period_end = new Date(periodEnd).toISOString();
    } else {
      body.current_period_end = null;
    }

    try {
      await clientFetch(`admin/companies/${companyId}/billing/override`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSuccess(true);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Override failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">
            Subscription status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">
            Period end date <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          Billing override applied successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Applying…" : "Apply override"}
      </button>
    </form>
  );
}
