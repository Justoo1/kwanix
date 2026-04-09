"use client";

import { useState } from "react";
import { QrCode, X } from "lucide-react";

export default function QrButton({ ticketId }: { ticketId: number }) {
  const [open, setOpen] = useState(false);
  const qrUrl = `/api/proxy/tickets/${ticketId}/qr`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors print:hidden"
      >
        <QrCode className="h-4 w-4" />
        Show QR
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-xl p-6 flex flex-col items-center gap-4 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <h2 className="text-base font-semibold text-zinc-800">Ticket QR Code</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={`QR code for ticket ${ticketId}`}
              className="w-48 h-48 rounded-lg border border-zinc-100"
            />
            <p className="text-xs text-zinc-500 text-center">
              Scan to verify ticket #{ticketId}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
