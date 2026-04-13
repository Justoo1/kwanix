"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bus, UserPlus } from "lucide-react";
import { clientFetch } from "@/lib/client-api";
import type { UserResponse } from "@/lib/definitions";

interface DriversClientProps {
  drivers: UserResponse[];
  canManage: boolean;
}

interface InviteForm {
  full_name: string;
  phone: string;
  email: string;
}

type UserCreateResponse = UserResponse & { temp_password?: string | null };

const BLANK_FORM: InviteForm = { full_name: "", phone: "", email: "" };

export default function DriversClient({ drivers: initialDrivers, canManage }: DriversClientProps) {
  const router = useRouter();
  const [drivers, setDrivers] = useState(initialDrivers);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<InviteForm>(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<UserCreateResponse | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<UserResponse | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await clientFetch<UserCreateResponse>("admin/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name,
          phone: form.phone,
          email: form.email || undefined,
          role: "driver",
        }),
      });
      setCreatedResult(result);
      setForm(BLANK_FORM);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create driver.");
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setCreatedResult(null);
    setFormError(null);
    setForm(BLANK_FORM);
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await clientFetch(`admin/users/${deactivateTarget.id}/deactivate`, { method: "PATCH" });
      setDrivers((prev) => prev.map((d) => d.id === deactivateTarget.id ? { ...d, is_active: false } : d));
      setDeactivateTarget(null);
      router.refresh();
    } catch {
      /* ignore — page will refresh anyway */
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Drivers</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Driver accounts for your company.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Driver
          </button>
        )}
      </div>

      {/* Driver list */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            All drivers
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({drivers.length})
            </span>
          </h2>
        </div>

        {drivers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-400">
            <Bus className="h-10 w-10 text-zinc-300" />
            <p className="text-sm">No drivers yet. Add your first driver to get started.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Phone</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                {canManage && <th className="px-6 py-3 text-left font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {drivers.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4 font-medium text-zinc-900">{d.full_name}</td>
                  <td className="px-6 py-4 text-zinc-600">{d.phone}</td>
                  <td className="px-6 py-4 text-zinc-500">{d.email ?? "—"}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {d.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-6 py-4">
                      {d.is_active && (
                        <button
                          onClick={() => setDeactivateTarget(d)}
                          className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add driver modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900">Add Driver</h2>

            {createdResult ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-700">
                  Driver <strong>{createdResult.full_name}</strong> created successfully.
                </p>
                {createdResult.temp_password && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                      Temporary password — share securely
                    </p>
                    <p className="font-mono text-base font-bold text-amber-900 select-all">
                      {createdResult.temp_password}
                    </p>
                    <p className="text-xs text-amber-700">
                      This password will not be shown again.
                    </p>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={closeModal}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                {formError && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Full name</label>
                  <input
                    type="text"
                    required
                    placeholder="Kwame Mensah"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="+233241234567"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Email <span className="text-zinc-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="kwame@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  A temporary password will be auto-generated.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? "Creating…" : "Create driver"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Deactivate confirmation */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeactivateTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Deactivate driver?</h2>
            <p className="text-sm text-zinc-600">
              <strong>{deactivateTarget.full_name}</strong> will lose access immediately.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeactivateTarget(null)}
                disabled={deactivating}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deactivating ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
