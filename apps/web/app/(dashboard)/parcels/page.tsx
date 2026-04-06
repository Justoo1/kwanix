import type { Metadata } from "next";
import { Package, ScanLine } from "lucide-react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { UserRole } from "@/lib/definitions";
import ParcelsClient from "./parcels-client";

export const metadata: Metadata = { title: "Parcels — RoutePass" };

interface StationOption {
  id: number;
  name: string;
  location_code: string | null;
}

export default async function ParcelsPage() {
  const [stations, session] = await Promise.all([
    apiFetch<StationOption[]>("/api/v1/stations").catch(() => [] as StationOption[]),
    getSession(),
  ]);
  const userRole: UserRole = session?.user.role ?? "station_clerk";
  const stationId: number | null = session?.user.station_id ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-zinc-500" />
          <h1 className="text-2xl font-bold text-zinc-900">Parcels</h1>
        </div>
        <Link
          href="/parcels/load"
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
        >
          <ScanLine className="h-4 w-4" />
          Scan to Load
        </Link>
      </div>

      {/* Client section: create modal + pending queue + full table */}
      <ParcelsClient stations={stations} userRole={userRole} stationId={stationId} />
    </div>
  );
}
