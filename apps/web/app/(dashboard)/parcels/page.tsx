import type { Metadata } from "next";
import { ScanLine } from "lucide-react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { UserRole } from "@/lib/definitions";
import ParcelsClient from "./parcels-client";

export const metadata: Metadata = { title: "Parcels — Kwanix" };

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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Parcels</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Track and manage parcel logistics</p>
        </div>
        <Link
          href="/parcels/load"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 transition-opacity"
        >
          <ScanLine className="h-4 w-4" />
          Scan to Load
        </Link>
      </div>

      {/* Client section: KPI cards + create modal + pending queue + full table */}
      <ParcelsClient stations={stations} userRole={userRole} stationId={stationId} />
    </div>
  );
}
