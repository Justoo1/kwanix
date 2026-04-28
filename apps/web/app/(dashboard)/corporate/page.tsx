import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeDollarSign } from "lucide-react";

import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import CorporateClient from "./CorporateClient";

export const metadata: Metadata = { title: "Corporate Accounts — Kwanix" };

export interface CorporateAccount {
  id: number;
  company_id: number;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  credit_limit_ghs: number;
  credit_used_ghs: number;
  credit_available_ghs: number;
  notes: string | null;
  is_active: boolean;
}

export default async function CorporatePage() {
  const session = await getSession();
  if (!session || !["company_admin", "super_admin"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  let accounts: CorporateAccount[] = [];
  try {
    accounts = await apiFetch<CorporateAccount[]>("/api/v1/corporate?active_only=false&limit=100");
  } catch {
    // render empty
  }

  const totalCredit = accounts.reduce((s, a) => s + a.credit_limit_ghs, 0);
  const totalUsed = accounts.reduce((s, a) => s + a.credit_used_ghs, 0);
  const activeCount = accounts.filter((a) => a.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Corporate Accounts</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Manage business clients with credit limits and bulk booking.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3.5">
        <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1.5">Total Accounts</div>
          <div className="text-[28px] font-bold text-foreground leading-none">{accounts.length}</div>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1.5">Active</div>
          <div className="text-[28px] font-bold text-primary leading-none">{activeCount}</div>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground mb-1.5">Credit Used</div>
          <div className="text-[28px] font-bold text-amber-600 leading-none">
            GHS {totalUsed.toFixed(0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">of GHS {totalCredit.toFixed(0)} total</div>
        </div>
      </div>

      <CorporateClient initialAccounts={accounts} />

      {accounts.length === 0 && (
        <div className="bg-card rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-12 text-center">
          <div className="rounded-2xl p-4 bg-primary/10 w-fit mx-auto mb-4">
            <BadgeDollarSign className="h-8 w-8 text-primary" />
          </div>
          <p className="text-[14px] font-semibold text-foreground/70">No corporate accounts yet</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Add your first corporate client to enable bulk booking and credit management.
          </p>
        </div>
      )}
    </div>
  );
}
