import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import ApiKeyCard from "./api-key-card";
import BrandColorForm from "./brand-color-form";
import ChangePasswordCard from "./change-password-card";
import MaxWeightCard from "./max-weight-card";
import SlaSettingsCard from "./sla-settings-card";
import SmsCreditsCard from "./sms-credits-card";
import SmsPreferencesCard from "./sms-preferences-card";
import WeightTierCard from "./weight-tier-card";

interface CompanyResponse {
  id: number;
  name: string;
  company_code: string;
  brand_color: string | null;
  api_key_prefix: string | null;
  max_parcel_weight_kg: number | null;
  sla_threshold_days: number;
}

interface WeightTier {
  max_kg: number | null;
  fee_ghs: number;
}

interface WeightTiersResponse {
  tiers: WeightTier[];
}

interface UserMe {
  sms_opt_out: boolean;
}

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const isCompanyAdmin = session.user.role === "company_admin";

  const [company, me, weightTiersData] = await Promise.all([
    isCompanyAdmin
      ? apiFetch<CompanyResponse>("/api/v1/admin/companies/me").catch(() => null)
      : Promise.resolve(null),
    apiFetch<UserMe>("/api/v1/auth/me").catch(() => null),
    isCompanyAdmin
      ? apiFetch<WeightTiersResponse>("/api/v1/admin/companies/me/weight-tiers").catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your account and company preferences.
        </p>
      </div>

      {/* Change Password — available to all users */}
      <div>
        <h2 className="text-base font-medium text-zinc-800 mb-4">Account</h2>
        <ChangePasswordCard />
      </div>

      {/* SMS Preferences — available to all users */}
      <div>
        <h2 className="text-base font-medium text-zinc-800 mb-4">Notifications</h2>
        <SmsPreferencesCard initialOptOut={me?.sms_opt_out ?? false} />
      </div>

      {/* Company admin sections */}
      {isCompanyAdmin && company && (
        <>
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

          <div>
            <h2 className="text-base font-medium text-zinc-800 mb-4">Messaging</h2>
            <SmsCreditsCard />
          </div>

          <div>
            <h2 className="text-base font-medium text-zinc-800 mb-4">Parcel Pricing</h2>
            <div className="space-y-4">
              <WeightTierCard initialTiers={weightTiersData?.tiers ?? []} />
              <MaxWeightCard initialMaxWeight={company.max_parcel_weight_kg} />
            </div>
          </div>

          <div>
            <h2 className="text-base font-medium text-zinc-800 mb-4">SLA</h2>
            <SlaSettingsCard initialThresholdDays={company.sla_threshold_days ?? 2} />
          </div>

          <div>
            <h2 className="text-base font-medium text-zinc-800 mb-4">API Access</h2>
            <ApiKeyCard keyPrefix={company.api_key_prefix ?? null} />
          </div>
        </>
      )}
    </div>
  );
}
