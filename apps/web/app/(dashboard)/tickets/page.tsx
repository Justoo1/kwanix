import type { Metadata } from "next";

import { apiFetch } from "@/lib/api";
import type { TripResponse, TicketResponse } from "@/lib/definitions";
import TicketsClient from "./TicketsClient";

export const metadata: Metadata = { title: "Tickets — Kwanix" };

const DEFAULT_BRAND = "#008A56";

export default async function TicketsPage() {
  const [[scheduledTrips, loadingTrips], recentTickets, company] = await Promise.all([
    Promise.all([
      apiFetch<TripResponse[]>("/api/v1/trips?status=scheduled").catch(() => [] as TripResponse[]),
      apiFetch<TripResponse[]>("/api/v1/trips?status=loading").catch(() => [] as TripResponse[]),
    ]),
    apiFetch<TicketResponse[]>("/api/v1/tickets").catch(() => [] as TicketResponse[]),
    apiFetch<{ brand_color?: string | null }>("/api/v1/admin/companies/me").catch(() => null),
  ]);

  const availableTrips = [...scheduledTrips, ...loadingTrips];
  const brandColor = company?.brand_color || DEFAULT_BRAND;

  const totalRevenue = recentTickets.reduce((s, t) => s + Number(t.fare_ghs ?? 0), 0);
  const avgFare = recentTickets.length > 0 ? totalRevenue / recentTickets.length : 0;
  const paidTickets = recentTickets.filter((t) => t.payment_status === "paid").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Tickets</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Issue and manage passenger tickets</p>
      </div>

      <TicketsClient
        availableTrips={availableTrips}
        recentTickets={recentTickets}
        brandColor={brandColor}
        totalRevenue={totalRevenue}
        avgFare={avgFare}
        paidTickets={paidTickets}
      />
    </div>
  );
}
