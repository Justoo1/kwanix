import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import CreateStationForm from "./create-station-form";

interface StationResponse {
  id: number;
  name: string;
  location_code: string | null;
  contact_number: string | null;
  address: string | null;
  is_hub: boolean;
  is_active: boolean;
}

const MANAGER_ROLES = ["station_manager", "company_admin", "super_admin"];

export default async function StationsPage() {
  const session = await getSession();
  const role = session?.user.role ?? "";

  if (!MANAGER_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  const stations = await apiFetch<StationResponse[]>("/api/v1/stations").catch(
    () => [] as StationResponse[]
  );

  const canCreate = ["company_admin", "super_admin"].includes(role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Stations</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Origins and destinations for trips and parcels.
        </p>
      </div>

      {canCreate && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-medium text-zinc-800 mb-4">
            Add station
          </h2>
          <CreateStationForm />
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            All stations
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({stations.length})
            </span>
          </h2>
        </div>
        {stations.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No stations yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Code</th>
                <th className="px-6 py-3 text-left font-medium">Contact</th>
                <th className="px-6 py-3 text-left font-medium">Hub</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {stations.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-zinc-900">{s.name}</p>
                    {s.address && (
                      <p className="text-xs text-zinc-400">{s.address}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-600">
                    {s.location_code ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {s.contact_number ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    {s.is_hub ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Hub
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {s.is_active ? "Active" : "Inactive"}
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
