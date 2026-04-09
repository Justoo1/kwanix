"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { clientFetch } from "@/lib/client-api";
import type { UserResponse, UserRole } from "@/lib/definitions";

interface StationOption {
  id: number;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  station_manager: "Station Manager",
  station_clerk: "Station Clerk",
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "company_admin", label: "Company Admin" },
  { value: "station_manager", label: "Station Manager" },
  { value: "station_clerk", label: "Station Clerk" },
];

type UserCreateResponse = UserResponse & { temp_password?: string | null };

interface InviteForm {
  full_name: string;
  phone: string;
  email: string;
  role: string;
  station_id: string;
}

const BLANK_FORM: InviteForm = {
  full_name: "",
  phone: "",
  email: "",
  role: "station_clerk",
  station_id: "",
};

export default function UsersClient({
  users: initialUsers,
  viewerRole,
  stations = [],
}: {
  users: UserResponse[];
  viewerRole: UserRole;
  stations?: StationOption[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<InviteForm>(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<UserCreateResponse | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<UserResponse | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const [activateTarget, setActivateTarget] = useState<UserResponse | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<UserResponse | null>(null);
  const [assignStationId, setAssignStationId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const canInvite = viewerRole === "company_admin";

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
          role: form.role,
          station_id: form.station_id ? parseInt(form.station_id, 10) : undefined,
        }),
      });
      setCreatedResult(result);
      setForm(BLANK_FORM);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create user.");
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
    setDeactivateError(null);
    try {
      await clientFetch(`admin/users/${deactivateTarget.id}/deactivate`, { method: "PATCH" });
      setDeactivateTarget(null);
      router.refresh();
    } catch (err) {
      setDeactivateError(err instanceof Error ? err.message : "Failed to deactivate user.");
    } finally {
      setDeactivating(false);
    }
  }

  async function handleActivate() {
    if (!activateTarget) return;
    setActivating(true);
    setActivateError(null);
    try {
      await clientFetch(`admin/users/${activateTarget.id}/activate`, { method: "PATCH" });
      setActivateTarget(null);
      router.refresh();
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : "Failed to activate user.");
    } finally {
      setActivating(false);
    }
  }

  async function handleAssign() {
    if (!assignTarget) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await clientFetch(`admin/users/${assignTarget.id}/station`, {
        method: "PATCH",
        body: JSON.stringify({
          station_id: assignStationId ? parseInt(assignStationId, 10) : null,
        }),
      });
      setAssignTarget(null);
      setAssignStationId("");
      router.refresh();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign station.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Users</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {viewerRole === "super_admin"
              ? "All platform users across all companies."
              : "Manage staff accounts for your company."}
          </p>
        </div>
        {canInvite && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Invite User
          </button>
        )}
      </div>

      {/* User list */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-medium text-zinc-800">
            All users
            <span className="ml-2 text-sm font-normal text-zinc-400">
              ({initialUsers.length})
            </span>
          </h2>
        </div>

        {initialUsers.length === 0 ? (
          <p className="px-6 py-8 text-sm text-zinc-400 text-center">No users yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Phone</th>
                <th className="px-6 py-3 text-left font-medium">Role</th>
                {viewerRole === "super_admin" && (
                  <th className="px-6 py-3 text-left font-medium">Company ID</th>
                )}
                <th className="px-6 py-3 text-left font-medium">Status</th>
                {canInvite && (
                  <th className="px-6 py-3 text-left font-medium"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {initialUsers.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-zinc-900">{u.full_name}</div>
                    {u.email && (
                      <div className="text-xs text-zinc-400">{u.email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-600">{u.phone}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  {viewerRole === "super_admin" && (
                    <td className="px-6 py-4 text-zinc-500">{u.company_id ?? "—"}</td>
                  )}
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canInvite && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setAssignError(null);
                            setAssignStationId(u.station_id ? String(u.station_id) : "");
                            setAssignTarget(u);
                          }}
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
                        >
                          Assign station
                        </button>
                        {u.is_active ? (
                          <button
                            onClick={() => {
                              setDeactivateError(null);
                              setDeactivateTarget(u);
                            }}
                            className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActivateError(null);
                              setActivateTarget(u);
                            }}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Invite modal ──────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900">Invite User</h2>

            {/* Success — show temp password */}
            {createdResult ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-700">
                  User <strong>{createdResult.full_name}</strong> created successfully.
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
                      This password will not be shown again. Ask the user to change it after first login.
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Role</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Station ID <span className="text-zinc-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Leave blank for company-wide"
                      value={form.station_id}
                      onChange={(e) => setForm({ ...form, station_id: e.target.value })}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                  A temporary password will be auto-generated. You will see it once after creation.
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
                    {submitting ? "Creating…" : "Create user"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Deactivate confirmation ───────────────────────────────────────────── */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeactivateTarget(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Deactivate user?</h2>
            <p className="text-sm text-zinc-600">
              <strong>{deactivateTarget.full_name}</strong> will lose access immediately.
              This can be reversed by a company admin.
            </p>
            {deactivateError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deactivateError}
              </p>
            )}
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

      {/* ── Assign station dialog ────────────────────────────────────────────── */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAssignTarget(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Assign station</h2>
            <p className="text-sm text-zinc-600">
              Select a station for <strong>{assignTarget.full_name}</strong>, or clear to unassign.
            </p>
            <select
              value={assignStationId}
              onChange={(e) => setAssignStationId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="">— No station —</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {assignError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {assignError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAssignTarget(null)}
                disabled={assigning}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {assigning ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Activate confirmation ─────────────────────────────────────────────── */}
      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setActivateTarget(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Activate user?</h2>
            <p className="text-sm text-zinc-600">
              <strong>{activateTarget.full_name}</strong> will regain access immediately.
            </p>
            {activateError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {activateError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActivateTarget(null)}
                disabled={activating}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {activating ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
