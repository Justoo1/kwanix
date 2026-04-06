"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, FileText, Download, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParcels } from "@/hooks/use-parcels";
import { clientFetch } from "@/lib/client-api";
import type { ParcelStatus, UserRole } from "@/lib/definitions";
import ParcelTable from "./parcel-table";
import ParcelSummary from "./parcel-summary";
import ParcelFilters, { type FilterState, type DateRange } from "./parcel-filters";
import ParcelReport from "./parcel-report";
import CreateParcelModal from "./create-parcel-modal";

interface Station {
  id: number;
  name: string;
  location_code: string | null;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  dateRange: "all",
};

const PAGE_LIMIT = 50;

function startOf(range: DateRange): string | null {
  const d = new Date();
  if (range === "today") {
    return d.toISOString().split("T")[0];
  }
  if (range === "week") {
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  }
  if (range === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  return null; // "all"
}

interface StationParcelCounts {
  pending: number;
  in_transit: number;
  arrived: number;
  picked_up: number;
  returned: number;
}

export default function ParcelsClient({
  stations,
  userRole,
  stationId,
}: {
  stations: Station[];
  userRole: UserRole;
  stationId: number | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: stationSummary } = useQuery<StationParcelCounts>({
    queryKey: ["station-parcel-summary", stationId],
    queryFn: () => clientFetch<StationParcelCounts>(`stations/${stationId}/parcel-summary`),
    enabled: stationId != null,
    staleTime: 60_000,
  });

  const apiStatus = filters.status === "all" ? undefined : (filters.status as ParcelStatus);

  const { data: parcels = [], isLoading, isError } = useParcels({
    q: debouncedQ || undefined,
    status: apiStatus,
    limit: PAGE_LIMIT,
    offset,
  });

  // Client-side date range filter (backend doesn't expose created_after param)
  const filtered = useMemo(() => {
    const rangeStart = startOf(filters.dateRange);
    if (!rangeStart) return parcels;
    return parcels.filter((p) =>
      p.created_at ? p.created_at.split("T")[0] >= rangeStart : true
    );
  }, [parcels, filters.dateRange]);

  const pendingQueue = useMemo(
    () => filtered.filter((p) => p.status === "pending"),
    [filtered]
  );

  function handleFiltersChange(next: FilterState) {
    const prev = filters;
    setFilters(next);

    // Status or dateRange changed: reset pagination immediately
    if (next.status !== prev.status || next.dateRange !== prev.dateRange) {
      setOffset(0);
    }

    // Debounce search changes
    if (next.search !== prev.search) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedQ(next.search);
        setOffset(0);
      }, 350);
    }
  }

  const hasPrev = offset > 0;
  const hasNext = parcels.length === PAGE_LIMIT;

  const canExport =
    userRole === "station_manager" ||
    userRole === "company_admin" ||
    userRole === "super_admin";

  const canSeeOverdue =
    userRole === "station_manager" ||
    userRole === "company_admin" ||
    userRole === "super_admin";

  const { data: overdueParcels } = useQuery<{ id: number }[]>({
    queryKey: ["parcels-overdue"],
    queryFn: () => clientFetch<{ id: number }[]>("parcels/overdue"),
    enabled: canSeeOverdue,
    staleTime: 5 * 60_000,
  });

  async function handleExportCsv() {
    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (debouncedQ) params.set("q", debouncedQ);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const resp = await fetch(`/api/proxy/parcels/export${qs}`, {
      credentials: "include",
    });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parcels.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Overdue parcels alert — shown to station_manager+ when uncollected arrivals exceed 3 days */}
      {overdueParcels && overdueParcels.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <span className="font-semibold">{overdueParcels.length} parcel{overdueParcels.length !== 1 ? "s" : ""}</span>
            {" "}arrived more than 3 days ago and ha{overdueParcels.length !== 1 ? "ve" : "s"} not been collected.{" "}
            <button
              onClick={() => handleFiltersChange({ ...filters, status: "arrived" })}
              className="underline font-medium hover:text-amber-900 transition-colors"
            >
              Filter to arrived
            </button>
          </span>
        </div>
      )}

      {/* Station-level summary chips — only shown when user has an assigned station */}
      {stationSummary && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-zinc-600">At your station:</span>
          {stationSummary.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-0.5 text-amber-800 font-medium">
              {stationSummary.pending} pending
            </span>
          )}
          {stationSummary.in_transit > 0 && (
            <span className="rounded-full bg-blue-100 px-3 py-0.5 text-blue-800 font-medium">
              {stationSummary.in_transit} in transit
            </span>
          )}
          {stationSummary.arrived > 0 && (
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-emerald-800 font-medium">
              {stationSummary.arrived} arrived
            </span>
          )}
          {stationSummary.picked_up > 0 && (
            <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-zinc-700 font-medium">
              {stationSummary.picked_up} picked up
            </span>
          )}
          {stationSummary.pending === 0 &&
            stationSummary.in_transit === 0 &&
            stationSummary.arrived === 0 &&
            stationSummary.picked_up === 0 && (
              <span className="text-zinc-400">No active parcels</span>
            )}
        </div>
      )}

      {/* Summary cards */}
      <ParcelSummary parcels={filtered} />

      {/* Pending queue — operational, always visible when non-empty */}
      {pendingQueue.length > 0 && (filters.status === "all" || filters.status === "pending") && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-zinc-700">
              Pending Queue ({pendingQueue.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingQueue.map((p) => (
              <div
                key={p.id}
                className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3"
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-amber-900 truncate">
                    {p.tracking_number}
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5 truncate">
                    {p.sender_name} → {p.receiver_name}
                  </p>
                  <p className="text-xs text-amber-600 truncate">
                    To: {p.destination_station_name ?? `Station ${p.destination_station_id}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Table section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-800">Parcel Log</h2>
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
            <button
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Report
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Log Parcel
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4">
          <ParcelFilters
            filters={filters}
            onChange={handleFiltersChange}
            totalCount={parcels.length}
            filteredCount={filtered.length}
          />
        </div>

        <ParcelTable data={filtered} isLoading={isLoading} isError={isError} userRole={userRole} />

        {/* Pagination */}
        {(hasPrev || hasNext) && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <button
              disabled={!hasPrev}
              onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <span className="text-zinc-500">
              Showing {offset + 1}–{offset + parcels.length}
            </span>
            <button
              disabled={!hasNext}
              onClick={() => setOffset(offset + PAGE_LIMIT)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </section>

      <CreateParcelModal
        stations={stations}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {reportOpen && (
        <ParcelReport parcels={filtered} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}
