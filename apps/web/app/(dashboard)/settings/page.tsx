import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import ApiKeyCard from "./api-key-card";
import BrandColorForm from "./brand-color-form";
import ChangePasswordCard from "./change-password-card";
import InvoiceHistoryCard from "./invoice-history-card";
import MaxWeightCard from "./max-weight-card";
import SlaSettingsCard from "./sla-settings-card";
import SmsCreditsCard from "./sms-credits-card";
import SmsPreferencesCard from "./sms-preferences-card";
import SubscriptionCard from "./subscription-card";
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

interface SubscriptionStatus {
  subscription_status: "trialing" | "active" | "grace" | "suspended" | "cancelled";
  plan_name: string | null;
  max_vehicles: number | null;
  billing_cycle: "monthly" | "annual" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  has_payment_method: boolean;
  has_subaccount: boolean;
  billing_email: string | null;
}

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const isCompanyAdmin = session.user.role === "company_admin";

  const [company, me, weightTiersData, subscriptionStatus] = await Promise.all([
    isCompanyAdmin
      ? apiFetch<CompanyResponse>("/api/v1/admin/companies/me").catch(() => null)
      : Promise.resolve(null),
    apiFetch<UserMe>("/api/v1/auth/me").catch(() => null),
    isCompanyAdmin
      ? apiFetch<WeightTiersResponse>("/api/v1/admin/companies/me/weight-tiers").catch(() => null)
      : Promise.resolve(null),
    isCompanyAdmin
      ? apiFetch<SubscriptionStatus>("/api/v1/billing/status").catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Manage your account and company preferences.
        </p>
      </div>

      {/* Account */}
      <SettingsSection title="Account">
        <ChangePasswordCard />
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notifications">
        <SmsPreferencesCard initialOptOut={me?.sms_opt_out ?? false} />
      </SettingsSection>

      {/* Company admin sections */}
      {isCompanyAdmin && company && (
        <>
          <SettingsSection title="Subscription & Billing">
            <SubscriptionCard initialStatus={subscriptionStatus} />
            <InvoiceHistoryCard />
          </SettingsSection>

          <SettingsSection title="Company Info">
            <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="space-y-2 text-[13px] text-muted-foreground mb-5">
                <p>
                  <span className="text-foreground font-semibold">Name:</span> {company.name}
                </p>
                <p>
                  <span className="text-foreground font-semibold">Code:</span>{" "}
                  <span className="font-mono">{company.company_code}</span>
                </p>
              </div>
              <div className="border-t border-border pt-5">
                <p className="text-[13px] font-semibold text-foreground mb-3">Ticket Branding</p>
                <BrandColorForm currentColor={company.brand_color} />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Messaging">
            <SmsCreditsCard />
          </SettingsSection>

          <SettingsSection title="Parcel Pricing">
            <div className="flex flex-col gap-4">
              <WeightTierCard initialTiers={weightTiersData?.tiers ?? []} />
              <MaxWeightCard initialMaxWeight={company.max_parcel_weight_kg} />
            </div>
          </SettingsSection>

          <SettingsSection title="SLA">
            <SlaSettingsCard initialThresholdDays={company.sla_threshold_days ?? 2} />
          </SettingsSection>

          <SettingsSection title="API Access">
            <ApiKeyCard keyPrefix={company.api_key_prefix ?? null} />
          </SettingsSection>
        </>
      )}
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </section>
  );
}
