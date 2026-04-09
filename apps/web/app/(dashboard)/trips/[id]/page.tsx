import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Bus,
  Package,
  Users,
  Monitor,
  ShoppingBag,
  CalendarDays,
  DollarSign,
  CheckCircle2,
  Clock,
} from "lucide-react"

import { apiFetch } from "@/lib/api"
import { getSession } from "@/lib/session"
import type { TicketResponse } from "@/lib/definitions"
import StatusForm from "./status-form"
import BookingToggle from "./booking-toggle"
import ManifestDownloadButton from "./manifest-download-button"
import ManifestCsvButton from "./manifest-csv-button"
import BulkCancelButton from "./bulk-cancel-button"

interface TripRevenue {
  total_revenue_ghs: number
  ticket_count: number
  avg_fare_ghs: number
  paid_count: number
  pending_count: number
}

interface TripStop {
  id: number
  station_id: number
  sequence_order: number
  eta: string | null
  station_name: string | null
}

interface TripDetail {
  id: number
  status: string
  vehicle_id: number
  vehicle_plate: string | null
  vehicle_capacity: number | null
  departure_station_name: string | null
  destination_station_name: string | null
  departure_time: string
  parcel_count: number
  booking_open: boolean
  price_ticket_base: number | null
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { pill: string; border: string }> = {
  scheduled: {
    pill: "bg-zinc-100 text-zinc-700 border border-zinc-200",
    border: "border-zinc-200",
  },
  loading: {
    pill: "bg-amber-100 text-amber-800 border border-amber-200",
    border: "border-amber-200",
  },
  departed: {
    pill: "bg-blue-100 text-blue-800 border border-blue-200",
    border: "border-blue-200",
  },
  arrived: {
    pill: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    border: "border-emerald-200",
  },
  cancelled: {
    pill: "bg-red-50 text-red-700 border border-red-200",
    border: "border-red-200",
  },
}

const MANAGER_ROLES = ["station_manager", "company_admin", "super_admin"]

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()

  const [trip, tickets, revenue, stops] = await Promise.all([
    apiFetch<TripDetail>(`/api/v1/trips/${id}`).catch(() => null),
    apiFetch<TicketResponse[]>(`/api/v1/tickets?trip_id=${id}`).catch(
      () => [] as TicketResponse[]
    ),
    apiFetch<TripRevenue>(`/api/v1/trips/${id}/revenue`).catch(() => null),
    apiFetch<TripStop[]>(`/api/v1/trips/${id}/stops`).catch(() => [] as TripStop[]),
  ])

  if (!trip) notFound()

  const canManage = MANAGER_ROLES.includes(session?.user.role ?? "")
  const meta = STATUS_META[trip.status]

  const onlineCount = tickets.filter((t) => t.source === "online").length
  const counterCount = tickets.filter(
    (t) => !t.source || t.source === "counter"
  ).length
  const occupancyPct =
    trip.vehicle_capacity && trip.vehicle_capacity > 0
      ? Math.round((tickets.length / trip.vehicle_capacity) * 100)
      : null

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/trips"
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900">Trip #{trip.id}</h1>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                  meta?.pill ?? "bg-zinc-100 text-zinc-600 border border-zinc-200"
                }`}
              >
                {trip.status}
              </span>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">
              {trip.departure_station_name} → {trip.destination_station_name}
            </p>
          </div>
        </div>

        {/* Manifest downloads */}
        <div className="flex items-center gap-2">
          <ManifestDownloadButton tripId={trip.id} />
          <ManifestCsvButton tripId={trip.id} />
        </div>
      </div>

      {/* ── Route + vehicle info card ───────────────────────────────────── */}
      <div
        className={`bg-white rounded-xl border p-6 space-y-5 ${
          meta?.border ?? "border-zinc-200"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className="bg-zinc-100 rounded-xl p-3">
            <Bus className="size-6 text-zinc-600" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-lg leading-tight">
              {trip.departure_station_name}{" "}
              <span className="text-zinc-400 font-normal">→</span>{" "}
              {trip.destination_station_name}
            </p>
            <p className="text-sm text-zinc-500 mt-0.5 flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" />
              {new Date(trip.departure_time).toLocaleString("en-GH", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {trip.vehicle_plate}
              {trip.vehicle_capacity
                ? ` · ${trip.vehicle_capacity}-seat vehicle`
                : ""}
            </p>
          </div>
        </div>

        {/* ── Summary stats grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-zinc-100">
          <StatCard
            icon={<Users className="size-4 text-blue-500" />}
            label="Passengers"
            value={tickets.length}
            sub={
              trip.vehicle_capacity
                ? `${occupancyPct}% capacity`
                : undefined
            }
          />
          <StatCard
            icon={<Monitor className="size-4 text-violet-500" />}
            label="Online booked"
            value={onlineCount}
          />
          <StatCard
            icon={<ShoppingBag className="size-4 text-zinc-500" />}
            label="Counter issued"
            value={counterCount}
          />
          <StatCard
            icon={<Package className="size-4 text-amber-500" />}
            label="Parcels"
            value={trip.parcel_count}
          />
        </div>

        {/* Revenue card */}
        {revenue && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="size-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Revenue Summary</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-emerald-600 mb-0.5">Total</p>
                <p className="text-xl font-bold text-emerald-900">
                  GHS {revenue.total_revenue_ghs.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-600 mb-0.5">Avg fare</p>
                <p className="text-xl font-bold text-emerald-900">
                  GHS {revenue.avg_fare_ghs.toFixed(2)}
                </p>
              </div>
              <div className="flex items-start gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-emerald-600 mb-0.5">Paid</p>
                  <p className="text-xl font-bold text-emerald-900">{revenue.paid_count}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Clock className="size-3.5 text-amber-500 mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Pending</p>
                  <p className="text-xl font-bold text-zinc-700">{revenue.pending_count}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Online booking toggle — managers only ───────────────────────── */}
      {canManage && (
        <BookingToggle
          tripId={trip.id}
          bookingOpen={trip.booking_open}
          baseFare={trip.price_ticket_base}
        />
      )}

      {/* ── Status update — managers only ─────────────────────────────── */}
      {canManage && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <h2 className="text-base font-medium text-zinc-800 mb-4">
            Update status
          </h2>
          <StatusForm tripId={trip.id} currentStatus={trip.status} />
        </div>
      )}

      {/* ── Trip stops ─────────────────────────────────────────────────── */}
      {canManage && (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100">
            <h2 className="text-base font-medium text-zinc-800">
              Route Stops
              <span className="ml-2 text-sm font-normal text-zinc-400">
                ({stops.length})
              </span>
            </h2>
          </div>
          {stops.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-zinc-400">No intermediate stops defined.</p>
            </div>
          ) : (
            <ol className="divide-y divide-zinc-100">
              {stops.map((stop) => (
                <li key={stop.id} className="flex items-center gap-4 px-6 py-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {stop.sequence_order}
                  </span>
                  <span className="flex-1 text-sm font-medium text-zinc-800">
                    {stop.station_name ?? `Station #${stop.station_id}`}
                  </span>
                  {stop.eta && (
                    <span className="text-xs text-zinc-400">
                      ETA {new Date(stop.eta).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ── Ticket list ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-zinc-800">
            Tickets
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({tickets.length})
            </span>
          </h2>
          {canManage && (
            <BulkCancelButton
              ticketIds={tickets
                .filter((t) => t.status !== "cancelled")
                .map((t) => t.id)}
            />
          )}
        </div>

        {tickets.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users className="size-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">No tickets issued yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Seat</th>
                  <th className="px-6 py-3 text-left font-medium">Passenger</th>
                  <th className="px-6 py-3 text-left font-medium">Phone</th>
                  <th className="px-6 py-3 text-left font-medium">Fare</th>
                  <th className="px-6 py-3 text-left font-medium">Source</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-zinc-700">
                      {t.seat_number}
                    </td>
                    <td className="px-6 py-4 font-medium text-zinc-900">
                      {t.passenger_name}
                    </td>
                    <td className="px-6 py-4 text-zinc-500">
                      {t.passenger_phone}
                    </td>
                    <td className="px-6 py-4 text-zinc-700">
                      GHS {Number(t.fare_ghs).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.source === "online"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {t.source ?? "counter"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        {t.status}
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
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  )
}
