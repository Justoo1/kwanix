import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  TrendingUp,
  Tag,
  BarChart3,
  Lightbulb,
} from "lucide-react";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import IntelligenceClient from "./IntelligenceClient";

export const metadata: Metadata = { title: "Intelligence — Kwanix" };

const ALLOWED_ROLES = ["company_admin", "super_admin", "station_manager"];

export interface HeatmapCell {
  departure_station_id: number;
  departure_station_name: string;
  destination_station_id: number;
  destination_station_name: string;
  day_of_week: number;
  hour_of_day: number;
  trip_count: number;
  avg_occupancy_pct: number;
}

export interface PricingSuggestion {
  trip_id: number;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  current_price_ghs: number | null;
  seats_available: number;
  vehicle_capacity: number;
  occupancy_pct: number;
  suggested_discount_pct: number;
  suggested_price_ghs: number | null;
}

export interface SlaRisk {
  parcel_id: number;
  tracking_number: string;
  sender_name: string;
  receiver_name: string;
  origin_station_name: string;
  destination_station_name: string;
  created_at: string;
  hours_remaining: number;
  severity: "critical" | "warning" | "watch";
}

export interface Opportunity {
  departure_station_id: number;
  departure_station_name: string;
  destination_station_id: number;
  destination_station_name: string;
  day_of_week: number;
  hour_of_day: number;
  historical_avg_occupancy_pct: number;
  historical_trip_count: number;
  next_occurrence: string | null;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function IntelligencePage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!ALLOWED_ROLES.includes(role)) redirect("/dashboard");

  let heatmapCells: HeatmapCell[] = [];
  let pricingSuggestions: PricingSuggestion[] = [];
  let slaRisks: SlaRisk[] = [];
  let opportunities: Opportunity[] = [];

  await Promise.allSettled([
    apiFetch<{ cells: HeatmapCell[] }>("/api/v1/demand-intel/heatmap?days_back=90").then(
      (d) => { heatmapCells = d.cells ?? []; }
    ),
    apiFetch<PricingSuggestion[]>("/api/v1/demand-intel/pricing-suggestions?hours_ahead=6").then(
      (d) => { pricingSuggestions = d; }
    ),
    apiFetch<SlaRisk[]>("/api/v1/demand-intel/sla-risk").then(
      (d) => { slaRisks = d; }
    ),
    apiFetch<Opportunity[]>("/api/v1/demand-intel/opportunities?min_occupancy=75").then(
      (d) => { opportunities = d; }
    ),
  ]);

  const criticalCount = slaRisks.filter((r) => r.severity === "critical").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Intelligence</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Demand forecasting, pricing suggestions, and SLA risk monitoring.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1">
            <BarChart3 className="h-3 w-3" /> Routes tracked
          </p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {new Set(heatmapCells.map((c) => `${c.departure_station_id}-${c.destination_station_id}`)).size}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide flex items-center gap-1">
            <Tag className="h-3 w-3" /> Pricing alerts
          </p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{pricingSuggestions.length}</p>
        </div>
        <div className={`rounded-xl border p-4 shadow-sm ${criticalCount > 0 ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
          <p className={`text-xs font-medium uppercase tracking-wide flex items-center gap-1 ${criticalCount > 0 ? "text-red-600" : "text-zinc-500"}`}>
            <AlertTriangle className="h-3 w-3" /> SLA risks
          </p>
          <p className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? "text-red-700" : "text-zinc-400"}`}>
            {slaRisks.length}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Opportunities
          </p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{opportunities.length}</p>
        </div>
      </div>

      {/* SLA Risks */}
      {slaRisks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" /> SLA Risk Parcels
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Tracking</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Route</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Receiver</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Hours Left</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {slaRisks.map((r) => (
                  <tr key={r.parcel_id}>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-800">{r.tracking_number}</td>
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {r.origin_station_name} → {r.destination_station_name}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">{r.receiver_name}</td>
                    <td className="px-4 py-2 text-xs font-medium text-zinc-800">
                      {r.hours_remaining.toFixed(1)}h
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : r.severity === "warning"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-yellow-50 text-yellow-600"
                      }`}>
                        {r.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pricing Suggestions */}
      <IntelligenceClient pricingSuggestions={pricingSuggestions} />

      {/* Revenue Opportunities */}
      {opportunities.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Revenue Opportunities
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Route</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Day</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Hour</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Avg Occupancy</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Next Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {opportunities.map((o, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-xs font-medium text-zinc-800">
                      {o.departure_station_name} → {o.destination_station_name}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">{DAYS[o.day_of_week]}</td>
                    <td className="px-4 py-2 text-xs text-zinc-600">{o.hour_of_day}:00</td>
                    <td className="px-4 py-2 text-xs font-semibold text-emerald-700">
                      {o.historical_avg_occupancy_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{o.next_occurrence ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Demand Heatmap */}
      {heatmapCells.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" /> Demand Heatmap (top routes, last 90 days)
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Route</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Day</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Hour</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Trips</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Avg Occupancy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {heatmapCells.slice(0, 20).map((c, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-xs font-medium text-zinc-800">
                      {c.departure_station_name} → {c.destination_station_name}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-600">{DAYS[c.day_of_week]}</td>
                    <td className="px-4 py-2 text-xs text-zinc-600">{c.hour_of_day}:00</td>
                    <td className="px-4 py-2 text-xs text-zinc-600">{c.trip_count}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(100, c.avg_occupancy_pct)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-zinc-700">
                          {c.avg_occupancy_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {heatmapCells.length > 20 && (
              <p className="px-4 py-2 text-xs text-zinc-400 border-t border-zinc-100">
                Showing top 20 of {heatmapCells.length} route–time slots.
              </p>
            )}
          </div>
        </section>
      )}

      {heatmapCells.length === 0 && pricingSuggestions.length === 0 && slaRisks.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <BrainCircuit className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
          <p className="text-sm font-semibold text-zinc-600">No data yet</p>
          <p className="text-xs text-zinc-400 mt-1">
            Intelligence insights appear after trips and parcels have been processed.
          </p>
        </div>
      )}
    </div>
  );
}

function BrainCircuit({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  );
}
