"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { refundTicket } from "./actions";

export default function RefundButton({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refundRef, setRefundRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await refundTicket(ticketId, refundRef.trim() || null);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <ReceiptText className="h-4 w-4" />
        Mark Refunded
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900">Mark ticket as refunded?</h2>
            <p className="text-sm text-zinc-500">
              This will cancel the ticket and set payment status to{" "}
              <strong>Refunded</strong>. Enter the Paystack refund reference if available.
            </p>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Paystack Refund Reference{" "}
                <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={refundRef}
                onChange={(e) => setRefundRef(e.target.value)}
                placeholder="e.g. ref_abc123"
                className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setOpen(false); setError(null); }}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-700 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? "Saving…" : "Mark Refunded"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
