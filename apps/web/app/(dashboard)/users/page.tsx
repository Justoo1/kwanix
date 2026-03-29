import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { UserResponse } from "@/lib/definitions";

import CreateUserForm from "./create-user-form";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  station_manager: "Station Manager",
  station_clerk: "Station Clerk",
};

export default async function UsersPage() {
  const session = await getSession();
  const role = session?.user.role;

  if (role !== "super_admin" && role !== "company_admin") {
    redirect("/dashboard");
  }

  const users = await apiFetch<UserResponse[]>("/api/v1/admin/users");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Users</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {role === "super_admin"
            ? "All platform users across all companies."
            : "Manage staff accounts for your company."}
        </p>
      </div>

      {/* Create user — company_admin only (super_admin must log in as company_admin) */}
      {role === "company_admin" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-medium text-zinc-800 mb-4">
            New user
          </h2>
          <CreateUserForm />
        </div>
      )}

      {/* User list */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            All users
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({users.length})
            </span>
          </h2>
        </div>

        {users.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No users yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Phone</th>
                <th className="px-6 py-3 text-left font-medium">Role</th>
                {role === "super_admin" && (
                  <th className="px-6 py-3 text-left font-medium">
                    Company ID
                  </th>
                )}
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-900">{u.full_name}</div>
                    {u.email && (
                      <div className="text-xs text-zinc-400">{u.email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">{u.phone}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  {role === "super_admin" && (
                    <td className="px-6 py-4 text-zinc-500">
                      {u.company_id ?? "—"}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
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
