"use client";

import { useState } from "react";
import { X, Download, Printer, FileText } from "lucide-react";
import type { ParcelRow } from "@/hooks/use-parcels";

interface Props {
  parcels: ParcelRow[];
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", in_transit: "In Transit",
  arrived: "Arrived", picked_up: "Collected",
};

function csvEscape(v: string | number | null | undefined) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCSV(parcels: ParcelRow[], from: string, to: string) {
  const headers = [
    "Tracking #", "Status", "Sender", "Receiver",
    "Receiver Phone", "Origin", "Destination",
    "Weight (kg)", "Fee (GHS)", "Declared Value (GHS)", "Logged At",
  ];

  const rows = parcels.map((p) => [
    p.tracking_number,
    STATUS_LABELS[p.status] ?? p.status,
    p.sender_name,
    p.receiver_name,
    p.receiver_phone,
    p.origin_station_name ?? p.origin_station_id,
    p.destination_station_name ?? p.destination_station_id,
    p.weight_kg ?? "",
    Number(p.fee_ghs).toFixed(2),
    p.declared_value_ghs != null ? Number(p.declared_value_ghs).toFixed(2) : "",
    p.created_at
      ? new Intl.DateTimeFormat("en-GH", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date(p.created_at))
      : "",
  ]);

  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `routepass-parcels-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ParcelReport({ parcels, onClose }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const filtered = parcels.filter((p) => {
    if (!p.created_at) return true;
    const d = p.created_at.split("T")[0];
    return d >= from && d <= to;
  });

  const totalFee = filtered.reduce((s, p) => s + Number(p.fee_ghs), 0);
  const byStatus = (st: string) => filtered.filter((p) => p.status === st).length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-zinc-500" />
              <h2 className="font-semibold text-zinc-900">Generate Report</h2>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">From</label>
                <input
                  type="date" value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to}
                  className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">To</label>
                <input
                  type="date" value={to}
                  onChange={(e) => setTo(e.target.value)}
                  min={from} max={today}
                  className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Summary preview */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Preview — {filtered.length} parcel{filtered.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <PreviewStat label="Total Fee" value={`GHS ${totalFee.toFixed(2)}`} />
                <PreviewStat label="Pending" value={byStatus("pending")} />
                <PreviewStat label="In Transit" value={byStatus("in_transit")} />
                <PreviewStat label="Arrived" value={byStatus("arrived")} />
                <PreviewStat label="Collected" value={byStatus("picked_up")} />
                <PreviewStat
                  label="Avg. Fee"
                  value={filtered.length ? `GHS ${(totalFee / filtered.length).toFixed(2)}` : "—"}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => downloadCSV(filtered, from, to)}
                disabled={filtered.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                onClick={() => window.print()}
                disabled={filtered.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Print Summary
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PreviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-800">{value}</span>
    </div>
  );
}
