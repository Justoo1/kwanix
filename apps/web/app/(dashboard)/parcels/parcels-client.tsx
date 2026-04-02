"use client";

import { useMemo, useState } from "react";
import { Plus, FileText } from "lucide-react";
import { useParcels } from "@/hooks/use-parcels";
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

export default function ParcelsClient({ stations }: { stations: Station[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const { data: allParcels = [], isLoading, isError } = useParcels();

  // Pending queue always shows all pending regardless of active filters
  const pendingQueue = useMemo(
    () => allParcels.filter((p) => p.status === "pending"),
    [allParcels]
  );

  // Apply filters for the table and summary
  const filtered = useMemo(() => {
    const rangeStart = startOf(filters.dateRange);
    const q = filters.search.toLowerCase().trim();

    return allParcels.filter((p) => {
      // Status
      if (filters.status !== "all" && p.status !== filters.status) return false;

      // Date range
      if (rangeStart && p.created_at) {
        const d = p.created_at.split("T")[0];
        if (d < rangeStart) return false;
      }

      // Search
      if (q) {
        const haystack = [
          p.tracking_number,
          p.sender_name,
          p.receiver_name,
          p.receiver_phone,
          p.origin_station_name ?? "",
          p.destination_station_name ?? "",
          p.description ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [allParcels, filters]);

  return (
    <div className="space-y-6">
      {/* Summary cards — derived from ALL parcels (unfiltered) */}
      <ParcelSummary parcels={allParcels} />

      {/* Pending queue — operational, always visible when non-empty */}
      {pendingQueue.length > 0 && (
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
            onChange={setFilters}
            totalCount={allParcels.length}
            filteredCount={filtered.length}
          />
        </div>

        <ParcelTable data={filtered} isLoading={isLoading} isError={isError} />
      </section>

      <CreateParcelModal
        stations={stations}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {reportOpen && (
        <ParcelReport parcels={allParcels} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}
