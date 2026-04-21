"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { clientFetch } from "@/lib/client-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompanyActivityStats {
  total_trips: number;
  active_trips: number;
  tickets_today: number;
  parcels_today: number;
  revenue_ghs_today: number;
}

interface TripItem {
  id: number;
  departure_station: string;
  destination_station: string;
  departure_time: string;
  status: string;
  ticket_count: number;
  parcel_count: number;
}

interface TicketItem {
  id: number;
  passenger_name: string;
  trip_id: number;
  fare_ghs: number;
  status: string;
  payment_status: string;
  created_at: string;
}

interface ParcelItem {
  id: number;
  tracking_number: string;
  sender_name: string;
  receiver_name: string;
  status: string;
  fee_ghs: number;
  created_at: string;
}

interface FeeInvoice {
  id: number;
  period_date: string;
  amount_ghs: number;
  fee_count: number;
  status: string;
  paid_at: string | null;
}

interface FeeSummary {
  pending_amount_ghs: number;
  pending_count: number;
  total_charged_ghs: number;
  invoices: FeeInvoice[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function TD({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-sm text-zinc-700">{children}</td>;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled:  "bg-blue-50 text-blue-700",
  loading:    "bg-amber-50 text-amber-700",
  departed:   "bg-purple-50 text-purple-700",
  arrived:    "bg-emerald-50 text-emerald-700",
  cancelled:  "bg-zinc-100 text-zinc-500",
  valid:      "bg-emerald-50 text-emerald-700",
  used:       "bg-zinc-100 text-zinc-500",
  pending:    "bg-amber-50 text-amber-700",
  in_transit: "bg-blue-50 text-blue-700",
  picked_up:  "bg-emerald-50 text-emerald-700",
  returned:   "bg-red-50 text-red-700",
  paid:       "bg-emerald-50 text-emerald-700",
  failed:     "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-zinc-100">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-zinc-100 w-24" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function StatCard({ label, value, isLoading }: { label: string; value: string | number; isLoading: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      {isLoading ? (
        <div className="h-5 w-16 animate-pulse rounded bg-zinc-200" />
      ) : (
        <p className="text-lg font-semibold text-zinc-900">{value}</p>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm text-zinc-400">
        {message}
      </td>
    </tr>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function OverviewTab({ companyId }: { companyId: number }) {
  const { data, isLoading } = useQuery<CompanyActivityStats>({
    queryKey: ["admin", "company-stats", companyId],
    queryFn: () => clientFetch<CompanyActivityStats>(`admin/companies/${companyId}/stats`),
    staleTime: 60_000,
  });

  const items = [
    { label: "Total trips",        value: data?.total_trips ?? 0 },
    { label: "Active trips now",   value: data?.active_trips ?? 0 },
    { label: "Tickets today",      value: data?.tickets_today ?? 0 },
    { label: "Parcels today",      value: data?.parcels_today ?? 0 },
    {
      label: "Revenue today",
      value: data ? `GHS ${data.revenue_ghs_today.toFixed(2)}` : "GHS 0.00",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={item.value} isLoading={isLoading} />
      ))}
    </div>
  );
}

function TripsTab({ companyId }: { companyId: number }) {
  const { data, isLoading } = useQuery<TripItem[]>({
    queryKey: ["admin", "company-trips", companyId],
    queryFn: () => clientFetch<TripItem[]>(`admin/companies/${companyId}/trips`),
    staleTime: 60_000,
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white mt-1">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="bg-zinc-50 border-b border-zinc-100">
          <tr>
            <TH>ID</TH>
            <TH>Route</TH>
            <TH>Departure</TH>
            <TH>Status</TH>
            <TH>Tickets</TH>
            <TH>Parcels</TH>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={6} />
        ) : (
          <tbody className="divide-y divide-zinc-100">
            {(data ?? []).length === 0 ? (
              <EmptyRow cols={6} message="No trips found." />
            ) : (
              (data ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <TD>{t.id}</TD>
                  <TD>
                    <span className="whitespace-nowrap">
                      {t.departure_station} → {t.destination_station}
                    </span>
                  </TD>
                  <TD>{fmtDate(t.departure_time)}</TD>
                  <TD><StatusBadge status={t.status} /></TD>
                  <TD>{t.ticket_count}</TD>
                  <TD>{t.parcel_count}</TD>
                </tr>
              ))
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

function TicketsTab({ companyId }: { companyId: number }) {
  const { data, isLoading } = useQuery<TicketItem[]>({
    queryKey: ["admin", "company-tickets", companyId],
    queryFn: () => clientFetch<TicketItem[]>(`admin/companies/${companyId}/tickets`),
    staleTime: 60_000,
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white mt-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-zinc-50 border-b border-zinc-100">
          <tr>
            <TH>ID</TH>
            <TH>Passenger</TH>
            <TH>Trip ID</TH>
            <TH>Fare</TH>
            <TH>Status</TH>
            <TH>Payment</TH>
            <TH>Created</TH>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={7} />
        ) : (
          <tbody className="divide-y divide-zinc-100">
            {(data ?? []).length === 0 ? (
              <EmptyRow cols={7} message="No tickets found." />
            ) : (
              (data ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <TD>{t.id}</TD>
                  <TD>{t.passenger_name}</TD>
                  <TD>{t.trip_id}</TD>
                  <TD>GHS {t.fare_ghs.toFixed(2)}</TD>
                  <TD><StatusBadge status={t.status} /></TD>
                  <TD><StatusBadge status={t.payment_status} /></TD>
                  <TD>{fmtDate(t.created_at)}</TD>
                </tr>
              ))
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

function ParcelsTab({ companyId }: { companyId: number }) {
  const { data, isLoading } = useQuery<ParcelItem[]>({
    queryKey: ["admin", "company-parcels", companyId],
    queryFn: () => clientFetch<ParcelItem[]>(`admin/companies/${companyId}/parcels`),
    staleTime: 60_000,
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white mt-1">
      <table className="w-full text-sm min-w-[680px]">
        <thead className="bg-zinc-50 border-b border-zinc-100">
          <tr>
            <TH>ID</TH>
            <TH>Tracking #</TH>
            <TH>Sender</TH>
            <TH>Receiver</TH>
            <TH>Status</TH>
            <TH>Fee (GHS)</TH>
            <TH>Created</TH>
          </tr>
        </thead>
        {isLoading ? (
          <TableSkeleton cols={7} />
        ) : (
          <tbody className="divide-y divide-zinc-100">
            {(data ?? []).length === 0 ? (
              <EmptyRow cols={7} message="No parcels found." />
            ) : (
              (data ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <TD>{p.id}</TD>
                  <TD>
                    <span className="font-mono text-xs">{p.tracking_number}</span>
                  </TD>
                  <TD>{p.sender_name}</TD>
                  <TD>{p.receiver_name}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD>{p.fee_ghs.toFixed(2)}</TD>
                  <TD>{fmtDate(p.created_at)}</TD>
                </tr>
              ))
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

function FeesTab({ companyId }: { companyId: number }) {
  const { data, isLoading } = useQuery<FeeSummary>({
    queryKey: ["admin", "company-fees", companyId],
    queryFn: () =>
      clientFetch<FeeSummary>(`admin/companies/${companyId}/transaction-fees`),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4 pt-1">
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Pending fees (GHS)"
          value={data ? `GHS ${data.pending_amount_ghs.toFixed(2)}` : "GHS 0.00"}
          isLoading={isLoading}
        />
        <StatCard
          label="Pending count"
          value={data?.pending_count ?? 0}
          isLoading={isLoading}
        />
        <StatCard
          label="Total charged (GHS)"
          value={data ? `GHS ${data.total_charged_ghs.toFixed(2)}` : "GHS 0.00"}
          isLoading={isLoading}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-zinc-50 border-b border-zinc-100">
            <tr>
              <TH>Invoice ID</TH>
              <TH>Period</TH>
              <TH>Amount (GHS)</TH>
              <TH>Fee count</TH>
              <TH>Status</TH>
              <TH>Paid at</TH>
            </tr>
          </thead>
          {isLoading ? (
            <TableSkeleton cols={6} />
          ) : (
            <tbody className="divide-y divide-zinc-100">
              {(data?.invoices ?? []).length === 0 ? (
                <EmptyRow cols={6} message="No invoices found." />
              ) : (
                (data?.invoices ?? []).map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-50">
                    <TD>{inv.id}</TD>
                    <TD>{inv.period_date}</TD>
                    <TD>GHS {inv.amount_ghs.toFixed(2)}</TD>
                    <TD>{inv.fee_count}</TD>
                    <TD><StatusBadge status={inv.status} /></TD>
                    <TD>{inv.paid_at ? fmtDate(inv.paid_at) : "—"}</TD>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

type Tab = "overview" | "trips" | "tickets" | "parcels" | "fees";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "trips",    label: "Trips" },
  { id: "tickets",  label: "Tickets" },
  { id: "parcels",  label: "Parcels" },
  { id: "fees",     label: "Fees" },
];

interface Props {
  companyId: number;
}

export default function CompanyActivityTabs({ companyId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-200 gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors focus:outline-none ${
              activeTab === tab.id
                ? "text-zinc-900 border-b-2 border-zinc-900 -mb-px bg-white"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab companyId={companyId} />}
      {activeTab === "trips"    && <TripsTab    companyId={companyId} />}
      {activeTab === "tickets"  && <TicketsTab  companyId={companyId} />}
      {activeTab === "parcels"  && <ParcelsTab  companyId={companyId} />}
      {activeTab === "fees"     && <FeesTab     companyId={companyId} />}
    </div>
  );
}
