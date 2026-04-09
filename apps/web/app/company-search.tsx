"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

interface PublicCompanyResult {
  id: number;
  name: string;
  company_code: string;
  brand_color: string | null;
  logo_url: string | null;
}

export default function CompanySearch({
  companies,
}: {
  companies: PublicCompanyResult[];
}) {
  const [query, setQuery] = useState("");

  const filtered =
    query.trim() === ""
      ? companies
      : companies.filter((c) =>
          c.name.toLowerCase().includes(query.toLowerCase().trim())
        );

  return (
    <div className="space-y-5">
      {/* Header row: title + count + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-baseline gap-2 flex-1">
          <h2 className="text-xl font-semibold text-zinc-900">
            Transport companies
          </h2>
          <span className="text-sm text-zinc-400">
            {query.trim()
              ? `${filtered.length} of ${companies.length}`
              : `(${companies.length})`}
          </span>
        </div>

        {companies.length > 4 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Search companies…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            />
          </div>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-zinc-200 bg-white">
          <p className="text-zinc-500 text-sm font-medium">
            No companies match &ldquo;{query}&rdquo;
          </p>
          <button
            onClick={() => setQuery("")}
            className="mt-2 text-xs text-emerald-700 hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const color = c.brand_color ?? "#e4e4e7";
            const initials = c.name.slice(0, 2).toUpperCase();
            return (
              <Link
                key={c.id}
                href={`/c/${c.company_code}`}
                className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-5 hover:shadow-md transition-all"
                style={{ borderTop: `4px solid ${color}` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      className="h-9 w-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {initials}
                    </div>
                  )}
                  <span className="font-semibold text-zinc-900 leading-snug">
                    {c.name}
                  </span>
                </div>
                <p className="mt-auto text-xs text-emerald-700 font-medium group-hover:underline">
                  View trips →
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
