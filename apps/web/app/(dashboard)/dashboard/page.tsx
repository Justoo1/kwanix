import type { Metadata } from "next";
import { Package, Bus, Ticket, AlertCircle, Building2, Users } from "lucide-react";

import { getSession } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import type { TripResponse, TicketResponse, CompanyResponse, UserResponse } from "@/lib/definitions";

export const metadata: Metadata = { title: "Dashboard — RoutePass" };

async function fetchOperationalStats() {
  try {
    const [trips, tickets] = await Promise.all([
      apiFetch<TripResponse[]>("/api/v1/trips"),
      apiFetch<TicketResponse[]>("/api/v1/tickets").catch(() => [] as TicketResponse[]),
    ]);
    return {
      totalTrips: trips.length,
      loadingTrips: trips.filter((t) => t.status === "loading").length,
      scheduledTrips: trips.filter((t) => t.status === "scheduled").length,
      todayTickets: tickets.length,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    return { totalTrips: 0, loadingTrips: 0, scheduledTrips: 0, todayTickets: 0 };
  }
}

async function fetchAdminStats() {
  try {
    const [companies, users] = await Promise.all([
      apiFetch<CompanyResponse[]>("/api/v1/admin/companies"),
      apiFetch<UserResponse[]>("/api/v1/admin/users"),
    ]);
    const activeCompanies = companies.filter((c) => c.is_active).length;
    const activeUsers = users.filter((u) => u.is_active).length;
    return { totalCompanies: companies.length, activeCompanies, totalUsers: users.length, activeUsers };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    return { totalCompanies: 0, activeCompanies: 0, totalUsers: 0, activeUsers: 0 };
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  const role = session?.user.role;

  if (role === "super_admin") {
    const stats = await fetchAdminStats();
    if (!stats) {
      return (
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span>Could not load dashboard data.</span>
        </div>
      );
    }
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Platform Overview</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Welcome back, {session?.user.full_name}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Companies"
            value={stats.totalCompanies}
            icon={<Building2 className="h-5 w-5 text-blue-500" />}
            bg="bg-blue-50"
          />
          <StatCard
            label="Active Companies"
            value={stats.activeCompanies}
            icon={<Building2 className="h-5 w-5 text-emerald-500" />}
            bg="bg-emerald-50"
          />
          <StatCard
            label="Total Users"
            value={stats.totalUsers}
            icon={<Users className="h-5 w-5 text-amber-500" />}
            bg="bg-amber-50"
          />
          <StatCard
            label="Active Users"
            value={stats.activeUsers}
            icon={<Users className="h-5 w-5 text-purple-500" />}
            bg="bg-purple-50"
          />
        </div>
      </div>
    );
  }

  const stats = await fetchOperationalStats();
  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="h-5 w-5" />
        <span>Could not load dashboard data.</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Welcome back, {session?.user.full_name}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Trips"
          value={stats.totalTrips}
          icon={<Bus className="h-5 w-5 text-blue-500" />}
          bg="bg-blue-50"
        />
        <StatCard
          label="Loading Now"
          value={stats.loadingTrips}
          icon={<Bus className="h-5 w-5 text-amber-500" />}
          bg="bg-amber-50"
        />
        <StatCard
          label="Scheduled"
          value={stats.scheduledTrips}
          icon={<Package className="h-5 w-5 text-emerald-500" />}
          bg="bg-emerald-50"
        />
        <StatCard
          label="Tickets Issued"
          value={stats.todayTickets}
          icon={<Ticket className="h-5 w-5 text-purple-500" />}
          bg="bg-purple-50"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`${bg} rounded-lg p-3`}>{icon}</div>
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-2xl font-bold text-zinc-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
