import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import BillingOverrideForm from "./billing-override-form";
import CompanyActivityTabs from "./company-activity-tabs";

interface CompanyBilling {
  company_id: number;
  company_name: string;
  subscription_status: string;
  plan_name: string | null;
  billing_cycle: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  has_payment_method: boolean;
  has_subaccount: boolean;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const statusColors: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-800",
  active: "bg-emerald-100 text-emerald-800",
  grace: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  cancelled: "bg-zinc-100 text-zinc-600",
};

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (session?.user.role !== "super_admin") redirect("/dashboard");

  const { id } = await params;
  const companyId = Number(id);
  if (isNaN(companyId)) notFound();

  const billing = await apiFetch<CompanyBilling>(
    `/api/v1/admin/companies/${companyId}/billing`
  ).catch(() => null);

  if (!billing) notFound();

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Back nav */}
      <div>
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to Companies
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900 mt-2">
          {billing.company_name}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Company ID: {billing.company_id}</p>
      </div>

      {/* Subscription status card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-medium text-zinc-800">Subscription Status</h2>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Status</p>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                statusColors[billing.subscription_status] ?? "bg-zinc-100 text-zinc-600"
              }`}
            >
              {billing.subscription_status}
            </span>
          </div>

          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Plan</p>
            <p className="text-zinc-800">{billing.plan_name ?? "None selected"}</p>
          </div>

          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Billing cycle</p>
            <p className="text-zinc-800 capitalize">{billing.billing_cycle ?? "—"}</p>
          </div>

          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Trial ends</p>
            <p className="text-zinc-800">{fmt(billing.trial_ends_at)}</p>
          </div>

          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Period end</p>
            <p className="text-zinc-800">{fmt(billing.current_period_end)}</p>
          </div>

          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Payment method</p>
            <p className={billing.has_payment_method ? "text-emerald-700" : "text-zinc-400"}>
              {billing.has_payment_method ? "✓ Saved" : "Not set"}
            </p>
          </div>

          <div>
            <p className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Subaccount (bank)</p>
            <p className={billing.has_subaccount ? "text-emerald-700" : "text-zinc-400"}>
              {billing.has_subaccount ? "✓ Linked" : "Not linked"}
            </p>
          </div>
        </div>
      </div>

      {/* Billing override */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-medium text-zinc-800 mb-1">Billing Override</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Manually adjust subscription status or extend the period. Use for support cases, trials, and corrections.
        </p>
        <BillingOverrideForm
          companyId={companyId}
          currentStatus={billing.subscription_status}
          currentPeriodEnd={billing.current_period_end}
        />
      </div>

      {/* Activity tabs */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-medium text-zinc-800 mb-4">Activity</h2>
        <CompanyActivityTabs companyId={companyId} />
      </div>
    </div>
  );
}
