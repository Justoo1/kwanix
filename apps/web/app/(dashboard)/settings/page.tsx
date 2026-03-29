import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import BrandColorForm from "./brand-color-form";

interface CompanyResponse {
  id: number;
  name: string;
  company_code: string;
  brand_color: string | null;
}

export default async function SettingsPage() {
  const session = await getSession();

  if (session?.user.role !== "company_admin") {
    redirect("/dashboard");
  }

  const company = await apiFetch<CompanyResponse>(
    "/api/v1/admin/companies/me"
  ).catch(() => null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your company&apos;s branding and preferences.
        </p>
      </div>

      {company && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg">
          <div className="mb-6">
            <h2 className="text-base font-medium text-zinc-800">Company info</h2>
            <div className="mt-3 space-y-1 text-sm text-zinc-600">
              <p>
                <span className="text-zinc-400">Name:</span> {company.name}
              </p>
              <p>
                <span className="text-zinc-400">Code:</span>{" "}
                <span className="font-mono">{company.company_code}</span>
              </p>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-6">
            <h2 className="text-base font-medium text-zinc-800 mb-4">
              Ticket branding
            </h2>
            <BrandColorForm currentColor={company.brand_color} />
          </div>
        </div>
      )}
    </div>
  );
}
