"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-api";

interface Props {
  companyId: number;
  currentStatus: string;
  currentPeriodEnd: string | null;
  currentBillingMode: string;
  currentTransactionFeePct: number | null;
}

const STATUSES = ["trialing", "active", "grace", "suspended", "cancelled"] as const;
const BILLING_MODES = [
  { value: "subscription", label: "Subscription" },
  { value: "per_transaction", label: "Per Transaction" },
] as const;

export default function BillingOverrideForm({
  companyId,
  currentStatus,
  currentPeriodEnd,
  currentBillingMode,
  currentTransactionFeePct,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [periodEnd, setPeriodEnd] = useState(
    currentPeriodEnd ? currentPeriodEnd.slice(0, 10) : ""
  );
  const [billingMode, setBillingMode] = useState(currentBillingMode);
  const [feePct, setFeePct] = useState(
    currentTransactionFeePct != null ? String(currentTransactionFeePct) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const body: Record<string, string | number | null> = {
      subscription_status: status,
      billing_mode: billingMode,
      transaction_fee_pct: feePct ? Number(feePct) : null,
    };
    body.current_period_end = periodEnd ? new Date(periodEnd).toISOString() : null;

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

        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">
            Billing mode
          </label>
          <select
            value={billingMode}
            onChange={(e) => setBillingMode(e.target.value)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          >
            {BILLING_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1">
            Transaction fee % <span className="text-zinc-400">(blank = platform default)</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 5.00"
            value={feePct}
            onChange={(e) => setFeePct(e.target.value)}
            disabled={billingMode !== "per_transaction"}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-zinc-300"
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
