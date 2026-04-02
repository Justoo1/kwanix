"use client";

import { useState, useTransition, useEffect } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  createTicket,
  fetchSeatsForTrip,
  type SeatInfo,
  type TripSeats,
} from "./actions";

interface Trip {
  id: number;
  departure_station_name: string;
  destination_station_name: string;
  vehicle_plate: string;
  departure_time: string;
}

interface Props {
  trips: Trip[];
  brandColor: string;
}

type SeatState = "available" | "taken" | "issued";

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

// ── Flip card for a single seat ────────────────────────────────────────────────

interface SeatCardProps {
  seatNumber: number;
  state: SeatState;
  info: SeatInfo | undefined;
  isFlipped: boolean;
  brandColor: string;
  tripId: number;
  baseFare: number | null;
  onFlip: (seat: number | null) => void;
  onIssued: (seat: number, name: string | null) => void;
}

function SeatCard({
  seatNumber,
  state,
  info,
  isFlipped,
  brandColor,
  tripId,
  baseFare,
  onFlip,
  onIssued,
}: SeatCardProps) {
  const [formState, setFormState] = useState<{
    message?: string;
  }>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createTicket(undefined, fd);
      if (result?.ticket_id) {
        const name = fd.get("passenger_name") as string | null;
        toast.success(`Seat ${seatNumber} — Ticket issued`, {
          description: name ? `Passenger: ${name}` : undefined,
        });
        onIssued(seatNumber, name || null);
        onFlip(null);
      } else if (result?.message) {
        setFormState({ message: result.message });
      }
    });
  }

  const rgb = hexToRgb(brandColor);

  return (
    <div
      className="relative"
      style={{ perspective: "600px", width: "90px", height: "110px" }}
    >
      <div
        className="w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ── Front face ── */}
        <div
          className="absolute inset-0 rounded-xl flex flex-col items-center justify-center select-none"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            border:
              state === "available"
                ? `2px solid rgba(${rgb}, 0.3)`
                : "2px solid transparent",
            background:
              state === "taken"
                ? "#e4e4e7"
                : state === "issued"
                  ? `rgba(${rgb}, 0.15)`
                  : "white",
            cursor: state === "available" ? "pointer" : "default",
            boxShadow:
              state === "available"
                ? `0 2px 8px rgba(${rgb}, 0.15)`
                : "none",
          }}
          onClick={() => state === "available" && onFlip(seatNumber)}
        >
          <span
            className="text-xl font-bold"
            style={{
              color:
                state === "available"
                  ? brandColor
                  : state === "issued"
                    ? brandColor
                    : "#71717a",
            }}
          >
            {seatNumber}
          </span>
          <span className="text-[9px] font-medium mt-1 uppercase tracking-wide text-zinc-400">
            {state === "taken"
              ? info?.source === "online"
                ? "online"
                : "taken"
              : state === "issued"
                ? "issued"
                : "seat"}
          </span>
          {state === "issued" && info?.passenger_name && (
            <span
              className="text-[8px] text-center px-1 leading-tight mt-0.5"
              style={{ color: brandColor }}
            >
              {info.passenger_name.split(" ")[0]}
            </span>
          )}
        </div>

        {/* ── Back face (form) ── */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "white",
            border: `2px solid ${brandColor}`,
            boxShadow: `0 4px 20px rgba(${rgb}, 0.25)`,
          }}
        >
          {/* header strip */}
          <div
            className="px-2 py-1 flex items-center justify-between"
            style={{ background: brandColor }}
          >
            <span className="text-[10px] font-bold text-white">
              Seat {seatNumber}
            </span>
            <button
              type="button"
              onClick={() => { setFormState({}); onFlip(null); }}
              className="text-white opacity-70 hover:opacity-100"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 px-1.5 py-1 space-y-1 overflow-auto">
            <input type="hidden" name="trip_id" value={tripId} />
            <input type="hidden" name="seat_number" value={seatNumber} />

            <input
              name="passenger_name"
              placeholder="Name"
              className="w-full rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1"
              style={{ "--tw-ring-color": brandColor } as React.CSSProperties}
            />
            <input
              name="passenger_phone"
              placeholder="Phone"
              className="w-full rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1"
            />
            <input
              name="fare_ghs"
              type="number"
              step="0.01"
              min="0"
              defaultValue={baseFare ?? 0}
              placeholder="Fare"
              className="w-full rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1"
            />

            {formState.message && (
              <p className="text-[8px] text-red-600 leading-tight">
                {formState.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded py-1 text-[10px] font-semibold text-white disabled:opacity-60"
              style={{ background: brandColor }}
            >
              {isPending ? "…" : "Issue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main SeatPicker ────────────────────────────────────────────────────────────

export default function SeatPicker({ trips, brandColor }: Props) {
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [seatData, setSeatData] = useState<TripSeats | null>(null);
  const [flippedSeat, setFlippedSeat] = useState<number | null>(null);
  const [issuedSeats, setIssuedSeats] = useState<
    Map<number, { name: string | null }>
  >(new Map());
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (selectedTripId === null) {
      startLoading(() => {
        setSeatData(null);
        setFlippedSeat(null);
        setIssuedSeats(new Map());
      });
      return;
    }
    startLoading(async () => {
      const data = await fetchSeatsForTrip(selectedTripId);
      setSeatData(data);
      setFlippedSeat(null);
      setIssuedSeats(new Map());
    });
  }, [selectedTripId]);

  function handleIssued(seat: number, name: string | null) {
    setIssuedSeats((prev) => new Map(prev).set(seat, { name }));
  }

  const takenMap = new Map(
    seatData?.taken.map((t) => [t.seat_number, t]) ?? []
  );

  function getSeatState(seat: number): SeatState {
    if (issuedSeats.has(seat)) return "issued";
    if (takenMap.has(seat)) return "taken";
    return "available";
  }

  const rgb = hexToRgb(brandColor);
  const seats = seatData ? Array.from({ length: seatData.capacity }, (_, i) => i + 1) : [];

  // Group into rows of 4 (bus layout: 2 + aisle + 2)
  const rows: number[][] = [];
  for (let i = 0; i < seats.length; i += 4) {
    rows.push(seats.slice(i, i + 4));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4"
        style={{ background: `rgba(${rgb}, 0.06)`, borderBottom: `1px solid rgba(${rgb}, 0.15)` }}
      >
        <h2 className="text-base font-semibold text-zinc-800 mb-3">
          Issue Ticket
        </h2>
        <select
          value={selectedTripId ?? ""}
          onChange={(e) =>
            setSelectedTripId(e.target.value ? Number(e.target.value) : null)
          }
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": brandColor } as React.CSSProperties}
        >
          <option value="">Select a trip to load seats…</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.departure_station_name} → {t.destination_station_name} —{" "}
              {t.vehicle_plate} ·{" "}
              {new Date(t.departure_time).toLocaleString("en-GH", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </option>
          ))}
        </select>
      </div>

      {/* Seat grid */}
      <div className="px-6 py-5">
        {!selectedTripId && (
          <p className="text-sm text-zinc-400 text-center py-10">
            Select a trip above to see the seat map.
          </p>
        )}

        {selectedTripId && loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2
              className="h-6 w-6 animate-spin"
              style={{ color: brandColor }}
            />
          </div>
        )}

        {selectedTripId && !loading && seatData && (
          <>
            {/* Legend + stats */}
            <div className="flex items-center gap-5 mb-5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded"
                  style={{ border: `2px solid rgba(${rgb}, 0.4)`, background: "white" }}
                />
                <span className="text-xs text-zinc-500">
                  Available ({seats.length - seatData.taken.filter(t => !issuedSeats.has(t.seat_number) && t.seat_number <= seatData.capacity).length - issuedSeats.size})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded bg-zinc-300" />
                <span className="text-xs text-zinc-500">
                  Taken ({seatData.taken.length})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded"
                  style={{ background: `rgba(${rgb}, 0.15)` }}
                />
                <span className="text-xs text-zinc-500">
                  Issued ({issuedSeats.size})
                </span>
              </div>
              {seatData.base_fare != null && (
                <span className="text-xs text-zinc-500 ml-auto">
                  Base fare:{" "}
                  <strong style={{ color: brandColor }}>
                    GHS {seatData.base_fare.toFixed(2)}
                  </strong>
                </span>
              )}
            </div>

            {/* Bus shell */}
            <div
              className="rounded-2xl p-4 overflow-x-auto"
              style={{
                background: `rgba(${rgb}, 0.04)`,
                border: `1px solid rgba(${rgb}, 0.12)`,
              }}
            >
              {/* Driver row */}
              <div className="flex justify-end mb-3 pr-1">
                <div
                  className="text-[10px] font-medium px-3 py-1 rounded-full"
                  style={{
                    background: `rgba(${rgb}, 0.12)`,
                    color: brandColor,
                  }}
                >
                  Driver
                </div>
              </div>

              {/* Seat rows */}
              <div className="space-y-2">
                {rows.map((row, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="flex items-center gap-2 justify-center"
                  >
                    {/* Left pair */}
                    {row.slice(0, 2).map((seat) => (
                      <SeatCard
                        key={seat}
                        seatNumber={seat}
                        state={getSeatState(seat)}
                        info={
                          issuedSeats.has(seat)
                            ? {
                                seat_number: seat,
                                passenger_name: issuedSeats.get(seat)!.name,
                                payment_status: "pending",
                                source: "counter",
                              }
                            : takenMap.get(seat)
                        }
                        isFlipped={flippedSeat === seat}
                        brandColor={brandColor}
                        tripId={selectedTripId}
                        baseFare={seatData.base_fare}
                        onFlip={setFlippedSeat}
                        onIssued={handleIssued}
                      />
                    ))}

                    {/* Aisle */}
                    <div className="w-6 text-center text-[9px] text-zinc-300 select-none">
                      │
                    </div>

                    {/* Right pair */}
                    {row.slice(2, 4).map((seat) => (
                      <SeatCard
                        key={seat}
                        seatNumber={seat}
                        state={getSeatState(seat)}
                        info={
                          issuedSeats.has(seat)
                            ? {
                                seat_number: seat,
                                passenger_name: issuedSeats.get(seat)!.name,
                                payment_status: "pending",
                                source: "counter",
                              }
                            : takenMap.get(seat)
                        }
                        isFlipped={flippedSeat === seat}
                        brandColor={brandColor}
                        tripId={selectedTripId}
                        baseFare={seatData.base_fare}
                        onFlip={setFlippedSeat}
                        onIssued={handleIssued}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 mt-3 text-center">
              Click an available seat to issue a ticket for it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
