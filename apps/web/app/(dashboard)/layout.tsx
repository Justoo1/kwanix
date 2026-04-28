import Link from "next/link";
import { redirect } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import Sidebar, { MobileNav } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";

interface SubscriptionStatus {
  subscription_status: "trialing" | "active" | "grace" | "suspended" | "cancelled";
  current_period_end: string | null;
  trial_ends_at: string | null;
}

function SubscriptionBanner({ status }: { status: SubscriptionStatus }) {
  const s = status.subscription_status;
  if (s !== "grace" && s !== "suspended") return null;

  const isGrace = s === "grace";
  const end = status.current_period_end ?? status.trial_ends_at;
  // eslint-disable-next-line react-hooks/purity -- Server Component, runs once per request
  const now = Date.now();
  const daysLeft = end
    ? Math.max(0, Math.ceil((new Date(end).getTime() + 4 * 86400_000 - now) / 86400_000))
    : null;

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${
        isGrace
          ? "bg-amber-500 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      <span>
        {isGrace
          ? `Your subscription has expired. ${daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left in grace period.` : ""} Pay now to avoid suspension.`
          : "Access suspended — subscription payment required."}
      </span>
      <Link
        href="/settings"
        className="ml-4 shrink-0 underline hover:no-underline"
      >
        Go to Billing →
      </Link>
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const isCompanyAdmin = session.user.role === "company_admin";
  const subscriptionStatus = isCompanyAdmin
    ? await apiFetch<SubscriptionStatus>("/api/v1/billing/status").catch(() => null)
    : null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar role={session.user.role} userName={session.user.full_name ?? ""} />

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar + drawer — hidden on desktop */}
        <MobileNav role={session.user.role} userName={session.user.full_name ?? ""} />

        {/* Desktop top bar — hidden on mobile */}
        <div className="hidden md:block">
          <TopBar />
        </div>

        {/* Subscription warning banner */}
        {subscriptionStatus && <SubscriptionBanner status={subscriptionStatus} />}

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
