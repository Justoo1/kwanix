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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Corporate Accounts</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage business clients with credit limits and bulk booking.
          </p>
        </div>
      </div>

      <CorporateClient initialAccounts={accounts} />

      {accounts.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <BadgeDollarSign className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
          <p className="text-sm font-semibold text-zinc-600">No corporate accounts yet</p>
          <p className="text-xs text-zinc-400 mt-1">
            Add your first corporate client to enable bulk booking and credit management.
          </p>
        </div>
      )}
    </div>
  );
}
