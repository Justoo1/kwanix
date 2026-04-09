"use client";

import { useActionState } from "react";
import { changePassword, type ChangePasswordState } from "./actions";

export default function ChangePasswordCard() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    undefined
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 max-w-lg">
      <h2 className="text-base font-medium text-zinc-800 mb-4">Change Password</h2>

      {state?.success && (
        <p className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 mb-4">
          Password changed successfully.
        </p>
      )}
      {state?.error && (
        <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
          {state.error}
        </p>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="current_password" className="block text-sm font-medium text-zinc-700 mb-1">
            Current password
          </label>
          <input
            id="current_password"
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label htmlFor="new_password" className="block text-sm font-medium text-zinc-700 mb-1">
            New password
          </label>
          <input
            id="new_password"
            name="new_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label htmlFor="confirm_password" className="block text-sm font-medium text-zinc-700 mb-1">
            Confirm new password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
