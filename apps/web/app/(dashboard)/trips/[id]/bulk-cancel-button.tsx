"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { clientFetch } from "@/lib/client-api";

interface BulkCancelButtonProps {
  ticketIds: number[];
}

export default function BulkCancelButton({ ticketIds }: BulkCancelButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (ticketIds.length === 0) return null;

  async function handleClick() {
    const confirmed = window.confirm(
      `Cancel all ${ticketIds.length} active ticket(s) on this trip? Paid tickets will be refunded.`
    );
    if (!confirmed) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await clientFetch<{ succeeded: number[]; failed: number[] }>(
        "tickets/batch-cancel",
        {
          method: "POST",
          body: JSON.stringify({ ticket_ids: ticketIds }),
        }
      );
      setResult(
        `Cancelled ${res.succeeded.length} ticket(s).${
          res.failed.length > 0 ? ` ${res.failed.length} failed.` : ""
        }`
      );
      router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed to cancel tickets.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
      >
        <XCircle className="h-4 w-4" />
        {loading ? "Cancelling…" : `Cancel all ${ticketIds.length} ticket(s)`}
      </button>
      {result && <p className="text-xs text-zinc-500">{result}</p>}
    </div>
  );
}
