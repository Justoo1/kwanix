import type { Metadata } from "next";
import { Package } from "lucide-react";

import { apiFetch } from "@/lib/api";
import CreateParcelForm from "./create-parcel-form";

export const metadata: Metadata = { title: "Parcels — RoutePass" };

interface StationOption {
  id: number;
  name: string;
  location_code: string | null;
}

export default async function ParcelsPage() {
  const stations = await apiFetch<StationOption[]>("/api/v1/stations").catch(
    () => [] as StationOption[]
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Package className="h-6 w-6 text-zinc-500" />
        <h1 className="text-2xl font-bold text-zinc-900">Parcels</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-base font-semibold text-zinc-800 mb-3">
            Log New Parcel
          </h2>
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
            <CreateParcelForm stations={stations} />
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-800 mb-3">
            Scan to Load
          </h2>
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
            <p className="text-sm text-zinc-500 mb-4">
              Enter parcel ID and trip ID to load a parcel onto a bus.
            </p>
            <LoadParcelForm />
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Load Parcel form (simple, inline) ────────────────────────────────────────

function LoadParcelForm() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">
        Use the mobile app or enter IDs manually for scan-to-load.
      </p>
      <div className="bg-zinc-50 rounded-lg border border-zinc-200 px-4 py-3 text-xs text-zinc-500">
        Mobile scan-to-load: tap{" "}
        <kbd className="bg-white border border-zinc-300 rounded px-1 py-0.5">
          Load
        </kbd>{" "}
        in the mobile app after scanning the parcel QR code.
      </div>
    </div>
  );
}
