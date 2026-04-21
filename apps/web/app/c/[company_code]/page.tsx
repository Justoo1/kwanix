import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import TripsSection from "./trips-section";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ company_code: string }>;
}): Promise<Metadata> {
  const { company_code } = await params;
  const companies = await getCompanies();
  const company = companies.find(c => c.company_code === company_code);
  if (!company) return { title: "Company not found — Kwanix" };
  return {
    title: `${company.name} Trips — Kwanix`,
    description: `Browse and book upcoming trips with ${company.name}.`,
  };
}

export default async function CompanyTripsPage({
  params,
}: {
  params: Promise<{ company_code: string }>;
}) {
  const { company_code } = await params;
  const companies = await getCompanies();
  const company = companies.find(c => c.company_code === company_code);
  if (!company) notFound();

  const color = company.brand_color ?? "#18181b";
  const initials = company.name.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fff8f7" }}>
      {/* Sticky glassmorphism header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.04)]"
        style={{ backgroundColor: "rgba(255,248,247,0.85)" }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-5 flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-black italic tracking-tight"
            style={{ color }}
          >
            Kwanix
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-zinc-500">
            <Link
              href={`/c/${company_code}`}
              className="border-b-2 pb-0.5 transition-opacity"
              style={{ color, borderColor: color }}
            >
              Trips
            </Link>
            <Link href="/" className="hover:opacity-60 transition-opacity">
              All Companies
            </Link>
          </nav>
          <Link
            href="/login"
            className="text-sm font-bold text-zinc-600 hover:opacity-60 transition-opacity"
          >
            Sign in →
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 py-12 pb-32 md:pb-16">
        {/* Company header */}
        <section className="mb-12 space-y-4">
          <nav className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Link href="/" className="hover:opacity-60 transition-opacity">
              All companies
            </Link>
            <span>›</span>
            <span style={{ color }}>{company.name}</span>
          </nav>

          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm overflow-hidden bg-white">
              {company.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.logo_url}
                  alt={company.name}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-black text-lg"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-zinc-900 tracking-tight">
                {company.name}
              </h1>
              <p className="text-zinc-500 font-medium text-sm mt-0.5">
                Daily bus services across Ghana
              </p>
            </div>
          </div>
        </section>

        {/* Trips section (client) — includes date filter + cards */}
        <Suspense
          fallback={
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="rounded-[32px] bg-white h-32 animate-pulse shadow-[0_8px_48px_rgba(0,0,0,0.04)]"
                />
              ))}
            </div>
          }
        >
          <TripsSection companyCode={company_code} brandColor={color} />
        </Suspense>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-end pb-6 pt-3 px-4 backdrop-blur-xl rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.06)]"
        style={{ backgroundColor: "rgba(255,248,247,0.92)" }}
      >
        <Link
          href="/"
          className="flex flex-col items-center gap-1 text-zinc-400 px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
          </svg>
          Explore
        </Link>
        <Link
          href={`/c/${company_code}`}
          className="flex flex-col items-center gap-1 text-white rounded-full px-6 py-2 -translate-y-1 text-[11px] font-bold uppercase tracking-wider shadow-lg"
          style={{ backgroundColor: color }}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 6H4c-1.1 0-2 .9-2 2v3h20V8c0-1.1-.9-2-2-2zm-8 9H4v3h8v-3zm8 0h-6v3h6v-3z" />
          </svg>
          Trips
        </Link>
        <Link
          href="/login"
          className="flex flex-col items-center gap-1 text-zinc-400 px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          Profile
        </Link>
      </nav>

      <footer className="hidden md:block border-t border-zinc-100 bg-white">
        <div className="max-w-7xl mx-auto px-8 py-5 text-xs text-zinc-400 flex justify-between">
          <span>© {new Date().getFullYear()} Kwanix</span>
          <Link href="/" className="hover:text-zinc-700 transition-colors">
            All companies
          </Link>
        </div>
      </footer>
    </div>
  );
}
