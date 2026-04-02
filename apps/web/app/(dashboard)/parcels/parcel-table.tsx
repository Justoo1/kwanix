"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Printer, CheckCheck, AlertCircle, ExternalLink, Copy, Check } from "lucide-react";
import { type ParcelRow } from "@/hooks/use-parcels";
import ParcelPrint from "./parcel-print";
import { markPrinted, getPrintedIds } from "@/lib/print-tracker";

function TrackingCell({ trackingNumber }: { trackingNumber: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/track/${trackingNumber}`
      : `/track/${trackingNumber}`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`/track/${trackingNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs font-semibold text-zinc-800 hover:text-blue-600 hover:underline transition-colors"
        title="Open public tracking page"
      >
        {trackingNumber}
      </a>
      <span className="flex items-center gap-0.5">
        <a
          href={`/track/${trackingNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-300 hover:text-blue-500 transition-colors"
          title="Open tracking page"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={handleCopy}
          className="text-zinc-300 hover:text-zinc-600 transition-colors"
          title={copied ? "Copied!" : "Copy tracking link"}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </span>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  in_transit: "bg-blue-100 text-blue-800",
  arrived: "bg-purple-100 text-purple-800",
  picked_up: "bg-green-100 text-green-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_transit: "In Transit",
  arrived: "Arrived",
  picked_up: "Picked Up",
};

function buildColumns(
  setPrintTarget: (row: ParcelRow) => void,
  printedIds: Set<number>
) {
  const col = createColumnHelper<ParcelRow>();

  return [
    col.accessor("tracking_number", {
      header: "Tracking #",
      cell: (i) => <TrackingCell trackingNumber={i.getValue()} />,
    }),
    col.display({
      id: "sender_receiver",
      header: "Sender → Receiver",
      cell: ({ row }) => (
        <div className="text-xs leading-tight">
          <div className="font-medium text-zinc-800">{row.original.sender_name}</div>
          <div className="text-zinc-500">→ {row.original.receiver_name}</div>
        </div>
      ),
    }),
    col.accessor("destination_station_name", {
      header: "Destination",
      cell: (i) => (
        <span className="text-xs text-zinc-700">{i.getValue() ?? "—"}</span>
      ),
    }),
    col.accessor("weight_kg", {
      header: "Weight",
      cell: (i) => {
        const v = i.getValue();
        return <span className="text-xs text-zinc-600">{v != null ? `${v} kg` : "—"}</span>;
      },
    }),
    col.accessor("fee_ghs", {
      header: "Fee",
      cell: (i) => (
        <span className="text-xs text-zinc-700">
          GHS {Number(i.getValue()).toFixed(2)}
        </span>
      ),
    }),
    col.accessor("status", {
      header: "Status",
      cell: (i) => {
        const v = i.getValue();
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[v] ?? "bg-zinc-100 text-zinc-700"}`}
          >
            {v === "pending" && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            )}
            {STATUS_LABELS[v] ?? v}
          </span>
        );
      },
    }),
    col.accessor("created_at", {
      header: "Logged",
      cell: (i) => {
        const v = i.getValue();
        if (!v) return <span className="text-xs text-zinc-400">—</span>;
        return (
          <span className="text-xs text-zinc-500">
            {new Intl.DateTimeFormat("en-GH", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(v))}
          </span>
        );
      },
    }),
    col.display({
      id: "label",
      header: "Label",
      cell: ({ row }) => {
        const printed = printedIds.has(row.original.id);
        return (
          <div className="flex items-center gap-2">
            {printed ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CheckCheck className="h-3.5 w-3.5" />
                Printed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 animate-pulse">
                <AlertCircle className="h-3.5 w-3.5" />
                Not printed
              </span>
            )}
            <button
              onClick={() => setPrintTarget(row.original)}
              title={printed ? "Reprint label" : "Print label"}
              className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      },
    }),
  ];
}

// Mounts print layout via portal, fires window.print(), then marks as printed
function PrintTrigger({
  parcel,
  onDone,
}: {
  parcel: ParcelRow;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
      markPrinted(parcel.id);
      onDone();
    }, 150);
    return () => clearTimeout(t);
  }, [parcel.id, onDone]);

  return createPortal(
    <ParcelPrint
      trackingNumber={parcel.tracking_number}
      senderName={parcel.sender_name}
      receiverName={parcel.receiver_name}
      receiverPhone={parcel.receiver_phone}
      originStation={parcel.origin_station_name ?? `Station ${parcel.origin_station_id}`}
      destinationStation={parcel.destination_station_name ?? `Station ${parcel.destination_station_id}`}
      weightKg={parcel.weight_kg}
      feeGhs={parcel.fee_ghs}
    />,
    document.body
  );
}

export default function ParcelTable({
  data: parcels,
  isLoading = false,
  isError = false,
}: {
  data: ParcelRow[];
  isLoading?: boolean;
  isError?: boolean;
}) {
  "use no memo";
  const [printTarget, setPrintTarget] = useState<ParcelRow | null>(null);
  const [printedIds, setPrintedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setPrintedIds(new Set(getPrintedIds()));
  }, []);

  const handlePrintDone = useCallback(() => {
    setPrintTarget(null);
    setPrintedIds(new Set(getPrintedIds()));
  }, []);

  const columns = buildColumns(setPrintTarget, printedIds);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: parcels,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-zinc-500">
        Loading parcels…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-red-500">
        Failed to load parcels.
      </div>
    );
  }

  if (parcels.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-zinc-400">
        No parcels logged yet.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-zinc-50 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printTarget && (
        <PrintTrigger parcel={printTarget} onDone={handlePrintDone} />
      )}
    </>
  );
}
