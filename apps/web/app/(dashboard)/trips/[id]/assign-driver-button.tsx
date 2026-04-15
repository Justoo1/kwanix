"use client";

import { useEffect, useRef, useState } from "react";
import { UserCheck, ChevronDown, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { clientFetch } from "@/lib/client-api";
import type { UserResponse } from "@/lib/definitions";

interface Props {
  tripId: number;
  currentDriverId: number | null | undefined;
  currentDriverName: string | null | undefined;
  vehicleDefaultDriverId?: number | null;
  vehicleDefaultDriverName?: string | null;
}

export default function AssignDriverButton({
  tripId,
  currentDriverId,
  currentDriverName,
  vehicleDefaultDriverId,
  vehicleDefaultDriverName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (drivers.length > 0) return;
    setLoading(true);
    try {
      const data = await clientFetch<UserResponse[]>("admin/users?role=driver");
      setDrivers(data);
    } catch {
      setError("Could not load drivers.");
    } finally {
      setLoading(false);
    }
  }

  async function assign(driverId: number | null) {
    setSaving(true);
    setError(null);
    try {
      await clientFetch(`trips/${tripId}/driver`, {
        method: "PATCH",
        body: JSON.stringify({ driver_id: driverId }),
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not assign driver.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <UserCheck className="size-4 text-zinc-500" />
        <h2 className="text-base font-medium text-zinc-800">Driver Assignment</h2>
      </div>

      <div className="flex items-center justify-between gap-4" ref={dropdownRef}>
        <div className="space-y-1">
          {currentDriverName ? (
            <p className="text-sm font-medium text-zinc-900">{currentDriverName}</p>
          ) : (
            <p className="text-sm text-zinc-400">No driver assigned</p>
          )}
          {/* Suggest the vehicle's default driver when the trip has no driver yet */}
          {!currentDriverId && vehicleDefaultDriverId && vehicleDefaultDriverName && (
            <button
              onClick={() => assign(vehicleDefaultDriverId)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              <UserCheck className="size-3" />
              Use vehicle default: {vehicleDefaultDriverName}
            </button>
          )}
        </div>

        <div className="relative">
          <button
            onClick={handleOpen}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Assign"}
            <ChevronDown className="size-3.5" />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-xl border border-zinc-200 bg-white shadow-lg py-1">
              {loading && (
                <p className="px-3 py-2 text-sm text-zinc-400">Loading drivers...</p>
              )}
              {error && (
                <p className="px-3 py-2 text-sm text-red-600">{error}</p>
              )}
              {!loading && !error && drivers.length === 0 && (
                <p className="px-3 py-2 text-sm text-zinc-400">No drivers found.</p>
              )}
              {drivers.map((d) => (
                <button
                  key={d.id}
                  onClick={() => assign(d.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-zinc-50 transition-colors ${
                    d.id === currentDriverId
                      ? "text-blue-600 font-medium"
                      : "text-zinc-700"
                  }`}
                >
                  {d.full_name}
                  {d.id === currentDriverId && (
                    <span className="text-xs text-blue-500">current</span>
                  )}
                </button>
              ))}
              {currentDriverId && (
                <>
                  <hr className="my-1 border-zinc-100" />
                  <button
                    onClick={() => assign(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="size-3.5" />
                    Unassign driver
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
