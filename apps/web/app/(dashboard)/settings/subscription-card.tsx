"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface Plan {
  id: number;
  name: string;
  max_vehicles: number | null;
  price_ghs_month: number;
  price_ghs_annual: number;
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useBillingStatus(initialStatus: SubscriptionStatus | null) {
  return useQuery<SubscriptionStatus>({
    queryKey: ["billing", "status"],
    queryFn: () => clientFetch<SubscriptionStatus>("billing/status"),
    initialData: initialStatus ?? undefined,
    staleTime: 60_000,
    retry: false,
    meta: { silent: true },
  });
}

function usePlans() {
  return useQuery<Plan[]>({
    queryKey: ["billing", "plans"],
    queryFn: () => clientFetch<Plan[]>("billing/plans"),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(s: SubscriptionStatus["subscription_status"]) {
  const map: Record<string, string> = {
    trialing: "bg-blue-100 text-blue-800",
    active: "bg-emerald-100 text-emerald-800",
    grace: "bg-amber-100 text-amber-800",
    suspended: "bg-red-100 text-red-800",
    cancelled: "bg-zinc-100 text-zinc-600",
  };
  const labels: Record<string, string> = {
    trialing: "Free Trial",
    active: "Active",
    grace: "Grace Period",
    suspended: "Suspended",
    cancelled: "Cancelled",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[s] ?? ""}`}>
      {labels[s] ?? s}
    </span>
  );
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SubscriptionCard({
  initialStatus,
}: {
  initialStatus: SubscriptionStatus | null;
}) {
  const qc = useQueryClient();
  const { data: billing, isLoading } = useBillingStatus(initialStatus);
  const { data: plans } = usePlans();

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [billingEmail, setBillingEmail] = useState(billing?.billing_email ?? "");
  const [accountType, setAccountType] = useState<"bank" | "momo">("bank");
  const [bankCode, setBankCode] = useState("");
  const [momoNetwork, setMomoNetwork] = useState("MTN");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSubaccountForm, setShowSubaccountForm] = useState(false);

  if (isLoading || !billing) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="py-6">
          <p className="text-sm text-zinc-400 animate-pulse">Loading subscription…</p>
        </CardContent>
      </Card>
    );
  }

  const trialDays = daysUntil(billing.trial_ends_at);
  const periodDays = daysUntil(billing.current_period_end);
  const isExpiringSoon =
    (billing.subscription_status === "trialing" && trialDays !== null && trialDays <= 7) ||
    (billing.subscription_status === "active" && periodDays !== null && periodDays <= 7);

  async function handleSelectPlan() {
    if (!selectedPlanId) return setError("Select a plan first.");
    if (!billingEmail) return setError("Billing email is required.");
    setSubmitting(true);
    setError(null);
    try {
      await clientFetch("billing/select-plan", {
        method: "POST",
        body: JSON.stringify({ plan_id: selectedPlanId, billing_cycle: billingCycle, billing_email: billingEmail }),
      });
      await qc.invalidateQueries({ queryKey: ["billing", "status"] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to select plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayNow() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await clientFetch<{ checkout_url?: string; status?: string }>("billing/pay", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        await qc.invalidateQueries({ queryKey: ["billing", "status"] });
        await qc.invalidateQueries({ queryKey: ["billing", "invoices"] });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetupSubaccount() {
    if (!accountNumber || !accountName) return setError("Account number and name are required.");
    if (accountType === "bank" && !bankCode) return setError("Bank code is required.");
    setSubmitting(true);
    setError(null);
    const resolvedBankCode = accountType === "momo" ? momoNetwork : bankCode;
    try {
      await clientFetch("billing/setup-subaccount", {
        method: "POST",
        body: JSON.stringify({ bank_code: resolvedBankCode, account_number: accountNumber, account_name: accountName }),
      });
      await qc.invalidateQueries({ queryKey: ["billing", "status"] });
      setShowSubaccountForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to link account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your subscription? You'll retain access until the end of the current period.")) return;
    setSubmitting(true);
    try {
      await clientFetch("billing/cancel", { method: "POST", body: JSON.stringify({}) });
      await qc.invalidateQueries({ queryKey: ["billing", "status"] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cancel.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          Subscription &amp; Billing
          {statusBadge(billing.subscription_status)}
        </CardTitle>
        <CardDescription>
          Manage your Kwanix subscription plan and payment details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Status summary */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm space-y-1">
          {billing.plan_name && (
            <p><span className="font-medium">Plan:</span> {billing.plan_name} ({billing.billing_cycle})</p>
          )}
          {billing.subscription_status === "trialing" && trialDays !== null && (
            <p className={trialDays <= 7 ? "text-amber-700 font-medium" : ""}>
              Trial ends {fmt(billing.trial_ends_at)} ({trialDays} day{trialDays !== 1 ? "s" : ""} left)
            </p>
          )}
          {billing.subscription_status === "active" && billing.current_period_end && (
            <p className={isExpiringSoon ? "text-amber-700 font-medium" : ""}>
              Next renewal: {fmt(billing.current_period_end)}
            </p>
          )}
          {billing.subscription_status === "grace" && (
            <p className="text-amber-700 font-semibold">
              Your subscription has expired. You have a 4-day grace period to pay before access is suspended.
            </p>
          )}
          {billing.subscription_status === "suspended" && (
            <p className="text-red-700 font-semibold">
              Access suspended. Select a plan and pay below to reactivate.
            </p>
          )}
          {billing.max_vehicles !== null && (
            <p><span className="font-medium">Vehicle limit:</span> {billing.max_vehicles}</p>
          )}
          {billing.has_subaccount && (
            <p className="text-emerald-700">✓ Bank account linked — ticket revenue flows directly to you</p>
          )}
        </div>

        {/* Plan selector — shown when not active or when in grace/suspended */}
        {billing.subscription_status !== "active" && plans && plans.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-zinc-700">Choose a plan</p>

            {/* Billing cycle toggle */}
            <div className="flex gap-2">
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setBillingCycle(c)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    billingCycle === c
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {c === "monthly" ? "Monthly" : "Annual (save ~8%)"}
                </button>
              ))}
            </div>

            {/* Plan cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => {
                const price = billingCycle === "annual" ? plan.price_ghs_annual : plan.price_ghs_month;
                const isSelected = selectedPlanId === plan.id;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-lg border-2 p-4 text-left transition-colors ${
                      isSelected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    <p className="font-semibold text-zinc-900">{plan.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {plan.max_vehicles === null ? "Unlimited" : `Up to ${plan.max_vehicles}`} vehicles
                    </p>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      GHS {price.toLocaleString()}
                      <span className="text-xs font-normal text-zinc-500">
                        /{billingCycle === "annual" ? "yr" : "mo"}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Billing email */}
            <div className="space-y-1.5">
              <Label htmlFor="billing-email">Billing email</Label>
              <Input
                id="billing-email"
                type="email"
                placeholder="billing@yourcompany.com"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <Button onClick={handleSelectPlan} disabled={submitting || !selectedPlanId}>
              {submitting ? "Saving…" : "Save plan selection"}
            </Button>
          </div>
        )}

        {/* Pay Now */}
        {billing.plan_name !== null && billing.subscription_status !== "active" && (
          <div className="flex items-center gap-3">
            <Button onClick={handlePayNow} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? "Processing…" : billing.has_payment_method ? "Pay Now" : "Set up payment & pay"}
            </Button>
            {!billing.has_payment_method && (
              <p className="text-xs text-zinc-500">You&apos;ll be redirected to Paystack to enter card or MoMo details.</p>
            )}
          </div>
        )}

        {/* Bank account / subaccount setup */}
        {!billing.has_subaccount && (
          <div>
            {!showSubaccountForm ? (
              <button
                onClick={() => setShowSubaccountForm(true)}
                className="text-sm text-blue-600 hover:underline"
              >
                + Link account to receive ticket revenue
              </button>
            ) : (
              <div className="space-y-4 border rounded-lg p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-700">Link payout account</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Online ticket payments go 100% to this account. Kwanix only charges your subscription fee.
                  </p>
                </div>

                {/* Bank / MoMo toggle */}
                <div className="flex gap-2">
                  {(["bank", "momo"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setAccountType(t);
                        setAccountNumber("");
                        setAccountName("");
                        setBankCode("");
                      }}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        accountType === t
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {t === "bank" ? "Bank account" : "Mobile Money"}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {accountType === "bank" ? (
                    <div className="space-y-1">
                      <Label htmlFor="bank-code">
                        Bank code{" "}
                        <a
                          href="https://paystack.com/gh/bank-codes"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline text-xs"
                        >
                          (find code)
                        </a>
                      </Label>
                      <Input
                        id="bank-code"
                        placeholder="e.g. GCB"
                        value={bankCode}
                        onChange={(e) => setBankCode(e.target.value.toUpperCase())}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label htmlFor="momo-network">Network</Label>
                      <select
                        id="momo-network"
                        value={momoNetwork}
                        onChange={(e) => setMomoNetwork(e.target.value)}
                        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                      >
                        <option value="MTN">MTN Mobile Money</option>
                        <option value="VOD">Vodafone Cash</option>
                        <option value="ATL">AirtelTigo Money</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="account-number">
                      {accountType === "momo" ? "MoMo number" : "Account number"}
                    </Label>
                    <Input
                      id="account-number"
                      placeholder={accountType === "momo" ? "0241234567" : "0123456789"}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="account-name">
                      {accountType === "momo" ? "Registered name" : "Account name"}
                    </Label>
                    <Input
                      id="account-name"
                      placeholder="STC Ghana Ltd"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSetupSubaccount} disabled={submitting}>
                    {submitting ? "Linking…" : "Link account"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowSubaccountForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cancel subscription */}
        {billing.subscription_status === "active" && (
          <button
            onClick={handleCancel}
            disabled={submitting}
            className="text-xs text-zinc-400 hover:text-red-600 transition-colors"
          >
            Cancel subscription
          </button>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
