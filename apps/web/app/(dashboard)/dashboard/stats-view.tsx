"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bus,
  Package,
  Ticket,
  Building2,
  TrendingUp,
  Activity,
  Clock,
  BarChart2,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { clientFetch } from "@/lib/client-api";
import type { TripResponse, TicketResponse, CompanyResponse, UserResponse } from "@/lib/definitions";
import { cn } from "@/lib/utils";

// ── KPI Card — white card with colored icon ───────────────────────────────────

interface KPICardProps {
  label: string;
  value: number | string;
  sub: string;
  trend?: number;
  icon: React.ReactNode;
  iconBg: string;
  isLoading?: boolean;
}

function KPICard({ label, value, sub, trend, icon, iconBg, isLoading }: KPICardProps) {
  return (
    <div className="bg-card rounded-2xl px-[22px] py-5 flex-1 min-w-[150px] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] flex flex-col gap-2.5">
      <div className="flex justify-between items-start">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.3px]">
          {label}
        </span>
        <div className={cn("h-9 w-9 rounded-[10px] flex items-center justify-center", iconBg)}>
          {icon}
        </div>
      </div>
      {isLoading ? (
        <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="text-[30px] font-bold text-foreground leading-none">{value}</div>
      )}
      <div className="flex items-center gap-1">
        {trend !== undefined && (
          <span className={cn("text-[12px] font-semibold", trend >= 0 ? "text-primary" : "text-destructive")}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
          </span>
        )}
        <span className="text-[12px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

// ── Daily stats chart ─────────────────────────────────────────────────────────

interface DailyStatItem {
  date: string;
  tickets_sold: number;
  parcels_created: number;
  revenue_ghs: number;
}

function DailyStatsChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "daily-stats"],
    queryFn: () => clientFetch<DailyStatItem[]>("admin/stats/daily"),
    staleTime: 5 * 60_000,
  });

  const chartData = (data ?? []).map((d) => ({
    ...d,
    date: d.date.slice(5),
  }));

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-muted" />;
  }

  return (
    <div className="rounded-2xl bg-card p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-5">
        <div className="text-[15px] font-bold text-foreground">Ticket Sales — Last 7 Days</div>
        <span className="text-[12px] font-semibold text-primary bg-[oklch(0.96_0.015_155)] px-2.5 py-1 rounded-full">
          +12% WoW
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.93 0.010 155)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.55 0.020 155)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.020 155)" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid oklch(0.90 0.010 155)" }}
            cursor={{ fill: "oklch(0.93 0.010 155)" }}
          />
          <Bar dataKey="tickets_sold" name="Tickets" fill="oklch(0.52 0.152 155)" radius={[4, 4, 2, 2]} />
          <Bar dataKey="parcels_created" name="Parcels" fill="oklch(0.77 0.110 165)" radius={[4, 4, 2, 2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Trip status donut (SVG) ───────────────────────────────────────────────────

function TripStatusDonut({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const statuses = [
    { label: "Scheduled", color: "#1D4ED8", bg: "#DBEAFE" },
    { label: "Departed",  color: "#7C3AED", bg: "#EDE9FE" },
    { label: "Arrived",   color: "#008A56", bg: "#D1FAE5" },
    { label: "Cancelled", color: "#DC2626", bg: "#FEE2E2" },
  ];

  const CIRC = 289;
  let offset = 72;
  const arcs = statuses.map((s) => {
    const pct = (counts[s.label.toLowerCase()] ?? 0) / total;
    const arc = { ...s, pct, dasharray: `${pct * CIRC} ${CIRC}`, dashoffset: offset };
    offset -= pct * CIRC;
    return arc;
  });

  return (
    <div className="rounded-2xl bg-card p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex flex-col">
      <div className="text-[15px] font-bold text-foreground mb-4">Trip Status</div>
      <div className="flex justify-center mb-4">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="46" fill="none" stroke="oklch(0.93 0.010 155)" strokeWidth="16" />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx="60" cy="60" r="46"
              fill="none"
              stroke={a.color}
              strokeWidth="16"
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="round"
            />
          ))}
          <text x="60" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill="oklch(0.115 0.025 155)" fontFamily="inherit">{total}</text>
          <text x="60" y="70" textAnchor="middle" fontSize="10" fill="oklch(0.55 0.020 155)" fontFamily="inherit">trips</text>
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        {statuses.map((s) => (
          <div key={s.label} className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[13px] text-foreground/70">{s.label}</span>
            </div>
            <span className="text-[13px] font-semibold text-foreground">
              {counts[s.label.toLowerCase()] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick info row ────────────────────────────────────────────────────────────

function InfoRow({ label, value, isLoading }: { label: string; value: string | number; isLoading?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-[14px] text-muted-foreground">{label}</span>
      {isLoading ? (
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-[14px] font-semibold text-foreground">{value}</span>
      )}
    </div>
  );
}

// ── Operational view ──────────────────────────────────────────────────────────

function OperationalStats({ isAdmin }: { userName: string; isAdmin: boolean }) {
  const tripsQuery = useQuery({
    queryKey: ["dashboard", "trips"],
    queryFn: () => clientFetch<TripResponse[]>("trips"),
  });

  const ticketsQuery = useQuery({
    queryKey: ["dashboard", "tickets"],
    queryFn: () => clientFetch<TicketResponse[]>("tickets"),
  });

  const trips = tripsQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const loading = tripsQuery.isLoading || ticketsQuery.isLoading;

  const activeTrips = trips.filter((t) => t.status === "loading" || t.status === "departed").length;
  const scheduled = trips.filter((t) => t.status === "scheduled").length;
  const arrived = trips.filter((t) => t.status === "arrived").length;
  const cancelled = trips.filter((t) => t.status === "cancelled").length;
  const loading_ = trips.filter((t) => t.status === "loading").length;
  const departed = trips.filter((t) => t.status === "departed").length;

  const today = new Date().toLocaleDateString("en-GH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="text-[24px] font-bold text-foreground">Operations Overview</div>
        <div className="text-[14px] text-muted-foreground mt-0.5">{today} · Live updates</div>
      </div>

      {/* KPI row */}
      <div className="flex gap-4 flex-wrap">
        <KPICard
          label="Total Trips"
          value={loading ? "—" : trips.length}
          sub="all time"
          icon={<Bus className="h-[18px] w-[18px] text-primary" />}
          iconBg="bg-[oklch(0.96_0.015_155)]"
          isLoading={loading}
        />
        <KPICard
          label="Active Now"
          value={loading ? "—" : activeTrips}
          sub="on road"
          trend={activeTrips > 0 ? 6 : undefined}
          icon={<Activity className="h-[18px] w-[18px] text-amber-600" />}
          iconBg="bg-amber-50"
          isLoading={loading}
        />
        <KPICard
          label="Tickets Issued"
          value={loading ? "—" : tickets.length}
          sub="across all trips"
          trend={12}
          icon={<Ticket className="h-[18px] w-[18px] text-violet-600" />}
          iconBg="bg-violet-50"
          isLoading={loading}
        />
        <KPICard
          label="Scheduled"
          value={loading ? "—" : scheduled}
          sub="upcoming"
          icon={<Clock className="h-[18px] w-[18px] text-blue-600" />}
          iconBg="bg-blue-50"
          isLoading={loading}
        />
      </div>

      {/* Charts row */}
      {isAdmin && (
        <div className="flex gap-5 flex-wrap">
          <div className="flex-[2] min-w-[260px]">
            <DailyStatsChart />
          </div>
          <div className="flex-1 min-w-[200px]">
            <TripStatusDonut
              counts={{ scheduled, loading: loading_, departed, arrived, cancelled }}
            />
          </div>
        </div>
      )}

      {/* Trip breakdown */}
      <div className="rounded-2xl bg-card p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-[15px] font-bold text-foreground">Trip Status Breakdown</span>
        </div>
        <InfoRow label="Scheduled" value={scheduled} isLoading={loading} />
        <InfoRow label="Loading" value={loading_} isLoading={loading} />
        <InfoRow label="Departed" value={departed} isLoading={loading} />
        <InfoRow label="Arrived" value={arrived} isLoading={loading} />
        <InfoRow label="Cancelled" value={cancelled} isLoading={loading} />
      </div>
    </div>
  );
}

// ── Platform config card ──────────────────────────────────────────────────────

interface PlatformConfig {
  billing_mode: "subscription" | "per_transaction";
  ticket_fee_ghs: number;
  parcel_fee_ghs: number;
}

function PlatformConfigCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PlatformConfig>({
    queryKey: ["admin", "platform-config"],
    queryFn: () => clientFetch<PlatformConfig>("admin/platform-config"),
    staleTime: 5 * 60_000,
  });

  const [mode, setMode] = useState<string | null>(null);
  const [ticketFee, setTicketFee] = useState("");
  const [parcelFee, setParcelFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    if (data && mode === null) {
      setMode(data.billing_mode);
      setTicketFee(String(data.ticket_fee_ghs));
      setParcelFee(String(data.parcel_fee_ghs));
    }
  }, [data, mode]);

  const currentMode = mode ?? data?.billing_mode ?? "subscription";
  const isPerTx = currentMode === "per_transaction";

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const body: Partial<PlatformConfig> = {
        billing_mode: currentMode as PlatformConfig["billing_mode"],
      };
      if (isPerTx) {
        body.ticket_fee_ghs = parseFloat(ticketFee);
        body.parcel_fee_ghs = parseFloat(parcelFee);
      }
      await clientFetch("admin/platform-config", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await qc.invalidateQueries({ queryKey: ["admin", "platform-config"] });
      setSaveOk(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-card p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold text-foreground">Platform Billing Config</span>
        {isLoading && <div className="h-4 w-24 animate-pulse rounded bg-muted" />}
      </div>

      {/* Billing mode toggle */}
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-muted-foreground">Billing mode:</span>
        <button
          onClick={() => setMode(isPerTx ? "subscription" : "per_transaction")}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
            isPerTx ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              isPerTx ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
        <span className="text-[13px] font-semibold text-foreground">
          {isPerTx ? "Per Transaction" : "Subscription"}
        </span>
      </div>

      {/* Fee inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-[0.3px] mb-1.5">
            Ticket fee (GHS)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={ticketFee}
            onChange={(e) => setTicketFee(e.target.value)}
            disabled={!isPerTx}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-[0.3px] mb-1.5">
            Parcel fee (GHS)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={parcelFee}
            onChange={(e) => setParcelFee(e.target.value)}
            disabled={!isPerTx}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {saveError && (
        <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}
      {saveOk && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Platform config saved successfully.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || isLoading}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? "Saving…" : "Save config"}
      </button>
    </div>
  );
}

// ── Super admin view ──────────────────────────────────────────────────────────

interface AdminStatsData {
  companies: number;
  active_trips: number;
  parcels_today: number;
  revenue_today_ghs: number;
}

function AdminStats() {
  const companiesQuery = useQuery({
    queryKey: ["dashboard", "admin", "companies"],
    queryFn: () => clientFetch<CompanyResponse[]>("admin/companies"),
  });

  const usersQuery = useQuery({
    queryKey: ["dashboard", "admin", "users"],
    queryFn: () => clientFetch<UserResponse[]>("admin/users"),
  });

  const statsQuery = useQuery({
    queryKey: ["dashboard", "admin", "stats"],
    queryFn: () => clientFetch<AdminStatsData>("admin/stats"),
    staleTime: 60_000,
  });

  const companies = companiesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const stats = statsQuery.data;
  const loading = companiesQuery.isLoading || usersQuery.isLoading || statsQuery.isLoading;
  const activeCompanies = companies.filter((c) => c.is_active).length;
  const activeUsers = users.filter((u) => u.is_active).length;

  const today = new Date().toLocaleDateString("en-GH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-[24px] font-bold text-foreground">Platform Overview</div>
        <div className="text-[14px] text-muted-foreground mt-0.5">{today} · Live updates</div>
      </div>

      <div className="flex gap-4 flex-wrap">
        <KPICard
          label="Total Companies"
          value={loading ? "—" : (stats?.companies ?? companies.length)}
          sub="registered"
          icon={<Building2 className="h-[18px] w-[18px] text-primary" />}
          iconBg="bg-[oklch(0.96_0.015_155)]"
          isLoading={loading}
        />
        <KPICard
          label="Active Trips"
          value={loading ? "—" : (stats?.active_trips ?? 0)}
          sub="on road now"
          trend={6}
          icon={<Bus className="h-[18px] w-[18px] text-amber-600" />}
          iconBg="bg-amber-50"
          isLoading={loading}
        />
        <KPICard
          label="Parcels Today"
          value={loading ? "—" : (stats?.parcels_today ?? 0)}
          sub="since midnight"
          icon={<Package className="h-[18px] w-[18px] text-violet-600" />}
          iconBg="bg-violet-50"
          isLoading={loading}
        />
        <KPICard
          label="Revenue Today"
          value={loading ? "—" : `GHS ${(stats?.revenue_today_ghs ?? 0).toFixed(0)}`}
          sub="parcel fees"
          trend={8}
          icon={<TrendingUp className="h-[18px] w-[18px] text-blue-600" />}
          iconBg="bg-blue-50"
          isLoading={loading}
        />
      </div>

      <div className="rounded-2xl bg-card p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-[15px] font-bold text-foreground">Platform Summary</span>
        </div>
        <InfoRow label="Companies registered" value={stats?.companies ?? companies.length} isLoading={loading} />
        <InfoRow label="Active companies" value={activeCompanies} isLoading={loading} />
        <InfoRow label="Total platform users" value={users.length} isLoading={loading} />
        <InfoRow label="Active users" value={activeUsers} isLoading={loading} />
        <InfoRow label="Active trips now" value={stats?.active_trips ?? 0} isLoading={loading} />
        <InfoRow label="Parcels logged today" value={stats?.parcels_today ?? 0} isLoading={loading} />
      </div>

      <PlatformConfigCard />
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

interface DashboardStatsViewProps {
  role: string;
  userName: string;
}

export function DashboardStatsView({ role, userName }: DashboardStatsViewProps) {
  if (role === "super_admin") {
    return <AdminStats />;
  }
  return <OperationalStats userName={userName} isAdmin={role === "company_admin"} />;
}
