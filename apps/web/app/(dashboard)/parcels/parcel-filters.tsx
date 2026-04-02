"use client";

import { Search, X } from "lucide-react";
import type { ParcelStatus } from "@/lib/definitions";

export type DateRange = "today" | "week" | "month" | "all";
export type StatusFilter = ParcelStatus | "all";

export interface FilterState {
  search: string;
  status: StatusFilter;
  dateRange: DateRange;
}

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  totalCount: number;
  filteredCount: number;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",       label: "All"        },
  { value: "pending",   label: "Pending"    },
  { value: "in_transit",label: "In Transit" },
  { value: "arrived",   label: "Arrived"    },
  { value: "picked_up", label: "Collected"  },
];

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today"      },
  { value: "week",  label: "This Week"  },
  { value: "month", label: "This Month" },
  { value: "all",   label: "All Time"   },
];

const STATUS_ACTIVE: Record<StatusFilter, string> = {
  all:       "bg-zinc-900 text-white",
  pending:   "bg-amber-500 text-white",
  in_transit:"bg-blue-600 text-white",
  arrived:   "bg-purple-600 text-white",
  picked_up: "bg-emerald-600 text-white",
};

export default function ParcelFilters({ filters, onChange, totalCount, filteredCount }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search tracking #, sender, receiver, phone…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-9 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
        {filters.search && (
          <button
            onClick={() => set({ search: "" })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Status + date row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status pills */}
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set({ status: opt.value })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filters.status === opt.value
                  ? STATUS_ACTIVE[opt.value]
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-zinc-300 hidden sm:block" />

        {/* Date range select */}
        <select
          value={filters.dateRange}
          onChange={(e) => set({ dateRange: e.target.value as DateRange })}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {DATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Result count */}
        <span className="ml-auto text-xs text-zinc-400">
          {filteredCount === totalCount
            ? `${totalCount} parcel${totalCount !== 1 ? "s" : ""}`
            : `${filteredCount} of ${totalCount}`}
        </span>
      </div>
    </div>
  );
}
