"use client";

import { useActionState } from "react";

import { createCompany } from "./actions";

export default function CreateCompanyForm() {
  const [state, action, pending] = useActionState(createCompany, undefined);

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Company name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Accra Express Ltd"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>

        <div>
          <label
            htmlFor="company_code"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Company code
          </label>
          <input
            id="company_code"
            name="company_code"
            type="text"
            required
            maxLength={10}
            placeholder="ACCEXP"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>

        <div>
          <label
            htmlFor="subdomain"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Subdomain{" "}
            <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            id="subdomain"
            name="subdomain"
            type="text"
            placeholder="accra-express"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating…" : "Create company"}
        </button>
      </div>
    </form>
  );
}
