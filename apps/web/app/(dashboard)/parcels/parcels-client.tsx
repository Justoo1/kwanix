"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useParcels } from "@/hooks/use-parcels";
import ParcelTable from "./parcel-table";
import CreateParcelModal from "./create-parcel-modal";

interface Station {
  id: number;
  name: string;
  location_code: string | null;
}

export default function ParcelsClient({ stations }: { stations: Station[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: pending = [] } = useParcels("pending");

  return (
    <div className="space-y-6">
      {/* Waitlist — pending parcels */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-sm font-semibold text-zinc-700">
              Pending Queue ({pending.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pending.map((p) => (
              <div
                key={p.id}
                className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3"
              >
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400 animate-pulse" />
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

      {/* All parcels table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-800">All Parcels</h2>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Log Parcel
          </button>
        </div>
        <ParcelTable />
      </section>

      <CreateParcelModal
        stations={stations}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
