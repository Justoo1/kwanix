"use client";

import { useMemo } from "react";
import { Package, TrendingUp, Truck, CheckCheck } from "lucide-react";
import type { ParcelRow } from "@/hooks/use-parcels";

function todayPrefix() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ParcelSummary({ parcels }: { parcels: ParcelRow[] }) {
  const stats = useMemo(() => {
    const prefix = todayPrefix();
    const today = parcels.filter((p) => p.created_at?.startsWith(prefix));
    const todayFee = today.reduce((s, p) => s + Number(p.fee_ghs), 0);
    const totalFee = parcels.reduce((s, p) => s + Number(p.fee_ghs), 0);
    const byStatus = (st: string) => parcels.filter((p) => p.status === st).length;

    return {
      todayCount: today.length,
      todayFee,
      totalFee,
      pending: byStatus("pending"),
      inTransit: byStatus("in_transit"),
      arrived: byStatus("arrived"),
      pickedUp: byStatus("picked_up"),
    };
  }, [parcels]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={<Package className="h-4 w-4" />}
        label="Today's Parcels"
        value={stats.todayCount}
        sub={`GHS ${stats.todayFee.toFixed(2)} logged today`}
        accent="blue"
      />
      <StatCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Total Revenue"
        value={`GHS ${stats.totalFee.toFixed(2)}`}
        sub={`${stats.pending} pending · ${parcels.length} total`}
        accent="violet"
      />
      <StatCard
        icon={<Truck className="h-4 w-4" />}
        label="In Transit"
        value={stats.inTransit}
        sub={`${stats.arrived} arrived at destination`}
        accent="sky"
      />
      <StatCard
        icon={<CheckCheck className="h-4 w-4" />}
        label="Collected"
        value={stats.pickedUp}
        sub={`${stats.arrived} awaiting pickup`}
        accent="emerald"
      />
    </div>
  );
}

const ACCENT: Record<string, { card: string; icon: string; value: string }> = {
  blue:    { card: "bg-blue-50 border-blue-100",    icon: "bg-blue-100 text-blue-600",    value: "text-blue-900"    },
  violet:  { card: "bg-violet-50 border-violet-100",icon: "bg-violet-100 text-violet-600",value: "text-violet-900"  },
  sky:     { card: "bg-sky-50 border-sky-100",      icon: "bg-sky-100 text-sky-600",      value: "text-sky-900"     },
  emerald: { card: "bg-emerald-50 border-emerald-100",icon:"bg-emerald-100 text-emerald-600",value:"text-emerald-900"},
};

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  accent: string;
}) {
  const c = ACCENT[accent];
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${c.card}`}>
      <div className={`inline-flex items-center justify-center rounded-lg p-1.5 ${c.icon}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <p className={`text-xl font-bold ${c.value}`}>{value}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
