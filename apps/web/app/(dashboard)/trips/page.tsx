import type { Metadata } from "next"
import Link from "next/link"
import { Bus, ChevronRight } from "lucide-react"

import { apiFetch } from "@/lib/api"
import { getSession } from "@/lib/session"
import type { TripResponse } from "@/lib/definitions"
import ScheduleTripModal from "./schedule-trip-modal"
import RecurringScheduleModal from "./recurring-schedule-modal"

export const metadata: Metadata = { title: "Trips — Kwanix" }

const STATUS_META: Record<string, { label: string; pill: string; accent: string }> = {
  scheduled: {
    label: "Scheduled",
    pill: "bg-zinc-100 text-zinc-700",
    accent: "#94a3b8",
  },
  loading: {
    label: "Loading",
    pill: "bg-amber-100 text-amber-800",
    accent: "#f59e0b",
  },
  departed: {
    label: "Departed",
    pill: "bg-blue-100 text-blue-800",
    accent: "#3b82f6",
  },
  arrived: {
    label: "Arrived",
    pill: "bg-emerald-100 text-emerald-800",
    accent: "#008A56",
  },
  cancelled: {
    label: "Cancelled",
    pill: "bg-red-50 text-red-700",
    accent: "#ef4444",
  },
}

const MANAGER_ROLES = ["station_manager", "company_admin", "super_admin"]
const TAB_STATUSES = ["scheduled", "loading", "departed", "arrived", "cancelled"]

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const session = await getSession()
  const canCreate = MANAGER_ROLES.includes(session?.user.role ?? "")

  const qs = status ? `?status=${encodeURIComponent(status)}` : ""
  const trips = await apiFetch<TripResponse[]>(`/api/v1/trips${qs}`).catch(() => [] as TripResponse[])

  // KPI counts from full list (only meaningful when not filtered)
  const allTrips = status
    ? await apiFetch<TripResponse[]>("/api/v1/trips").catch(() => [] as TripResponse[])
    : trips

  const kpiCounts = {
    total: allTrips.length,
    scheduled: allTrips.filter((t) => t.status === "scheduled").length,
    departed: allTrips.filter((t) => t.status === "departed").length,
    arrived: allTrips.filter((t) => t.status === "arrived").length,
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Trips</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Schedule and track transport operations</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <RecurringScheduleModal />
            <ScheduleTripModal />
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <KpiCard label="Total" value={kpiCounts.total} color="#64748b" />
        <KpiCard label="Scheduled" value={kpiCounts.scheduled} color="#f59e0b" />
        <KpiCard label="Departed" value={kpiCounts.departed} color="#3b82f6" />
        <KpiCard label="Arrived" value={kpiCounts.arrived} color="#008A56" />
      </div>

      {/* Tab strip */}
      <div className="flex gap-1.5 flex-wrap">
        <TabLink href="/trips" label="All" active={!status} />
        {TAB_STATUSES.map((s) => (
          <TabLink
            key={s}
            href={`/trips?status=${s}`}
            label={STATUS_META[s]?.label ?? s}
            active={status === s}
          />
        ))}
      </div>

      {/* Trip list */}
      {trips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          {trips.map((trip, i) => (
            <TripRow key={trip.id} trip={trip} last={i === trips.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="text-[28px] font-bold leading-none" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-primary text-white"
          : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
      }`}
    >
      {label}
    </Link>
  )
}

function TripRow({ trip, last }: { trip: TripResponse; last: boolean }) {
  const meta = STATUS_META[trip.status]
  return (
    <Link
      href={`/trips/${trip.id}`}
      className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group ${
        !last ? "border-b border-border" : ""
      }`}
      style={{ borderLeft: `3px solid ${meta?.accent ?? "#94a3b8"}` }}
    >
      {/* Icon */}
      <div className="rounded-xl p-2.5 bg-primary/10 shrink-0">
        <Bus className="h-4 w-4 text-primary" />
      </div>

      {/* Route info */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground truncate">
          {trip.departure_station_name}{" "}
          <span className="text-muted-foreground font-normal">→</span>{" "}
          {trip.destination_station_name}
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          <span className="font-medium text-foreground/70">{trip.vehicle_plate}</span>
          {trip.vehicle_capacity
            ? ` · ${trip.tickets_sold ?? 0}/${trip.vehicle_capacity} seats`
            : ""}
          {" · "}
          {new Date(trip.departure_time).toLocaleString("en-GH", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>

      {/* Parcel count */}
      <div className="hidden sm:block text-[12px] text-muted-foreground shrink-0">
        {trip.parcel_count ?? 0} parcel{(trip.parcel_count ?? 0) !== 1 ? "s" : ""}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 shrink-0">
        {trip.is_near_full && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">
            Near full
          </span>
        )}
        {trip.booking_open && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
            Booking open
          </span>
        )}
        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${meta?.pill ?? "bg-zinc-100 text-zinc-600"}`}>
          {meta?.label ?? trip.status}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl p-5 bg-primary/10 mb-4">
        <Bus className="h-8 w-8 text-primary" />
      </div>
      <p className="text-[14px] font-semibold text-foreground/70">No trips found</p>
      <p className="text-[12px] text-muted-foreground mt-1">Schedule a new trip or adjust your filters.</p>
    </div>
  )
}
