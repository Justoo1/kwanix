"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ArrowRight } from "lucide-react";

export default function HomeSearchBento() {
  const router = useRouter();
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (fromCity.trim()) params.set("from_city", fromCity.trim());
    if (toCity.trim()) params.set("to_city", toCity.trim());
    router.push(`/discover?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSearch}
      className="bg-card rounded-4xl p-8"
      style={{ boxShadow: "0 24px 48px -12px rgba(13, 31, 23, 0.10)" }}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <label
            className="text-xs font-bold uppercase tracking-widest ml-1 text-muted-foreground"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Departure
          </label>
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-primary" />
            <input
              type="text"
              placeholder="Where are you leaving from?"
              value={fromCity}
              onChange={(e) => setFromCity(e.target.value)}
              className="w-full pl-11 pr-4 py-4 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border-none outline-none focus:ring-2 focus:ring-primary/20 focus:bg-card transition-all duration-200"
              style={{ fontFamily: "var(--font-inter)" }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            className="text-xs font-bold uppercase tracking-widest ml-1 text-muted-foreground"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Destination
          </label>
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-primary" />
            <input
              type="text"
              placeholder="Where do you want to go?"
              value={toCity}
              onChange={(e) => setToCity(e.target.value)}
              className="w-full pl-11 pr-4 py-4 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border-none outline-none focus:ring-2 focus:ring-primary/20 focus:bg-card transition-all duration-200"
              style={{ fontFamily: "var(--font-inter)" }}
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all duration-200"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Search routes
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
