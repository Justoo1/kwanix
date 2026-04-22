import type { Metadata } from "next";
import Link from "next/link";
import PublicNav from "@/components/public-nav";
import CompanySearch from "./company-search";
import HomeSearchBento from "./home-search-bento";

export const metadata: Metadata = {
  title: "Kwanix — Book Your Bus Ticket Online",
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
    <div className="min-h-screen flex flex-col bg-background">
      <PublicNav />

      {/* Hero — 2-column editorial layout */}
      <section className="flex-1 flex items-center" style={{ minHeight: "600px" }}>
        <div className="max-w-7xl mx-auto px-8 py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: headline + CTAs */}
            <div>
              <span
                className="inline-block rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest mb-8 bg-primary/10 text-primary"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                Ghana&apos;s bus ticketing platform
              </span>

              <h1
                className="text-6xl md:text-7xl font-extrabold tracking-tighter leading-[0.9] mb-8 text-foreground"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Book your
                <br />
                bus ticket
                <br />
                <span className="italic text-primary">online.</span>
              </h1>

              <p
                className="text-xl leading-relaxed mb-12 max-w-md text-muted-foreground"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                Search routes across all transport companies and pay securely
                with card or Mobile Money.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/discover"
                  className="inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all duration-200"
                  style={{ fontFamily: "var(--font-jakarta)" }}
                >
                  Search routes
                </Link>
                <Link
                  href="/track"
                  className="inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-semibold border border-border text-foreground hover:bg-secondary active:scale-95 transition-all duration-200"
                  style={{ fontFamily: "var(--font-jakarta)" }}
                >
                  Track a parcel
                </Link>
              </div>
            </div>

            {/* Right: search bento box */}
            <HomeSearchBento />
          </div>
        </div>
      </section>

      {/* Company directory */}
      <section className="w-full bg-secondary py-20">
        <div className="max-w-7xl mx-auto px-8">
          <div className="mb-10">
            <h2
              className="text-3xl font-bold tracking-tight mb-2 text-foreground"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              Choose your carrier
            </h2>
            <p className="text-muted-foreground" style={{ fontFamily: "var(--font-inter)" }}>
              Select a transport company to browse their schedules and book a seat.
            </p>
          </div>

          {companies.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-muted-foreground" style={{ fontFamily: "var(--font-inter)" }}>
                No companies listed yet. Check back soon.
              </p>
            </div>
          ) : (
            <CompanySearch companies={companies} />
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border">
        <div className="max-w-7xl mx-auto px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span
            className="text-sm font-bold tracking-tighter text-primary"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Kwanix
          </span>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-inter)" }}>
            © {new Date().getFullYear()} Kwanix. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/discover" className="text-xs text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: "var(--font-inter)" }}>
              Find a trip
            </Link>
            <Link href="/track" className="text-xs text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: "var(--font-inter)" }}>
              Track parcel
            </Link>
            <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors" style={{ fontFamily: "var(--font-inter)" }}>
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
