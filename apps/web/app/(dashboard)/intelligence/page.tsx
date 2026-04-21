import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  TrendingUp,
  Tag,
  BarChart3,
  Lightbulb,
  BrainCircuit,
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
  const uniqueRoutes = new Set(
    heatmapCells.map((c) => `${c.departure_station_id}-${c.destination_station_id}`)
  ).size;
  const avgOccupancy =
    heatmapCells.length > 0
      ? heatmapCells.reduce((s, c) => s + c.avg_occupancy_pct, 0) / heatmapCells.length
      : 0;

  const hasData = heatmapCells.length > 0 || pricingSuggestions.length > 0 || slaRisks.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Intelligence</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Demand forecasting, pricing suggestions, and SLA risk monitoring.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KpiCard
          icon={<BarChart3 className="h-4 w-4 text-primary" />}
          label="Routes Tracked"
          value={String(uniqueRoutes)}
          color="text-primary"
          bgColor="bg-primary/10"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
          label="Avg Occupancy"
          value={`${avgOccupancy.toFixed(1)}%`}
          color="text-blue-600"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          icon={<Tag className="h-4 w-4 text-amber-500" />}
          label="Pricing Alerts"
          value={String(pricingSuggestions.length)}
          color="text-amber-600"
          bgColor="bg-amber-500/10"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          label="SLA Risks"
          value={String(slaRisks.length)}
          color={criticalCount > 0 ? "text-red-600" : "text-muted-foreground"}
          bgColor={criticalCount > 0 ? "bg-red-500/10" : "bg-muted/50"}
        />
      </div>

      {/* SLA Risks */}
      {slaRisks.length > 0 && (
        <section>
          <SectionHead icon={<AlertTriangle className="h-4 w-4 text-red-500" />} title="SLA Risk Parcels" />
          <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  {["Tracking", "Route", "Receiver", "Hours Left", "Severity"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {slaRisks.map((r) => (
                  <tr key={r.parcel_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-[12px] text-foreground">{r.tracking_number}</td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">
                      {r.origin_station_name} → {r.destination_station_name}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{r.receiver_name}</td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-foreground">
                      {r.hours_remaining.toFixed(1)}h
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
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
          <SectionHead icon={<Lightbulb className="h-4 w-4 text-primary" />} title="Revenue Opportunities" />
          <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  {["Route", "Day", "Hour", "Avg Occupancy", "Next Date"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {opportunities.map((o, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-foreground">
                      {o.departure_station_name} → {o.destination_station_name}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{DAYS[o.day_of_week]}</td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{o.hour_of_day}:00</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, o.historical_avg_occupancy_pct)}%` }}
                          />
                        </div>
                        <span className="text-[12px] font-semibold text-primary">
                          {o.historical_avg_occupancy_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{o.next_occurrence ?? "—"}</td>
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
          <SectionHead icon={<BarChart3 className="h-4 w-4 text-blue-500" />} title="Demand Heatmap — last 90 days" />
          <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  {["Route", "Day", "Hour", "Trips", "Avg Occupancy"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {heatmapCells.slice(0, 20).map((c, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-foreground">
                      {c.departure_station_name} → {c.destination_station_name}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{DAYS[c.day_of_week]}</td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{c.hour_of_day}:00</td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{c.trip_count}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, c.avg_occupancy_pct)}%`,
                              opacity: 0.4 + 0.6 * (c.avg_occupancy_pct / 100),
                            }}
                          />
                        </div>
                        <span className="text-[12px] font-semibold text-foreground">
                          {c.avg_occupancy_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {heatmapCells.length > 20 && (
              <p className="px-5 py-2.5 text-[12px] text-muted-foreground border-t border-border">
                Showing top 20 of {heatmapCells.length} route–time slots.
              </p>
            )}
          </div>
        </section>
      )}

      {!hasData && (
        <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-12 text-center">
          <div className="rounded-2xl p-4 bg-primary/10 w-fit mx-auto mb-4">
            <BrainCircuit className="h-8 w-8 text-primary" />
          </div>
          <p className="text-[14px] font-semibold text-foreground/70">No data yet</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Intelligence insights appear after trips and parcels have been processed.
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className={`inline-flex rounded-xl p-2.5 mb-3 ${bgColor}`}>{icon}</div>
      <div className={`text-[26px] font-bold leading-none mb-1 ${color}`}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="text-[14px] font-bold text-foreground">{title}</h2>
    </div>
  );
}
