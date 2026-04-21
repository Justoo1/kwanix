"use client";

import { useState } from "react";
import Link from "next/link";
import { Ticket, ReceiptText, Banknote, TrendingUp } from "lucide-react";
import type { TripResponse, TicketResponse } from "@/lib/definitions";
import SeatPicker from "./seat-picker";

type Tab = "new" | "recent";

const PAYMENT_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-muted text-muted-foreground",
};

interface Props {
  availableTrips: TripResponse[];
  recentTickets: TicketResponse[];
  brandColor: string;
  totalRevenue: number;
  avgFare: number;
  paidTickets: number;
}

export default function TicketsClient({
  availableTrips,
  recentTickets,
  brandColor,
  totalRevenue,
  avgFare,
  paidTickets,
}: Props) {
  const [tab, setTab] = useState<Tab>("new");

  return (
    <div className="flex flex-col gap-6">
      {/* Tab strip */}
      <div className="flex gap-1.5">
        <TabBtn active={tab === "new"} onClick={() => setTab("new")}>New Ticket</TabBtn>
        <TabBtn active={tab === "recent"} onClick={() => setTab("recent")}>
          Recent Tickets
          {recentTickets.length > 0 && (
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tab === "recent" ? "bg-white/20" : "bg-muted"}`}>
              {recentTickets.length}
            </span>
          )}
        </TabBtn>
      </div>

      {tab === "new" && (
        <div className="flex flex-col-reverse gap-5 lg:flex-row lg:items-start">
          {/* Seat picker */}
          <div className="flex-1 min-w-0">
            {availableTrips.length === 0 ? (
              <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-10 text-center">
                <div className="rounded-2xl p-4 bg-primary/10 w-fit mx-auto mb-4">
                  <Ticket className="h-7 w-7 text-primary" />
                </div>
                <p className="text-[14px] font-semibold text-foreground/70">No active trips</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Create a scheduled or loading trip to issue tickets.
                </p>
              </div>
            ) : (
              <SeatPicker trips={availableTrips} brandColor={brandColor} />
            )}
          </div>

          {/* Stats — row on mobile, sidebar on desktop */}
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:w-[220px] lg:shrink-0">
            <StatCard
              icon={<ReceiptText className="h-4 w-4 text-primary" />}
              label="Total Tickets"
              value={String(recentTickets.length)}
            />
            <StatCard
              icon={<Banknote className="h-4 w-4 text-emerald-600" />}
              label="Paid Tickets"
              value={String(paidTickets)}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
              label="Avg Fare"
              value={`GHS ${avgFare.toFixed(2)}`}
            />
          </div>
        </div>
      )}

      {tab === "recent" && (
        <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-foreground">Recent Tickets</h2>
            <span className="text-[12px] text-muted-foreground">{recentTickets.length} total</span>
          </div>
          {recentTickets.length === 0 ? (
            <p className="px-5 py-10 text-[13px] text-muted-foreground text-center">
              No tickets issued yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-muted/30">
                    {["#", "Passenger", "Trip", "Seat", "Fare", "Payment", "Source", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-[12px] text-muted-foreground">{t.id}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] font-semibold text-foreground">{t.passenger_name}</p>
                        <p className="text-[11px] text-muted-foreground">{t.passenger_phone}</p>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-muted-foreground">#{t.trip_id}</td>
                      <td className="px-5 py-3.5 font-mono text-[13px] text-foreground">{t.seat_number}</td>
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-foreground">
                        GHS {Number(t.fare_ghs).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PAYMENT_STYLES[t.payment_status] ?? "bg-muted text-muted-foreground"}`}>
                          {t.payment_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.source === "online" ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                          {t.source ?? "counter"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/tickets/${t.id}`} className="text-[12px] font-semibold text-primary hover:underline">
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors ${
        active
          ? "bg-primary text-white"
          : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-[20px] font-bold text-foreground">{value}</div>
    </div>
  );
}
