"use client";

import { useActionState } from "react";
import { saveCompanySettings, type SaveSettingsState } from "./actions";

export default function BrandColorForm({
  currentColor,
}: {
  currentColor: string | null;
}) {
  const [state, action, pending] = useActionState<SaveSettingsState, FormData>(
    saveCompanySettings,
    undefined
  );

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
          Settings saved.
        </p>
      )}

      <div className="flex items-end gap-4">
        <div>
          <label
            htmlFor="brand_color"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Brand colour
          </label>
          <div className="flex items-center gap-3">
            <input
              id="brand_color"
              name="brand_color"
              type="color"
              defaultValue={currentColor ?? "#18181b"}
              className="h-10 w-16 rounded-md border border-zinc-300 cursor-pointer p-0.5"
            />
            <span className="text-sm text-zinc-500">
              Choose the colour shown on passenger tickets
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
