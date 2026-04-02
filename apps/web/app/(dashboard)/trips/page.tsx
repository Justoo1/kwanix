import type { Metadata } from "next"
import Link from "next/link"
import { Bus, ChevronRight, Clock, CheckCircle2 } from "lucide-react"

import { apiFetch } from "@/lib/api"
import { getSession } from "@/lib/session"
import type { TripResponse } from "@/lib/definitions"
import ScheduleTripModal from "./schedule-trip-modal"

export const metadata: Metadata = { title: "Trips — RoutePass" }

// ── Status configuration ───────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; pill: string; border: string }
> = {
  scheduled: {
    label: "Scheduled",
    pill: "bg-zinc-100 text-zinc-700 border border-zinc-200",
    border: "border-l-zinc-300",
  },
  loading: {
    label: "Loading",
    pill: "bg-amber-100 text-amber-800 border border-amber-200",
    border: "border-l-amber-400",
  },
  departed: {
    label: "Departed",
    pill: "bg-blue-100 text-blue-800 border border-blue-200",
    border: "border-l-blue-400",
  },
  arrived: {
    label: "Arrived",
    pill: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    border: "border-l-emerald-400",
  },
  cancelled: {
    label: "Cancelled",
    pill: "bg-red-50 text-red-700 border border-red-200",
    border: "border-l-red-300",
  },
}

/** Active statuses shown in the top section */
const ACTIVE_STATUSES = new Set(["scheduled", "loading", "departed"])
/** Terminal statuses shown in the history section */
const HISTORY_STATUSES = new Set(["arrived", "cancelled"])

const MANAGER_ROLES = ["station_manager", "company_admin", "super_admin"]

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const session = await getSession()
  const canCreate = MANAGER_ROLES.includes(session?.user.role ?? "")

  const qs = status ? `?status=${encodeURIComponent(status)}` : ""
  const trips = await apiFetch<TripResponse[]>(`/api/v1/trips${qs}`).catch(
    () => [] as TripResponse[]
  )

  const activeTrips = trips.filter((t) => ACTIVE_STATUSES.has(t.status))
  const historyTrips = trips.filter((t) => HISTORY_STATUSES.has(t.status))

  const statuses = ["scheduled", "loading", "departed", "arrived", "cancelled"]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Trips</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Schedule and track transport operations
          </p>
        </div>
        {canCreate && <ScheduleTripModal />}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <FilterTab href="/trips" label="All" active={!status} />
        {statuses.map((s) => {
          const meta = STATUS_META[s]
          return (
            <FilterTab
              key={s}
              href={`/trips?status=${s}`}
              label={meta?.label ?? s}
              active={status === s}
            />
          )
        })}
      </div>

      {trips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* ── Active / Boarding section ──────────────────────────────── */}
          {activeTrips.length > 0 && (
            <section>
              <SectionHeading
                icon={<Clock className="size-4 text-amber-500" />}
                title="Active & Boarding"
                count={activeTrips.length}
              />
              <TripList trips={activeTrips} />
            </section>
          )}

          {/* ── Completed / History section ────────────────────────────── */}
          {historyTrips.length > 0 && (
            <section>
              <SectionHeading
                icon={<CheckCircle2 className="size-4 text-zinc-400" />}
                title="Completed & History"
                count={historyTrips.length}
                muted
              />
              <TripList trips={historyTrips} muted />
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FilterTab({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
      }`}
    >
      {label}
    </Link>
  )
}

function SectionHeading({
  icon,
  title,
  count,
  muted = false,
}: {
  icon: React.ReactNode
  title: string
  count: number
  muted?: boolean
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2
        className={`text-sm font-semibold uppercase tracking-wide ${
          muted ? "text-zinc-400" : "text-zinc-700"
        }`}
      >
        {title}
      </h2>
      <span className="text-xs text-zinc-400 font-normal">({count})</span>
    </div>
  )
}

function TripList({
  trips,
  muted = false,
}: {
  trips: TripResponse[]
  muted?: boolean
}) {
  return (
    <div
      className={`rounded-xl border divide-y overflow-hidden shadow-sm ${
        muted
          ? "border-zinc-100 divide-zinc-100 bg-zinc-50/50"
          : "border-zinc-200 divide-zinc-100 bg-white"
      }`}
    >
      {trips.map((trip) => (
        <TripRow key={trip.id} trip={trip} muted={muted} />
      ))}
    </div>
  )
}

function TripRow({ trip, muted }: { trip: TripResponse; muted: boolean }) {
  const meta = STATUS_META[trip.status]
  return (
    <Link
      href={`/trips/${trip.id}`}
      className={`flex items-center gap-4 px-5 py-4 transition-colors border-l-[3px] group ${
        muted ? "hover:bg-zinc-100/60" : "hover:bg-zinc-50"
      } ${meta?.border ?? "border-l-zinc-300"}`}
    >
      {/* Icon */}
      <div
        className={`rounded-lg p-2.5 shrink-0 ${
          muted
            ? "bg-zinc-100"
            : "bg-zinc-100 group-hover:bg-zinc-200 transition-colors"
        }`}
      >
        <Bus className={`size-4 ${muted ? "text-zinc-400" : "text-zinc-600"}`} />
      </div>

      {/* Route info */}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold truncate ${
            muted ? "text-zinc-500" : "text-zinc-900"
          }`}
        >
          {trip.departure_station_name}{" "}
          <span className="text-zinc-400 font-normal">→</span>{" "}
          {trip.destination_station_name}
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {trip.vehicle_plate}
          {trip.vehicle_capacity ? ` · ${trip.vehicle_capacity} seats` : ""}
          {" · "}
          {new Date(trip.departure_time).toLocaleString("en-GH", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>

      {/* Parcel count — hidden on mobile */}
      <div className="hidden sm:block text-xs text-zinc-400 shrink-0">
        {trip.parcel_count} parcel{trip.parcel_count !== 1 ? "s" : ""}
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 shrink-0">
        {trip.booking_open && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
            Booking open
          </span>
        )}
        <span
          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
            meta?.pill ?? "bg-zinc-100 text-zinc-600 border border-zinc-200"
          }`}
        >
          {meta?.label ?? trip.status}
        </span>
        <ChevronRight className="size-4 text-zinc-300 group-hover:text-zinc-500 transition-colors" />
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="bg-zinc-100 rounded-full p-5 mb-4">
        <Bus className="size-8 text-zinc-400" />
      </div>
      <p className="text-sm font-medium text-zinc-600">No trips found</p>
      <p className="text-xs text-zinc-400 mt-1">
        Schedule a new trip or adjust your filters.
      </p>
    </div>
  )
}
