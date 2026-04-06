"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { cancelTicket } from "./actions";

export default function CancelButton({ ticketId }: { ticketId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await cancelTicket(ticketId);
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
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
      >
        <XCircle className="h-4 w-4" />
        Cancel Ticket
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900">Cancel ticket?</h2>
            <p className="text-sm text-zinc-500">
              This will cancel the ticket. If the ticket has been paid, a refund will be
              initiated via Paystack. This action cannot be undone.
            </p>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setOpen(false); setError(null); }}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-700 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
              >
                Keep Ticket
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "Cancelling…" : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
