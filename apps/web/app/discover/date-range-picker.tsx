"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const PRIMARY = "#008A56";

function parseLocal(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function fmtShort(d: Date) {
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default function DiscoverDatePicker({ dateFrom, dateTo, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const initFrom = parseLocal(dateFrom);
  const initTo   = parseLocal(dateTo);
  const today    = new Date();

  const [viewYear,  setViewYear]  = useState(initFrom?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initFrom?.getMonth()    ?? today.getMonth());
  const [selFrom,   setSelFrom]   = useState<Date | null>(initFrom);
  const [selTo,     setSelTo]     = useState<Date | null>(initTo);
  const [hover,     setHover]     = useState<Date | null>(null);


  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleDayClick(day: Date) {
    if (!selFrom || (selFrom && selTo)) {
      setSelFrom(day);
      setSelTo(null);
    } else {
      const [start, end] = day < selFrom ? [day, selFrom] : [selFrom, day];
      setSelFrom(start);
      setSelTo(end);
      onChange(toISO(start), toISO(end));
      setOpen(false);
    }
  }

  function handleClear() {
    setSelFrom(null);
    setSelTo(null);
    onChange("", "");
  }

  const effectiveTo = selTo ?? (selFrom && !selTo ? hover : null);
  const isStart  = (d: Date) => selFrom ? sameDay(d, selFrom) : false;
  const isEnd    = (d: Date) => effectiveTo ? sameDay(d, effectiveTo) : false;
  const inRange  = (d: Date) => {
    if (!selFrom || !effectiveTo) return false;
    const [lo, hi] = selFrom <= effectiveTo ? [selFrom, effectiveTo] : [effectiveTo, selFrom];
    return d > lo && d < hi;
  };

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<Date | null> = Array(firstDow).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(viewYear, viewMonth, i));

  const hasFilter = dateFrom || dateTo;

  let label = "Select date range";
  if (initFrom && initTo) {
    label = `${fmtShort(new Date(dateFrom + "T00:00:00"))}  –  ${fmtShort(new Date(dateTo + "T00:00:00"))}`;
  } else if (initFrom) {
    label = `From ${fmtShort(new Date(dateFrom + "T00:00:00"))}`;
  } else if (initTo) {
    label = `To ${fmtShort(new Date(dateTo + "T00:00:00"))}`;
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow text-foreground border border-border"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            style={{ color: PRIMARY }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <span>{label}</span>
        </button>
        {hasFilter && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs font-bold uppercase tracking-wider hover:opacity-60 transition-opacity text-primary"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-3 z-50 flex bg-card rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden border border-border">
          {/* Calendar panel */}
          <div className="p-5 w-72">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={prevMonth}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground text-lg transition-colors"
              >
                ‹
              </button>
              <span className="text-sm font-bold text-foreground">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground text-lg transition-colors"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs text-muted-foreground font-semibold py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="h-9" />;

                const start    = isStart(day);
                const end      = isEnd(day);
                const range    = inRange(day);
                const selected = start || end;

                return (
                  <div
                    key={day.toDateString()}
                    className={`relative h-9 flex items-center justify-center ${
                      range || (start && effectiveTo && !sameDay(day, effectiveTo))
                        ? "bg-primary/10"
                        : ""
                    } ${start && effectiveTo && !sameDay(selFrom!, effectiveTo) ? "rounded-l-full" : ""}
                    ${end && selFrom && !sameDay(selFrom, day) ? "rounded-r-full" : ""}`}
                    onMouseEnter={() => !selTo && setHover(day)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <button
                      type="button"
                      onClick={() => handleDayClick(day)}
                      className="w-8 h-8 flex items-center justify-center text-sm rounded-full transition-colors z-10 font-medium"
                      style={
                        selected
                          ? { backgroundColor: PRIMARY, color: "#ffffff", fontWeight: 700 }
                          : range
                          ? { color: PRIMARY }
                          : { color: "var(--foreground)" }
                      }
                    >
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* From / To summary panel */}
          <div className="border-l border-border bg-secondary/60 p-5 w-40 flex flex-col gap-6 justify-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-widest font-bold" style={{ fontFamily: "var(--font-inter)" }}>
                From
              </p>
              {selFrom ? (
                <>
                  <p className="text-3xl font-black leading-none" style={{ color: PRIMARY }}>
                    {selFrom.getDate()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 font-medium" style={{ fontFamily: "var(--font-inter)" }}>
                    {MONTHS[selFrom.getMonth()].slice(0, 3)} {selFrom.getFullYear()}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground/40">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-widest font-bold" style={{ fontFamily: "var(--font-inter)" }}>
                To
              </p>
              {selTo ? (
                <>
                  <p className="text-3xl font-black leading-none" style={{ color: PRIMARY }}>
                    {selTo.getDate()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 font-medium" style={{ fontFamily: "var(--font-inter)" }}>
                    {MONTHS[selTo.getMonth()].slice(0, 3)} {selTo.getFullYear()}
                  </p>
                </>
              ) : selFrom ? (
                <p className="text-sm text-muted-foreground italic">Pick end…</p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground/40">—</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
