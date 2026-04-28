"use client";

import { useState } from "react";
import { Plus, Edit2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CorporateAccount {
  id: number;
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

interface Props {
  initialAccounts: CorporateAccount[];
}

export default function CorporateClient({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    credit_limit_ghs: "",
    notes: "",
  });

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/proxy/corporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          contact_name: form.contact_name || null,
          contact_phone: form.contact_phone || null,
          contact_email: form.contact_email || null,
          credit_limit_ghs: parseFloat(form.credit_limit_ghs) || 0,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "Failed to create account");
      setAccounts((prev) => [data, ...prev]);
      setShowForm(false);
      setForm({ name: "", contact_name: "", contact_phone: "", contact_email: "", credit_limit_ghs: "", notes: "" });
      toast.success(`${data.name} created`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error creating account");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(acc: CorporateAccount) {
    try {
      const res = await fetch(`/api/proxy/corporate/${acc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !acc.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail ?? "Failed to update");
      setAccounts((prev) => prev.map((a) => (a.id === acc.id ? data : a)));
      toast.success(data.is_active ? "Account activated" : "Account deactivated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error updating account");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Account
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createAccount}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-semibold text-zinc-700">New Corporate Account</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-600">Company Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Acme Ltd"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Contact Name</label>
              <input
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Contact Phone</label>
              <input
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="0244000000"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="john@acme.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Credit Limit (GHS)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.credit_limit_ghs}
                onChange={(e) => setForm((f) => ({ ...f, credit_limit_ghs: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="5000.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      )}

      {accounts.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Contact</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Credit Limit</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Used</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Available</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {accounts.map((acc) => (
                <tr key={acc.id} className={!acc.is_active ? "opacity-50" : undefined}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-zinc-800">{acc.name}</p>
                    {acc.notes && <p className="text-xs text-zinc-400 mt-0.5">{acc.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    <p>{acc.contact_name ?? "—"}</p>
                    <p className="text-zinc-400">{acc.contact_phone ?? acc.contact_email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-zinc-700">
                    GHS {acc.credit_limit_ghs.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    GHS {acc.credit_used_ghs.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-emerald-700">
                    GHS {acc.credit_available_ghs.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    {acc.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                        <XCircle className="h-3.5 w-3.5" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(acc)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
                      title={acc.is_active ? "Deactivate" : "Activate"}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
