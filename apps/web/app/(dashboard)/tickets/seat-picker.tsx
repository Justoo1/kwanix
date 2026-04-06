"use client";

import {
  useState,
  useTransition,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react";
import { Loader2, RotateCcw, LayoutGrid, Bus } from "lucide-react";
import { toast } from "sonner";
import gsap from "gsap";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createTicket,
  fetchSeatsForTrip,
  type SeatInfo,
  type TripSeats,
} from "./actions";

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Trip {
  id: number;
  departure_station_name?: string | null;
  destination_station_name?: string | null;
  vehicle_plate?: string | null;
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

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// ── Flat view: SeatCard (unchanged flip-card) ──────────────────────────────────

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
  const [formState, setFormState] = useState<{ message?: string }>({});
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
        {/* Front face */}
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

        {/* Back face (form) */}
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
          <div
            className="px-2 py-1 flex items-center justify-between"
            style={{ background: brandColor }}
          >
            <span className="text-[10px] font-bold text-white">
              Seat {seatNumber}
            </span>
            <button
              type="button"
              onClick={() => {
                setFormState({});
                onFlip(null);
              }}
              className="text-white opacity-70 hover:opacity-100"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex-1 px-1.5 py-1 space-y-1 overflow-auto"
          >
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

// ── Flat view: FlatSeatGrid ────────────────────────────────────────────────────

interface FlatSeatGridProps {
  rows: number[][];
  seatData: TripSeats;
  getSeatState: (seat: number) => SeatState;
  takenMap: Map<number, SeatInfo>;
  issuedSeats: Map<number, { name: string | null }>;
  flippedSeat: number | null;
  setFlippedSeat: (seat: number | null) => void;
  handleIssued: (seat: number, name: string | null) => void;
  brandColor: string;
  selectedTripId: number;
  rgb: string;
  seats: number[];
}

function FlatSeatGrid({
  rows,
  seatData,
  getSeatState,
  takenMap,
  issuedSeats,
  flippedSeat,
  setFlippedSeat,
  handleIssued,
  brandColor,
  selectedTripId,
  rgb,
  seats,
}: FlatSeatGridProps) {
  return (
    <>
      {/* Legend + stats */}
      <div className="flex items-center gap-5 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-4 rounded"
            style={{
              border: `2px solid rgba(${rgb}, 0.4)`,
              background: "white",
            }}
          />
          <span className="text-xs text-zinc-500">
            Available (
            {seats.length -
              seatData.taken.filter(
                (t) =>
                  !issuedSeats.has(t.seat_number) &&
                  t.seat_number <= seatData.capacity
              ).length -
              issuedSeats.size}
            )
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

              <div className="w-6 text-center text-[9px] text-zinc-300 select-none">
                │
              </div>

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
  );
}

// ── 3D view: BusSeat ───────────────────────────────────────────────────────────

interface BusSeatProps {
  seatNumber: number;
  state: SeatState;
  brandColor: string;
  rgb: string;
  onClick: (seat: number) => void;
}

function BusSeat({ seatNumber, state, brandColor, rgb, onClick }: BusSeatProps) {
  const isAvailable = state === "available";
  const isTaken = state === "taken";
  const isIssued = state === "issued";

  const fillColor = isTaken
    ? "#e4e4e7"
    : isIssued
      ? `rgba(${rgb}, 0.22)`
      : `rgba(${rgb}, 0.10)`;

  const borderColor = isTaken
    ? "#a1a1aa"
    : `rgba(${rgb}, ${isAvailable ? "0.55" : "0.35"})`;

  const headColor = isTaken ? "#a1a1aa" : isIssued ? brandColor : brandColor;

  return (
    <div
      className="bus-seat select-none"
      style={{
        width: "54px",
        cursor: isAvailable ? "pointer" : "default",
        transition: "transform 120ms ease",
        flexShrink: 0,
      }}
      onClick={() => isAvailable && onClick(seatNumber)}
      onMouseEnter={(e) => {
        if (isAvailable)
          (e.currentTarget as HTMLDivElement).style.transform = "scale(1.07)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
      }}
    >
      {/* Headrest */}
      <div
        style={{
          height: "10px",
          background: headColor,
          borderRadius: "6px 6px 0 0",
          border: `1.5px solid ${borderColor}`,
          opacity: isTaken ? 0.45 : 0.85,
          marginLeft: "5px",
          marginRight: "5px",
        }}
      />

      {/* Body row: left armrest + seat body + right armrest */}
      <div style={{ display: "flex", gap: "2px", marginTop: "2px" }}>
        {/* Left armrest */}
        <div
          style={{
            width: "7px",
            height: "36px",
            background: fillColor,
            border: `1.5px solid ${borderColor}`,
            borderRadius: "3px 0 0 5px",
            flexShrink: 0,
          }}
        />

        {/* Seat body */}
        <div
          style={{
            flex: 1,
            height: "36px",
            background: fillColor,
            border: `1.5px solid ${borderColor}`,
            borderRadius: "2px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              fontWeight: "700",
              color: isTaken ? "#71717a" : brandColor,
              lineHeight: 1,
            }}
          >
            {seatNumber}
          </span>
          {isIssued && (
            <span style={{ fontSize: "9px", color: brandColor, lineHeight: 1 }}>
              ✓
            </span>
          )}
          {isTaken && (
            <span
              style={{
                fontSize: "7px",
                color: "#a1a1aa",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1,
              }}
            >
              taken
            </span>
          )}
        </div>

        {/* Right armrest */}
        <div
          style={{
            width: "7px",
            height: "36px",
            background: fillColor,
            border: `1.5px solid ${borderColor}`,
            borderRadius: "0 3px 5px 0",
            flexShrink: 0,
          }}
        />
      </div>

      {/* Cushion ledge */}
      <div
        style={{
          height: "9px",
          background: isTaken ? "#d4d4d8" : `rgba(${rgb}, 0.18)`,
          border: `1.5px solid ${borderColor}`,
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
        }}
      />
    </div>
  );
}

// ── 3D view: TicketModal ───────────────────────────────────────────────────────

interface TicketModalProps {
  open: boolean;
  seatNumber: number | null;
  tripId: number;
  baseFare: number | null;
  brandColor: string;
  onClose: () => void;
  onIssued: (seat: number, name: string | null) => void;
}

function TicketModal({
  open,
  seatNumber,
  tripId,
  baseFare,
  brandColor,
  onClose,
  onIssued,
}: TicketModalProps) {
  // Store the error alongside the seat it was produced for. The derived
  // `formError` is automatically undefined whenever seatNumber changes,
  // eliminating the need for a useEffect to clear state on prop changes.
  const [errorForSeat, setErrorForSeat] = useState<{ seat: number | null; msg: string } | null>(null);
  const formError = errorForSeat?.seat === seatNumber ? errorForSeat.msg : undefined;
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrorForSeat(null);
    startTransition(async () => {
      const result = await createTicket(undefined, fd);
      if (result?.ticket_id) {
        const name = fd.get("passenger_name") as string | null;
        toast.success(`Seat ${seatNumber} — Ticket issued`, {
          description: name ? `Passenger: ${name}` : undefined,
        });
        onIssued(seatNumber!, name || null);
        onClose();
      } else if (result?.message) {
        setErrorForSeat({ seat: seatNumber ?? null, msg: result.message });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue Ticket — Seat {seatNumber}</DialogTitle>
          <DialogDescription>
            Fill in passenger details to issue the ticket.
          </DialogDescription>
        </DialogHeader>

        <form
          key={seatNumber ?? "none"}
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <input type="hidden" name="trip_id" value={tripId} />
          <input type="hidden" name="seat_number" value={seatNumber ?? ""} />

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              Passenger Name
            </label>
            <input
              name="passenger_name"
              placeholder="e.g. Kwame Mensah"
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={
                { "--tw-ring-color": brandColor } as React.CSSProperties
              }
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              Phone Number
            </label>
            <input
              name="passenger_phone"
              placeholder="0541234567"
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">
              Fare (GHS)
            </label>
            <input
              name="fare_ghs"
              type="number"
              step="0.01"
              min="0"
              defaultValue={baseFare ?? 0}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">
              {formError}
            </p>
          )}

          <DialogFooter showCloseButton>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ background: brandColor }}
            >
              {isPending ? "Issuing…" : "Issue Ticket"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 3D view: BusSeatView ───────────────────────────────────────────────────────

interface BusSeatViewProps {
  busRef: React.RefObject<HTMLDivElement | null>;
  rows: number[][];
  seatData: TripSeats;
  getSeatState: (seat: number) => SeatState;
  issuedSeats: Map<number, { name: string | null }>;
  brandColor: string;
  rgb: string;
  seats: number[];
  onSeatClick: (seat: number) => void;
}

function BusSeatView({
  busRef,
  rows,
  seatData,
  getSeatState,
  issuedSeats,
  brandColor,
  rgb,
  seats,
  onSeatClick,
}: BusSeatViewProps) {
  return (
    <>
      {/* Legend */}
      <div className="flex items-center gap-5 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-4 rounded"
            style={{
              border: `2px solid rgba(${rgb}, 0.5)`,
              background: `rgba(${rgb}, 0.08)`,
            }}
          />
          <span className="text-xs text-zinc-500">
            Available (
            {seats.length -
              seatData.taken.filter(
                (t) =>
                  !issuedSeats.has(t.seat_number) &&
                  t.seat_number <= seatData.capacity
              ).length -
              issuedSeats.size}
            )
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
            style={{ background: `rgba(${rgb}, 0.22)` }}
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

      {/* GSAP translate target — no overflow:hidden here (it flattens 3D + breaks pointer events) */}
      <div ref={busRef}>
        {/* Bus body */}
        <div
          className="mx-auto"
          style={{
            maxWidth: "480px",
            background: "#f9f9fa",
            borderRadius: "32px 32px 20px 20px",
            border: "3px solid #d4d4d8",
            boxShadow:
              "0 12px 48px rgba(0,0,0,0.14), 0 3px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)",
            backgroundImage: `
              linear-gradient(to right, #c8c8cc 0px, #c8c8cc 14px, transparent 14px),
              linear-gradient(to left,  #c8c8cc 0px, #c8c8cc 14px, transparent 14px)
            `,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "left 30% center, right 30% center",
            backgroundSize: "14px 65%, 14px 65%",
          }}
        >
          {/* Windshield / front */}
          <div
            style={{
              height: "36px",
              background: `linear-gradient(to bottom, rgba(${rgb},0.12) 0%, rgba(${rgb},0.04) 100%)`,
              borderRadius: "30px 30px 0 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              borderBottom: `2px dashed rgba(${rgb},0.2)`,
              marginBottom: "4px",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "18px", lineHeight: 1 }}>🚌</span>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: "99px",
                background: `rgba(${rgb},0.15)`,
                color: brandColor,
              }}
            >
              Driver
            </div>
            <div style={{ width: "24px" }} />
          </div>

          {/* Scrollable seat rows */}
          <div
            style={{
              padding: "4px 18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              maxHeight: "58vh",
              overflowY: "auto",
            }}
          >
            {rows.map((row, rowIdx) => (
              <div
                key={rowIdx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {/* Left pair */}
                {row.slice(0, 2).map((seat) => (
                  <BusSeat
                    key={seat}
                    seatNumber={seat}
                    state={getSeatState(seat)}
                    brandColor={brandColor}
                    rgb={rgb}
                    onClick={onSeatClick}
                  />
                ))}

                {/* Aisle */}
                <div style={{ width: "28px", flexShrink: 0 }} />

                {/* Right pair */}
                {row.slice(2, 4).map((seat) => (
                  <BusSeat
                    key={seat}
                    seatNumber={seat}
                    state={getSeatState(seat)}
                    brandColor={brandColor}
                    rgb={rgb}
                    onClick={onSeatClick}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 mt-3 text-center">
        Click an available seat to issue a ticket.
      </p>
    </>
  );
}

// ── Main SeatPicker ────────────────────────────────────────────────────────────

export default function SeatPicker({ trips, brandColor }: Props) {
  const [viewMode, setViewMode] = useState<"flat" | "3d">("3d");
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [seatData, setSeatData] = useState<TripSeats | null>(null);
  const [flippedSeat, setFlippedSeat] = useState<number | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [issuedSeats, setIssuedSeats] = useState<
    Map<number, { name: string | null }>
  >(new Map());
  const [loading, startLoading] = useTransition();
  const busRef = useRef<HTMLDivElement>(null);

  // Data fetch (unchanged logic)
  useEffect(() => {
    if (selectedTripId === null) {
      startLoading(() => {
        setSeatData(null);
        setFlippedSeat(null);
        setSelectedSeat(null);
        setIssuedSeats(new Map());
      });
      return;
    }
    startLoading(async () => {
      const data = await fetchSeatsForTrip(selectedTripId);
      setSeatData(data);
      setFlippedSeat(null);
      setSelectedSeat(null);
      setIssuedSeats(new Map());
    });
  }, [selectedTripId]);

  // GSAP enter animation — runs when seatData arrives or when switching to 3D mode
  useIsomorphicLayoutEffect(() => {
    if (!busRef.current || !seatData || viewMode !== "3d") return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from(busRef.current!, {
        x: "110%",
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
      });
      tl.from(
        ".bus-seat",
        {
          opacity: 0,
          y: -15,
          stagger: 0.015,
          duration: 0.25,
          ease: "power2.out",
        },
        "-=0.3"
      );
    }, busRef);
    return () => ctx.revert();
  }, [seatData, viewMode]);

  function handleTripChange(newTripId: number | null) {
    if (busRef.current && seatData && viewMode === "3d") {
      gsap.killTweensOf(busRef.current);
      gsap.to(busRef.current, {
        x: "-110%",
        opacity: 0,
        duration: 0.4,
        ease: "power2.in",
        onComplete: () => {
          gsap.set(busRef.current!, { x: 0, opacity: 1 });
          setSelectedTripId(newTripId);
          setSelectedSeat(null);
          setIssuedSeats(new Map());
        },
      });
    } else {
      setSelectedTripId(newTripId);
      setSelectedSeat(null);
      setIssuedSeats(new Map());
    }
  }

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
  const seats = seatData
    ? Array.from({ length: seatData.capacity }, (_, i) => i + 1)
    : [];

  const rows: number[][] = [];
  for (let i = 0; i < seats.length; i += 4) {
    rows.push(seats.slice(i, i + 4));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      {/* Header */}
      <div
        className="px-6 py-4"
        style={{
          background: `rgba(${rgb}, 0.06)`,
          borderBottom: `1px solid rgba(${rgb}, 0.15)`,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-800">
            Issue Ticket
          </h2>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 p-0.5 bg-zinc-50">
            <button
              onClick={() => setViewMode("flat")}
              title="Flat grid view"
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === "flat"
                  ? "bg-white shadow-sm"
                  : "hover:bg-zinc-100"
              }`}
              style={{ color: viewMode === "flat" ? brandColor : "#71717a" }}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("3d")}
              title="3D bus view"
              className={`rounded-md p-1.5 transition-colors ${
                viewMode === "3d"
                  ? "bg-white shadow-sm"
                  : "hover:bg-zinc-100"
              }`}
              style={{ color: viewMode === "3d" ? brandColor : "#71717a" }}
            >
              <Bus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <select
          value={selectedTripId ?? ""}
          onChange={(e) =>
            handleTripChange(e.target.value ? Number(e.target.value) : null)
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

      {/* Seat area */}
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
          viewMode === "flat" ? (
            <FlatSeatGrid
              rows={rows}
              seatData={seatData}
              getSeatState={getSeatState}
              takenMap={takenMap}
              issuedSeats={issuedSeats}
              flippedSeat={flippedSeat}
              setFlippedSeat={setFlippedSeat}
              handleIssued={handleIssued}
              brandColor={brandColor}
              selectedTripId={selectedTripId}
              rgb={rgb}
              seats={seats}
            />
          ) : (
            <BusSeatView
              busRef={busRef}
              rows={rows}
              seatData={seatData}
              getSeatState={getSeatState}
              issuedSeats={issuedSeats}
              brandColor={brandColor}
              rgb={rgb}
              seats={seats}
              onSeatClick={setSelectedSeat}
            />
          )
        )}
      </div>

      {/* 3D view ticket modal */}
      {selectedTripId && seatData && (
        <TicketModal
          open={selectedSeat !== null}
          seatNumber={selectedSeat}
          tripId={selectedTripId}
          baseFare={seatData.base_fare}
          brandColor={brandColor}
          onClose={() => setSelectedSeat(null)}
          onIssued={handleIssued}
        />
      )}
    </div>
  );
}
