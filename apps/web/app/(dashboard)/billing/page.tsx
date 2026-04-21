import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Clock,
  XCircle,
  ArrowRight,
} from "lucide-react";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import BillingClient from "./BillingClient";

export const metadata: Metadata = { title: "Billing — Kwanix" };

interface SubscriptionStatus {
  subscription_status: string;
  plan_name: string | null;
  max_vehicles: number | null;
  billing_cycle: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  has_payment_method: boolean;
  has_subaccount: boolean;
  billing_email: string | null;
}

interface Plan {
  id: number;
  name: string;
  max_vehicles: number | null;
  price_ghs_month: number;
  price_ghs_annual: number;
}

interface Invoice {
  id: number;
  amount_ghs: number;
  billing_cycle: string;
  period_start: string;
  period_end: string;
  status: string;
  paystack_reference: string | null;
  paid_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  active: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: "Active",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  trialing: {
    icon: <Clock className="h-4 w-4" />,
    label: "Trial",
    cls: "text-blue-700 bg-blue-50 border-blue-200",
  },
  grace: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: "Grace period",
    cls: "text-amber-700 bg-amber-50 border-amber-200",
  },
  suspended: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Suspended",
    cls: "text-red-700 bg-red-50 border-red-200",
  },
  cancelled: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Cancelled",
    cls: "text-zinc-600 bg-zinc-100 border-zinc-200",
  },
};

export default async function BillingPage() {
  const session = await getSession();
  if (!session || session.user.role !== "company_admin") redirect("/dashboard");

  let billingStatus: SubscriptionStatus | null = null;
  let plans: Plan[] = [];
  let invoices: Invoice[] = [];

  await Promise.allSettled([
    apiFetch<SubscriptionStatus>("/api/v1/billing/status").then((d) => { billingStatus = d; }),
    apiFetch<Plan[]>("/api/v1/billing/plans").then((d) => { plans = d; }),
    apiFetch<Invoice[]>("/api/v1/billing/invoices?limit=10").then((d) => { invoices = d; }),
  ]);

  const statusKey = billingStatus?.subscription_status ?? "trialing";
  const statusInfo = STATUS_STYLE[statusKey] ?? STATUS_STYLE.trialing;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Billing</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your subscription, payment method, and invoices.
        </p>
      </div>

      {/* Current status card */}
      {billingStatus && (
        <div className={`rounded-xl border p-5 shadow-sm flex items-start justify-between gap-4 ${statusInfo.cls}`}>
          <div className="flex items-center gap-3">
            {statusInfo.icon}
            <div>
              <p className="text-sm font-semibold">{statusInfo.label}</p>
              <p className="text-xs opacity-80 mt-0.5">
                {billingStatus.plan_name
                  ? `${billingStatus.plan_name} · ${billingStatus.billing_cycle ?? "monthly"}`
                  : "No plan selected"}
                {billingStatus.current_period_end && (
                  <> · Renews {new Date(billingStatus.current_period_end).toLocaleDateString("en-GH")}</>
                )}
                {billingStatus.trial_ends_at && (
                  <> · Trial ends {new Date(billingStatus.trial_ends_at).toLocaleDateString("en-GH")}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <span className={billingStatus.has_payment_method ? "text-emerald-700" : "text-zinc-500"}>
              <CreditCard className="inline h-3.5 w-3.5 mr-0.5" />
              {billingStatus.has_payment_method ? "Card saved" : "No card"}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <BillingClient billingStatus={billingStatus} />

      {/* Available plans */}
      {plans.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  billingStatus?.plan_name === plan.name ? "border-blue-400 ring-1 ring-blue-300" : "border-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-zinc-900">{plan.name}</h3>
                  {billingStatus?.plan_name === plan.name && (
                    <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xl font-bold text-zinc-900">
                  GHS {plan.price_ghs_month.toFixed(2)}
                  <span className="text-xs font-normal text-zinc-500">/mo</span>
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  GHS {plan.price_ghs_annual.toFixed(2)}/yr · Save{" "}
                  {Math.round(100 - (plan.price_ghs_annual / (plan.price_ghs_month * 12)) * 100)}%
                </p>
                {plan.max_vehicles != null && (
                  <p className="text-xs text-zinc-400 mt-2">Up to {plan.max_vehicles} vehicles</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invoice history */}
      {invoices.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Invoice History</h2>
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Period</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Cycle</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Amount</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-2 text-xs text-zinc-600">
                      {new Date(inv.period_start).toLocaleDateString("en-GH")} →{" "}
                      {new Date(inv.period_end).toLocaleDateString("en-GH")}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500 capitalize">{inv.billing_cycle}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-zinc-800">
                      GHS {inv.amount_ghs.toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        inv.status === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : inv.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-GH") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!billingStatus && plans.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <CreditCard className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
          <p className="text-sm font-semibold text-zinc-600">Could not load billing information</p>
          <p className="text-xs text-zinc-400 mt-1">Please refresh the page or contact support.</p>
        </div>
      )}
    </div>
  );
}
