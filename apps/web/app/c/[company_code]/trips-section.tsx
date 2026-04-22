"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import DateFilterBar from "./date-filter-bar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  status: string;
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SeatIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function ArrowIcon({ color }: { color: string }) {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color }}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

export default function TripsSection({
  companyCode,
  brandColor,
}: {
  companyCode: string;
  brandColor: string;
}) {
  const searchParams = useSearchParams();
  const dateFrom = searchParams.get("from") ?? undefined;
  const dateTo   = searchParams.get("to")   ?? undefined;

  const fetchKey = `${companyCode}|${dateFrom ?? ""}|${dateTo ?? ""}`;
  const [result, setResult] = useState<{ key: string; trips: PublicTripResponse[] }>({
    key: "",
    trips: [],
  });
  const loading = result.key !== fetchKey;

  useEffect(() => {
    const key = `${companyCode}|${dateFrom ?? ""}|${dateTo ?? ""}`;
    const p = new URLSearchParams({ company_code: companyCode, limit: "100" });
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo)   p.set("date_to",   dateTo);

    fetch(`${API_BASE}/api/v1/public/trips?${p.toString()}`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => setResult({ key, trips: Array.isArray(data) ? data : [] }))
      .catch(() => setResult({ key, trips: [] }));
  }, [companyCode, dateFrom, dateTo]);

  const trips = result.trips;

  const fmt = (d: string) =>
    new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(d + "T00:00:00"));

  const dateLabel =
    dateFrom && dateTo ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
    : dateFrom          ? `from ${fmt(dateFrom)}`
    : dateTo            ? `to ${fmt(dateTo)}`
    : null;

  return (
    <div className="w-full">
      {/* Date filter — right-aligned */}
      <div className="flex justify-end mb-8">
        <DateFilterBar
          companyCode={companyCode}
          dateFrom={dateFrom}
          dateTo={dateTo}
          brandColor={brandColor}
        />
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="rounded-[32px] bg-white h-36 animate-pulse shadow-[0_8px_48px_rgba(0,0,0,0.03)]"
            />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="text-center py-20 rounded-[32px] bg-white shadow-[0_8px_48px_rgba(0,0,0,0.03)]">
          {dateLabel ? (
            <div className="space-y-2">
              <p className="text-zinc-600 font-semibold">No trips {dateLabel}.</p>
              <p className="text-sm text-zinc-400">Try a different date range.</p>
              <Link
                href={`/c/${companyCode}`}
                className="mt-4 inline-block text-sm font-bold hover:opacity-70 transition-opacity"
                style={{ color: brandColor }}
              >
                View all upcoming trips
              </Link>
            </div>
          ) : (
            <p className="text-zinc-400 text-sm">No upcoming trips available.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {trips.map(trip => {
            const color   = trip.brand_color ?? brandColor;
            const depTime = new Intl.DateTimeFormat("en-GH", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(trip.departure_time));
            const seats   = trip.available_seat_count;
            const soldOut = seats === 0;
            const canBook = trip.booking_open &&
              (trip.status === "scheduled" || trip.status === "loading");
            const isBoarding = trip.status === "loading";

            return (
              <div
                key={trip.id}
                className="bg-white rounded-[32px] p-7 md:p-8 flex flex-col md:flex-row md:items-center gap-8 md:gap-10 shadow-[0_8px_48px_rgba(0,0,0,0.03)] border-l-4 relative overflow-hidden transition-transform duration-300 hover:-translate-y-0.5"
                style={{ borderLeftColor: color }}
              >
                {/* Route + meta */}
                <div className="flex-1 space-y-4 min-w-0">
                  {/* Status badge */}
                  {isBoarding ? (
                    <span className="inline-block px-4 py-1.5 bg-emerald-700 text-white rounded-full text-xs font-bold uppercase tracking-widest">
                      Boarding
                    </span>
                  ) : trip.status === "scheduled" ? (
                    <span className="inline-block px-4 py-1.5 bg-zinc-100 text-zinc-500 rounded-full text-xs font-bold uppercase tracking-widest">
                      Scheduled
                    </span>
                  ) : (
                    <span className="inline-block px-4 py-1.5 bg-zinc-100 text-zinc-400 rounded-full text-xs font-bold uppercase tracking-widest">
                      {trip.status}
                    </span>
                  )}

                  {/* Route */}
                  <div>
                    <div className="flex items-center gap-3 text-xl md:text-2xl font-black tracking-tight flex-wrap">
                      <span className="text-zinc-900">{trip.departure_station_name}</span>
                      <ArrowIcon color={color} />
                      <span className="text-zinc-900">{trip.destination_station_name}</span>
                    </div>

                    <div className="flex items-center gap-5 mt-2 text-sm font-medium text-zinc-500 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <ClockIcon />
                        {depTime}
                      </span>
                      {canBook && (
                        <span
                          className={`flex items-center gap-1.5 font-semibold ${
                            soldOut ? "text-zinc-400" : seats < 5 ? "text-amber-600" : "text-emerald-700"
                          }`}
                        >
                          <SeatIcon />
                          {soldOut ? "Sold out" : `${seats} seat${seats !== 1 ? "s" : ""} left`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price + CTA */}
                <div className="flex items-center gap-8 md:gap-12 shrink-0">
                  {trip.price_ghs !== null && (
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-tighter text-zinc-400 mb-0.5">
                        Fare from
                      </p>
                      <p className="text-2xl md:text-3xl font-black text-zinc-900 leading-none">
                        GHS {trip.price_ghs.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {!canBook ? (
                    <span className="inline-flex items-center rounded-2xl bg-zinc-100 px-7 py-4 text-sm font-black text-zinc-400 uppercase tracking-widest">
                      {trip.status}
                    </span>
                  ) : soldOut ? (
                    <span className="inline-flex items-center rounded-2xl bg-zinc-100 px-7 py-4 text-sm font-black text-zinc-400 uppercase tracking-widest">
                      Sold out
                    </span>
                  ) : (
                    <Link
                      href={`/book/${trip.id}`}
                      className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-black text-white transition-all shadow-lg hover:shadow-xl hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: color }}
                    >
                      Book
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
