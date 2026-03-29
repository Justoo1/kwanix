import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import CreateVehicleForm from "./create-vehicle-form";

interface VehicleResponse {
  id: number;
  plate_number: string;
  model: string | null;
  capacity: number;
  is_active: boolean;
}

const ADMIN_ROLES = ["company_admin", "super_admin"];

export default async function VehiclesPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!["company_admin", "super_admin", "station_manager", "station_clerk"].includes(role)) {
    redirect("/dashboard");
  }

  const vehicles = await apiFetch<VehicleResponse[]>("/api/v1/vehicles").catch(
    () => [] as VehicleResponse[]
  );

  const canCreate = ADMIN_ROLES.includes(role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Vehicles</h1>
        <p className="text-sm text-zinc-500 mt-1">Fleet registered to your company.</p>
      </div>

      {canCreate && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-medium text-zinc-800 mb-4">Add vehicle</h2>
          <CreateVehicleForm />
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            Fleet
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({vehicles.length})
            </span>
          </h2>
        </div>
        {vehicles.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No vehicles yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Plate</th>
                <th className="px-6 py-3 text-left font-medium">Model</th>
                <th className="px-6 py-3 text-left font-medium">Capacity</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4 font-mono font-medium text-zinc-900">
                    {v.plate_number}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">{v.model ?? "—"}</td>
                  <td className="px-6 py-4 text-zinc-600">{v.capacity} seats</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        v.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
