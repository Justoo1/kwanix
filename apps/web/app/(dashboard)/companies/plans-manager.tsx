"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Plan {
  id: number;
  name: string;
  max_vehicles: number | null;
  price_ghs_month: number;
  price_ghs_annual: number;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_FORM = {
  name: "",
  max_vehicles: "",
  price_ghs_month: "",
  annual_discount_pct: "8",   // default 8% off annual
  price_ghs_annual: "",
  sort_order: "0",
};

function calcAnnual(monthlyStr: string, discountStr: string): string {
  const monthly = parseFloat(monthlyStr);
  const discount = parseFloat(discountStr);
  if (isNaN(monthly) || monthly <= 0) return "";
  const pct = isNaN(discount) ? 0 : Math.min(Math.max(discount, 0), 100);
  return String(Math.round(monthly * 12 * (1 - pct / 100)));
}

export default function PlansManager() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["admin", "plans"],
    queryFn: () => clientFetch<Plan[]>("admin/plans"),
    staleTime: 60_000,
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(plan: Plan) {
    // Back-calculate discount from stored prices
    const monthly = plan.price_ghs_month;
    const annual = plan.price_ghs_annual;
    const impliedDiscount =
      monthly > 0 ? Math.round((1 - annual / (monthly * 12)) * 100) : 0;

    setForm({
      name: plan.name,
      max_vehicles: plan.max_vehicles === null ? "" : String(plan.max_vehicles),
      price_ghs_month: String(monthly),
      annual_discount_pct: String(Math.max(0, impliedDiscount)),
      price_ghs_annual: String(annual),
      sort_order: String(plan.sort_order),
    });
    setEditingId(plan.id);
    setShowForm(true);
    setError(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!form.name || !form.price_ghs_month || !form.price_ghs_annual) {
      return setError("Name and both prices are required.");
    }
    setSubmitting(true);
    setError(null);
    const body = {
      name: form.name,
      max_vehicles: form.max_vehicles === "" ? null : Number(form.max_vehicles),
      price_ghs_month: Number(form.price_ghs_month),
      price_ghs_annual: Number(form.price_ghs_annual),
      sort_order: Number(form.sort_order),
    };
    try {
      if (editingId) {
        await clientFetch(`admin/plans/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await clientFetch("admin/plans", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      await qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      cancelForm();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id: number) {
    if (!confirm("Deactivate this plan? Existing subscribers keep it until renewal.")) return;
    try {
      await clientFetch(`admin/plans/${id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to deactivate plan.");
    }
  }

  async function handleReactivate(id: number) {
    try {
      await clientFetch(`admin/plans/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
      await qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to reactivate plan.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Subscription Plans</CardTitle>
          <CardDescription>Manage the tiers companies can subscribe to.</CardDescription>
        </div>
        {!showForm && (
          <Button size="sm" onClick={openCreate}>+ New plan</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create / Edit form */}
        {showForm && (
          <div className="border rounded-lg p-4 space-y-4 bg-zinc-50">
            <p className="text-sm font-medium text-zinc-800">
              {editingId ? "Edit plan" : "New plan"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="plan-name">Plan name</Label>
                <Input
                  id="plan-name"
                  placeholder="Starter"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-vehicles">
                  Max vehicles <span className="text-zinc-400">(blank = unlimited)</span>
                </Label>
                <Input
                  id="plan-vehicles"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={form.max_vehicles}
                  onChange={(e) => setForm({ ...form, max_vehicles: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-monthly">Monthly price (GHS)</Label>
                <Input
                  id="plan-monthly"
                  type="number"
                  min={0}
                  placeholder="500"
                  value={form.price_ghs_month}
                  onChange={(e) => {
                    const monthly = e.target.value;
                    setForm({
                      ...form,
                      price_ghs_month: monthly,
                      price_ghs_annual: calcAnnual(monthly, form.annual_discount_pct),
                    });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-discount">
                  Annual discount <span className="text-zinc-400">(%)</span>
                </Label>
                <Input
                  id="plan-discount"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="8"
                  value={form.annual_discount_pct}
                  onChange={(e) => {
                    const pct = e.target.value;
                    setForm({
                      ...form,
                      annual_discount_pct: pct,
                      price_ghs_annual: calcAnnual(form.price_ghs_month, pct),
                    });
                  }}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Annual price (GHS) — auto-calculated</Label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm tabular-nums text-zinc-700">
                    {form.price_ghs_annual
                      ? Number(form.price_ghs_annual).toLocaleString()
                      : "—"}
                  </div>
                  {form.price_ghs_month && form.annual_discount_pct && (
                    <p className="text-xs text-zinc-400 shrink-0">
                      GHS {form.price_ghs_month}/mo × 12 − {form.annual_discount_pct}%
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="plan-sort">Display order</Label>
                <Input
                  id="plan-sort"
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving…" : editingId ? "Save changes" : "Create plan"}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelForm}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Plans table */}
        {isLoading && <p className="text-sm text-zinc-400 animate-pulse">Loading plans…</p>}
        {plans && plans.length === 0 && (
          <p className="text-sm text-zinc-500">No plans yet. Create one above.</p>
        )}
        {plans && plans.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="pb-2 pr-4 text-left font-medium">Name</th>
                  <th className="pb-2 pr-4 text-right font-medium">Max vehicles</th>
                  <th className="pb-2 pr-4 text-right font-medium">Monthly (GHS)</th>
                  <th className="pb-2 pr-4 text-right font-medium">Annual (GHS)</th>
                  <th className="pb-2 pr-4 text-center font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plans.map((plan) => (
                  <tr key={plan.id} className={plan.is_active ? "" : "opacity-50"}>
                    <td className="py-3 pr-4 font-medium text-zinc-900">{plan.name}</td>
                    <td className="py-3 pr-4 text-right text-zinc-600">
                      {plan.max_vehicles === null ? "Unlimited" : plan.max_vehicles}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-zinc-700">
                      {plan.price_ghs_month.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-zinc-700">
                      {plan.price_ghs_annual.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          plan.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {plan.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(plan)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        {plan.is_active ? (
                          <button
                            onClick={() => handleDeactivate(plan.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(plan.id)}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
