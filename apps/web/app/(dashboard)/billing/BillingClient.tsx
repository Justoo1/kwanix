"use client";

import { useState } from "react";
import { Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

interface SubscriptionStatus {
  subscription_status: string;
  has_payment_method: boolean;
  plan_name: string | null;
}

interface Props {
  billingStatus: SubscriptionStatus | null;
}

export default function BillingClient({ billingStatus }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handlePayNow() {
    setLoading("pay");
    try {
      const res = await fetch("/api/proxy/billing/pay", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "Payment failed");

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data.status === "paid") {
        toast.success("Payment successful!");
        window.location.reload();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel subscription? You will retain access until the current period ends.")) return;
    setLoading("cancel");
    try {
      const res = await fetch("/api/proxy/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "Cancellation failed");
      toast.success(data.message ?? "Subscription cancelled");
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cancellation failed");
    } finally {
      setLoading(null);
    }
  }

  if (!billingStatus) return null;

  const canPay = billingStatus.plan_name != null;
  const canCancel = !["suspended", "cancelled"].includes(billingStatus.subscription_status);

  return (
    <div className="flex gap-3 flex-wrap">
      {canPay && (
        <button
          disabled={loading === "pay"}
          onClick={handlePayNow}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading === "pay" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
          {billingStatus.has_payment_method ? "Pay Now" : "Add Payment Method"}
        </button>
      )}
      {canCancel && (
        <button
          disabled={loading === "cancel"}
          onClick={handleCancel}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />}
          Cancel Subscription
        </button>
      )}
    </div>
  );
}
