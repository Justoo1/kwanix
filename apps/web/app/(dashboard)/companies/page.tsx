import Link from "next/link";
import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import type { CompanyResponse } from "@/lib/definitions";

import CreateCompanyForm from "./create-company-form";
import PlansManager from "./plans-manager";

export default async function CompaniesPage() {
  const session = await getSession();
  if (session?.user.role !== "super_admin") {
    redirect("/dashboard");
  }

  const companies = await apiFetch<CompanyResponse[]>("/api/v1/admin/companies");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Companies</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Onboard a new transport company onto the platform.
        </p>
      </div>

      {/* Create company */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-medium text-zinc-800 mb-4">
          New company
        </h2>
        <CreateCompanyForm />
      </div>

      {/* Company list */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            All companies
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({companies.length})
            </span>
          </h2>
        </div>

        {companies.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">
            No companies yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Code</th>
                <th className="px-6 py-3 text-left font-medium">Subdomain</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4 font-medium text-zinc-900">
                    {c.name}
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-600">
                    {c.company_code}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {c.subdomain ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/companies/${c.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Subscription plan management */}
      <PlansManager />
    </div>
  );
}
