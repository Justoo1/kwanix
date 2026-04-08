import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicNav from "@/components/public-nav";
import DateFilterBar from "./date-filter-bar";

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicCompanyResult {
  id: number;
  name: string;
  company_code: string;
  brand_color: string | null;
  logo_url: string | null;
}

interface PublicTripResponse {
  id: number;
  departure_station_name: string;
  destination_station_name: string;
  departure_time: string;
  vehicle_capacity: number;
  available_seat_count: number;
  price_ghs: number | null;
  company_name: string;
  company_code: string;
  brand_color: string | null;
  booking_open: boolean;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

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

async function getTrips(
  companyCode: string,
  date?: string
): Promise<PublicTripResponse[]> {
  try {
    const params = new URLSearchParams({ company_code: companyCode, limit: "100" });
    if (date) params.set("date", date);
    const res = await fetch(
      `${API_BASE}/api/v1/public/trips?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ company_code: string }>;
}): Promise<Metadata> {
  const { company_code } = await params;
  const companies = await getCompanies();
  const company = companies.find((c) => c.company_code === company_code);
  if (!company) return { title: "Company not found — RoutePass" };
  return {
    title: `${company.name} Trips — RoutePass`,
    description: `Browse and book upcoming trips with ${company.name}.`,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CompanyTripsPage({
  params,
  searchParams,
}: {
  params: Promise<{ company_code: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { company_code } = await params;
  const { date } = await searchParams;

  const [companies, trips] = await Promise.all([
    getCompanies(),
    getTrips(company_code, date),
  ]);

  const company = companies.find((c) => c.company_code === company_code);
  if (!company) notFound();

  const color = company.brand_color ?? "#e4e4e7";
  const initials = company.name.slice(0, 2).toUpperCase();

  const dateLabel = date
    ? new Intl.DateTimeFormat("en-GH", { dateStyle: "long" }).format(
        new Date(date + "T00:00:00")
      )
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <PublicNav />

      {/* Company header */}
      <div className="bg-white border-b border-zinc-100" style={{ borderTop: `4px solid ${color}` }}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link
            href="/"
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors mb-4 inline-block"
          >
            ← All companies
          </Link>
          <div className="flex items-center gap-4">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-12 w-12 rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: color }}
              >
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">{company.name}</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                {trips.length > 0
                  ? `${trips.length} upcoming trip${trips.length !== 1 ? "s" : ""}${dateLabel ? ` on ${dateLabel}` : ""}`
                  : "Upcoming trips"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-8 w-full flex-1">
        {/* Date filter */}
        <div className="mb-6">
          <DateFilterBar companyCode={company_code} selectedDate={date} />
        </div>

        {/* Trip list */}
        {trips.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-zinc-200 bg-white">
            {date ? (
              <>
                <p className="text-zinc-500 font-medium">
                  No trips on {dateLabel}.
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                  Try a different date or view all upcoming trips.
                </p>
                <Link
                  href={`/c/${company_code}`}
                  className="mt-4 inline-block text-sm text-emerald-700 hover:underline"
                >
                  View all upcoming trips
                </Link>
              </>
            ) : (
              <p className="text-zinc-400 text-sm">
                No upcoming trips available for this company.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => {
              const tripColor = trip.brand_color ?? "#e4e4e7";
              const depTime = new Intl.DateTimeFormat("en-GH", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(trip.departure_time));
              const seats = trip.available_seat_count;
              const soldOut = seats === 0;

              return (
                <div
                  key={trip.id}
                  className="rounded-xl border border-zinc-200 bg-white px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                  style={{ borderLeft: `3px solid ${tripColor}` }}
                >
                  {/* Route + time */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">
                      {trip.departure_station_name}{" "}
                      <span className="text-zinc-400 font-normal">→</span>{" "}
                      {trip.destination_station_name}
                    </p>
                    <p className="text-sm text-zinc-500 mt-0.5">{depTime}</p>
                  </div>

                  {/* Seats */}
                  <div className="shrink-0 text-sm">
                    {soldOut ? (
                      <span className="text-zinc-400">Sold out</span>
                    ) : (
                      <span className={seats < 5 ? "text-amber-600 font-medium" : "text-zinc-500"}>
                        {seats} seat{seats !== 1 ? "s" : ""} left
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="shrink-0">
                    {trip.price_ghs !== null ? (
                      <span className="text-base font-semibold text-emerald-700">
                        GHS {trip.price_ghs.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">—</span>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="shrink-0">
                    {soldOut ? (
                      <span className="inline-flex items-center rounded-lg bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-400">
                        Sold out
                      </span>
                    ) : (
                      <Link
                        href={`/book/${trip.id}`}
                        className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
                      >
                        Book →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-100 bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-5 text-xs text-zinc-400 flex justify-between">
          <span>© {new Date().getFullYear()} RoutePass</span>
          <Link href="/" className="hover:text-zinc-700">All companies</Link>
        </div>
      </footer>
    </div>
  );
}
