"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";

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
    <div className="space-y-8">
      {companies.length > 4 && (
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
          <input
            type="search"
            placeholder="Search companies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl pl-11 pr-4 py-3 text-sm bg-card text-foreground placeholder:text-muted-foreground border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200"
            style={{ fontFamily: "var(--font-inter)" }}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm font-medium text-muted-foreground mb-2" style={{ fontFamily: "var(--font-inter)" }}>
            No companies match &ldquo;{query}&rdquo;
          </p>
          <button
            onClick={() => setQuery("")}
            className="text-xs font-semibold text-primary hover:opacity-70 transition-opacity"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((c) => {
            const accentColor = c.brand_color ?? "var(--primary)";
            const initials = c.name.slice(0, 2).toUpperCase();
            return (
              <Link
                key={c.id}
                href={`/c/${c.company_code}`}
                className="group flex flex-col bg-card rounded-2xl p-6 hover:scale-[1.01] transition-all duration-200"
                style={{
                  borderLeft: `3px solid ${accentColor}`,
                  boxShadow: "0 4px 24px -4px rgba(13, 31, 23, 0.08)",
                }}
              >
                <div className="flex items-center gap-3 mb-5">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.logo_url}
                      alt={c.name}
                      className="h-10 w-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: accentColor }}
                    >
                      {initials}
                    </div>
                  )}
                  <div>
                    <p
                      className="font-semibold leading-snug text-foreground"
                      style={{ fontFamily: "var(--font-jakarta)" }}
                    >
                      {c.name}
                    </p>
                    <p
                      className="text-xs mt-0.5 text-muted-foreground"
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      {c.company_code.toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-1">
                  <span
                    className="text-sm font-semibold text-primary group-hover:opacity-70 transition-opacity"
                    style={{ fontFamily: "var(--font-jakarta)" }}
                  >
                    View trips
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
