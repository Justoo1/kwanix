import type { Metadata } from "next";
import Link from "next/link";
import PublicNav from "@/components/public-nav";
import CompanySearch from "./company-search";

export const metadata: Metadata = {
  title: "RoutePass — Book Your Bus Ticket Online",
  description:
    "Find and book bus tickets across Ghana's transport companies. Pay securely online.",
};

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

interface PublicCompanyResult {
  id: number;
  name: string;
  company_code: string;
  brand_color: string | null;
  logo_url: string | null;
}

async function getCompanies(): Promise<PublicCompanyResult[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/companies`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const companies = await getCompanies();

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <PublicNav />

      {/* Hero */}
      <section className="bg-white border-b border-zinc-100 py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-4">
            Ghana&apos;s bus ticketing platform
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 tracking-tight leading-tight">
            Book your bus ticket{" "}
            <span className="text-emerald-600">online</span>
          </h1>
          <p className="mt-4 text-lg text-zinc-500 max-w-lg mx-auto">
            Search routes across all transport companies and pay securely with
            card or Mobile Money.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/discover"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              Search routes
            </Link>
            <Link
              href="/track"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Track a parcel
            </Link>
          </div>
        </div>
      </section>

      {/* Company grid with search */}
      <section className="max-w-6xl mx-auto px-4 py-14 w-full">
        {companies.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-sm">
              No companies listed yet. Check back soon.
            </p>
          </div>
        ) : (
          <CompanySearch companies={companies} />
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-400">
          <span>© {new Date().getFullYear()} RoutePass</span>
          <div className="flex gap-4">
            <Link href="/discover" className="hover:text-zinc-700">Find a trip</Link>
            <Link href="/login" className="hover:text-zinc-700">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
