import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  Clock,
  XCircle,
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

const STATUS_STYLE: Record<string, { icon: ReactNode; label: string; pill: string; accent: string }> = {
  active: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: "Active",
    pill: "bg-emerald-100 text-emerald-700",
    accent: "border-l-emerald-500",
  },
  trialing: {
    icon: <Clock className="h-4 w-4" />,
    label: "Trial",
    pill: "bg-blue-100 text-blue-700",
    accent: "border-l-blue-500",
  },
  grace: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: "Grace Period",
    pill: "bg-amber-100 text-amber-700",
    accent: "border-l-amber-500",
  },
  suspended: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Suspended",
    pill: "bg-red-100 text-red-700",
    accent: "border-l-red-500",
  },
  cancelled: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Cancelled",
    pill: "bg-muted text-muted-foreground",
    accent: "border-l-border",
  },
};

export default async function BillingPage() {
  const session = await getSession();
  if (!session || session.user.role !== "company_admin") redirect("/dashboard");

  const [billingStatus, plans, invoices] = await Promise.all([
    apiFetch<SubscriptionStatus>("/api/v1/billing/status").catch(() => null as SubscriptionStatus | null),
    apiFetch<Plan[]>("/api/v1/billing/plans").catch(() => [] as Plan[]),
    apiFetch<Invoice[]>("/api/v1/billing/invoices?limit=10").catch(() => [] as Invoice[]),
  ]);

  const statusKey = billingStatus?.subscription_status ?? "trialing";
  const statusInfo = STATUS_STYLE[statusKey] ?? STATUS_STYLE.trialing;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Billing</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Manage your subscription, payment method, and invoices.
        </p>
      </div>

      {/* Current plan banner */}
      {billingStatus && (
        <div className={`bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-5 border-l-4 ${statusInfo.accent} flex items-start justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <div className={`inline-flex rounded-xl p-2.5 ${statusInfo.pill}`}>
              {statusInfo.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-bold text-foreground">{statusInfo.label}</p>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.pill}`}>
                  {billingStatus.plan_name ?? "No plan"}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {billingStatus.billing_cycle && `${billingStatus.billing_cycle} billing`}
                {billingStatus.current_period_end && (
                  <> · Renews {new Date(billingStatus.current_period_end).toLocaleDateString("en-GH")}</>
                )}
                {billingStatus.trial_ends_at && (
                  <> · Trial ends {new Date(billingStatus.trial_ends_at).toLocaleDateString("en-GH")}</>
                )}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${billingStatus.has_payment_method ? "text-primary" : "text-muted-foreground"}`}>
              <CreditCard className="h-3.5 w-3.5" />
              {billingStatus.has_payment_method ? "Card saved" : "No card"}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons (BillingClient handles payment/upgrade actions) */}
      <BillingClient billingStatus={billingStatus} />

      {/* Available plans */}
      {plans.length > 0 && (
        <section>
          <h2 className="text-[14px] font-bold text-foreground mb-3">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {plans.map((plan) => {
              const isCurrent = billingStatus?.plan_name === plan.name;
              const savings = Math.round(100 - (plan.price_ghs_annual / (plan.price_ghs_month * 12)) * 100);
              return (
                <div
                  key={plan.id}
                  className={`bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col gap-3 ${
                    isCurrent ? "border-2 border-primary" : "border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-foreground">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[11px] bg-primary/10 text-primary font-semibold px-2.5 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-[24px] font-bold text-foreground leading-none">
                      GHS {plan.price_ghs_month.toFixed(2)}
                      <span className="text-[13px] font-normal text-muted-foreground">/mo</span>
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      GHS {plan.price_ghs_annual.toFixed(2)}/yr · Save {savings}%
                    </p>
                  </div>
                  {plan.max_vehicles != null && (
                    <p className="text-[12px] text-muted-foreground">Up to {plan.max_vehicles} vehicles</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Invoice history */}
      {invoices.length > 0 && (
        <section>
          <h2 className="text-[14px] font-bold text-foreground mb-3">Invoice History</h2>
          <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  {["Period", "Cycle", "Amount", "Status", "Paid"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">
                      {new Date(inv.period_start).toLocaleDateString("en-GH")} →{" "}
                      {new Date(inv.period_end).toLocaleDateString("en-GH")}
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground capitalize">{inv.billing_cycle}</td>
                    <td className="px-5 py-3.5 text-[13px] font-semibold text-foreground">
                      GHS {inv.amount_ghs.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        inv.status === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : inv.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-muted-foreground">
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
        <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-12 text-center">
          <div className="rounded-2xl p-4 bg-primary/10 w-fit mx-auto mb-4">
            <CreditCard className="h-8 w-8 text-primary" />
          </div>
          <p className="text-[14px] font-semibold text-foreground/70">Could not load billing information</p>
          <p className="text-[12px] text-muted-foreground mt-1">Please refresh the page or contact support.</p>
        </div>
      )}
    </div>
  );
}
