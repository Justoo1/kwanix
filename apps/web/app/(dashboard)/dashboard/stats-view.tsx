"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bus,
  Package,
  Ticket,
  Building2,
  TrendingUp,
  Activity,
  Layers,
  BarChart2,
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

// ── Gradient stat card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  isLoading?: boolean;
}

function StatCard({ label, value, sub, icon, gradient, isLoading }: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg ${gradient}`}
    >
      {/* Background decoration */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute -bottom-6 -right-2 h-16 w-16 rounded-full bg-white/5" />

      <div className="relative">
        <div className="mb-4 inline-flex rounded-xl bg-white/20 p-2.5">
          {icon}
        </div>
        {isLoading ? (
          <>
            <div className="mb-2 h-9 w-24 animate-pulse rounded-lg bg-white/30" />
            <div className="h-3.5 w-32 animate-pulse rounded bg-white/20" />
          </>
        ) : (
          <>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-sm font-medium text-white/80">{label}</p>
            {sub && (
              <p className="mt-1.5 text-xs text-white/60">{sub}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Quick-info row ────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string | number;
  isLoading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {isLoading ? (
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-sm font-semibold">{value}</span>
      )}
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
    date: d.date.slice(5), // MM-DD
  }));

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">7-Day Activity</h2>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          <Bar dataKey="tickets_sold" name="Tickets" fill="#6366f1" radius={[3, 3, 0, 0]} />
          <Bar dataKey="parcels_created" name="Parcels" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Operational view (company_admin / station roles) ─────────────────────────

function OperationalStats({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
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

  const activeTrips = trips.filter(
    (t) => t.status === "loading" || t.status === "departed"
  ).length;
  const scheduled = trips.filter((t) => t.status === "scheduled").length;
  const arrived = trips.filter((t) => t.status === "arrived").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Overview
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Welcome back, {userName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening across your transit operations today.
        </p>
      </div>

      {/* Gradient stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Trips"
          value={trips.length}
          sub="All time in system"
          icon={<Bus className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
          isLoading={loading}
        />
        <StatCard
          label="Active Now"
          value={activeTrips}
          sub="Loading or in transit"
          icon={<Activity className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-amber-400 to-orange-500"
          isLoading={loading}
        />
        <StatCard
          label="Scheduled"
          value={scheduled}
          sub="Upcoming departures"
          icon={<TrendingUp className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-emerald-400 to-teal-600"
          isLoading={loading}
        />
        <StatCard
          label="Tickets Issued"
          value={tickets.length}
          sub="Across all trips"
          icon={<Ticket className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-violet-500 to-purple-700"
          isLoading={loading}
        />
      </div>

      {/* Trip breakdown card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Trip Status Breakdown</h2>
        </div>
        <div className="divide-y divide-border">
          <InfoRow label="Scheduled" value={scheduled} isLoading={loading} />
          <InfoRow label="Loading" value={trips.filter((t) => t.status === "loading").length} isLoading={loading} />
          <InfoRow label="Departed" value={trips.filter((t) => t.status === "departed").length} isLoading={loading} />
          <InfoRow label="Arrived" value={arrived} isLoading={loading} />
          <InfoRow label="Cancelled" value={trips.filter((t) => t.status === "cancelled").length} isLoading={loading} />
        </div>
      </div>

      {/* 7-day sparkline — company_admin only */}
      {isAdmin && <DailyStatsChart />}
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

function AdminStats({ userName }: { userName: string }) {
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

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Platform Overview
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Welcome back, {userName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global platform metrics across all tenants.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Companies"
          value={stats?.companies ?? companies.length}
          icon={<Building2 className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
          isLoading={loading}
        />
        <StatCard
          label="Active Trips"
          value={stats?.active_trips ?? 0}
          sub="Loading or in transit"
          icon={<Bus className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-amber-400 to-orange-500"
          isLoading={loading}
        />
        <StatCard
          label="Parcels Today"
          value={stats?.parcels_today ?? 0}
          sub="Logged since midnight"
          icon={<Package className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-emerald-400 to-teal-600"
          isLoading={loading}
        />
        <StatCard
          label="Revenue Today"
          value={`GHS ${(stats?.revenue_today_ghs ?? 0).toFixed(2)}`}
          sub="Parcel fees collected"
          icon={<TrendingUp className="h-5 w-5 text-white" />}
          gradient="bg-gradient-to-br from-violet-500 to-purple-700"
          isLoading={loading}
        />
      </div>

      {/* Platform summary card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Platform Summary</h2>
        </div>
        <div className="divide-y divide-border">
          <InfoRow label="Companies registered" value={stats?.companies ?? companies.length} isLoading={loading} />
          <InfoRow label="Active companies" value={activeCompanies} isLoading={loading} />
          <InfoRow label="Total platform users" value={users.length} isLoading={loading} />
          <InfoRow label="Active users" value={activeUsers} isLoading={loading} />
          <InfoRow label="Active trips now" value={stats?.active_trips ?? 0} isLoading={loading} />
          <InfoRow label="Parcels logged today" value={stats?.parcels_today ?? 0} isLoading={loading} />
        </div>
      </div>
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
    return <AdminStats userName={userName} />;
  }
  return <OperationalStats userName={userName} isAdmin={role === "company_admin"} />;
}
