import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";

import { apiFetch } from "@/lib/api";
import type { TripResponse, TicketResponse } from "@/lib/definitions";
import SeatPicker from "./seat-picker";

export const metadata: Metadata = { title: "Tickets — RoutePass" };

const PAYMENT_STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  refunded: "bg-zinc-100 text-zinc-500",
};

const DEFAULT_BRAND = "#18181b";

export default async function TicketsPage() {
  const [loadingTrips, recentTickets, company] = await Promise.all([
    apiFetch<TripResponse[]>("/api/v1/trips?status=loading").catch(
      () => [] as TripResponse[]
    ),
    apiFetch<TicketResponse[]>("/api/v1/tickets").catch(
      () => [] as TicketResponse[]
    ),
    apiFetch<{ brand_color?: string | null }>("/api/v1/admin/companies/me").catch(
      () => null
    ),
  ]);

  const brandColor = company?.brand_color || DEFAULT_BRAND;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Ticket className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Tickets</h1>
      </div>

      {/* Seat picker */}
      {loadingTrips.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 text-center">
          <p className="text-sm text-zinc-500">
            No trips are currently loading passengers. Change a trip status to
            &ldquo;loading&rdquo; first.
          </p>
        </div>
      ) : (
        <SeatPicker trips={loadingTrips} brandColor={brandColor} />
      )}

      {/* Recent tickets */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            Recent tickets
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({recentTickets.length})
            </span>
          </h2>
        </div>
        {recentTickets.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No tickets issued yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">#</th>
                  <th className="px-6 py-3 text-left font-medium">Passenger</th>
                  <th className="px-6 py-3 text-left font-medium">Trip</th>
                  <th className="px-6 py-3 text-left font-medium">Seat</th>
                  <th className="px-6 py-3 text-left font-medium">Fare</th>
                  <th className="px-6 py-3 text-left font-medium">Payment</th>
                  <th className="px-6 py-3 text-left font-medium">Source</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4 font-mono text-zinc-500">{t.id}</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-zinc-900">{t.passenger_name}</p>
                      <p className="text-xs text-zinc-400">{t.passenger_phone}</p>
                    </td>
                    <td className="px-6 py-4 text-zinc-600">#{t.trip_id}</td>
                    <td className="px-6 py-4 font-mono text-zinc-700">{t.seat_number}</td>
                    <td className="px-6 py-4 text-zinc-700">
                      GHS {Number(t.fare_ghs).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          PAYMENT_STYLES[t.payment_status] ??
                          "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {t.payment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.source === "online"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {t.source ?? "counter"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/tickets/${t.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
