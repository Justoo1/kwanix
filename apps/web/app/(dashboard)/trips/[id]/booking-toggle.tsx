"use client";

import { useState, useTransition } from "react";
import { Globe, GlobeLock } from "lucide-react";

import { toggleBookingOpen } from "./actions";

interface Props {
  tripId: number;
  bookingOpen: boolean;
  baseFare: number | null;
}

export default function BookingToggle({ tripId, bookingOpen, baseFare }: Props) {
  const [open, setOpen] = useState(bookingOpen);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !open;
    startTransition(async () => {
      const result = await toggleBookingOpen(tripId, next);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(next);
        setError(null);
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open ? (
            <Globe className="h-5 w-5 text-emerald-600" />
          ) : (
            <GlobeLock className="h-5 w-5 text-zinc-400" />
          )}
          <div>
            <h2 className="text-base font-medium text-zinc-800">Online Booking</h2>
            {baseFare != null && (
              <p className="text-xs text-zinc-500 mt-0.5">
                Base fare: GHS {baseFare.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50 ${
            open ? "bg-emerald-500" : "bg-zinc-300"
          }`}
          role="switch"
          aria-checked={open}
          aria-label="Toggle online booking"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              open ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <p className="mt-3 text-sm text-zinc-500">
        {open
          ? "Passengers can book seats online via the mobile app."
          : "Online booking is closed. Only station clerks can issue tickets."}
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
