"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Printer, CheckCheck, AlertCircle, ExternalLink, Copy, Check, RotateCcw, Eye, Smartphone, CheckCircle2, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { clientFetch } from "@/lib/client-api";
import { type ParcelRow, useReturnParcel, parcelKeys } from "@/hooks/use-parcels";
import type { UserRole } from "@/lib/definitions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ParcelReceiptPrint from "./parcel-receipt-print";
import { type PrintFormat } from "@/lib/print-utils";
import { markPrinted, getPrintedIds } from "@/lib/print-tracker";
import ParcelDetailDrawer from "./parcel-detail-drawer";

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
  returned: "bg-zinc-100 text-zinc-600",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_transit: "In Transit",
  arrived: "Arrived",
  picked_up: "Picked Up",
  returned: "Returned",
};

function ReturnDialog({
  parcel,
  onClose,
}: {
  parcel: ParcelRow;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const returnMutation = useReturnParcel();

  function handleConfirm() {
    returnMutation.mutate(
      { parcelId: parcel.id, reason: reason.trim() || undefined },
      { onSuccess: onClose, onError: onClose }
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark parcel as returned?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            This will mark <span className="font-mono font-semibold">{parcel.tracking_number}</span> as returned and notify the sender via SMS.
          </p>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Receiver not available"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={returnMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={returnMutation.isPending}
          >
            {returnMutation.isPending ? "Returning…" : "Confirm return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MomoState {
  reference: string;
  status: string;
  display_text: string;
}

function PayParcelDialog({
  parcel,
  onClose,
}: {
  parcel: ParcelRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [momoState, setMomoState] = useState<MomoState | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleRequestMomo() {
    setIsRequesting(true);
    try {
      const data = await clientFetch<MomoState>(
        `parcels/${parcel.id}/initiate-momo-payment`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setMomoState(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send payment request");
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleDone() {
    setIsVerifying(true);
    try {
      const data = await clientFetch<{ payment_status: string; updated: boolean }>(
        `parcels/${parcel.id}/verify-payment`,
        { method: "POST" }
      );
      setResult(data.payment_status);
      if (data.payment_status === "paid") {
        qc.invalidateQueries({ queryKey: parcelKeys.all });
        toast.success("Payment confirmed!");
      }
    } catch {
      setResult("unknown");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Collect Shipping Fee</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-3 py-4">
            {result === "paid" ? (
              <>
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700">Payment confirmed!</p>
              </>
            ) : (
              <>
                <AlertCircle className="h-10 w-10 text-amber-500" />
                <p className="text-sm text-amber-700 text-center">
                  Payment not confirmed yet. Follow up with the sender.
                </p>
              </>
            )}
            <DialogFooter className="w-full pt-2">
              <Button className="w-full" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Parcel summary */}
            <div className="bg-zinc-50 rounded-lg px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tracking</span>
                <span className="font-mono font-semibold text-zinc-900">
                  {parcel.tracking_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Sender</span>
                <span className="text-zinc-900">{parcel.sender_name}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-2">
                <span className="font-medium text-zinc-700">Amount</span>
                <span className="font-bold text-zinc-900">
                  GHS {Number(parcel.fee_ghs).toFixed(2)}
                </span>
              </div>
            </div>

            {/* MoMo status display */}
            {momoState && (
              <div
                className={`rounded-lg px-4 py-3 text-sm space-y-1 ${
                  momoState.status === "pay_offline"
                    ? "bg-amber-50 border border-amber-200"
                    : "bg-emerald-50 border border-emerald-200"
                }`}
              >
                {momoState.status === "pay_offline" ? (
                  <>
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                      Ask sender to dial
                    </p>
                    <p className="text-lg font-bold font-mono text-amber-900 text-center py-1">
                      {momoState.display_text}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                      Payment request sent
                    </p>
                    <p className="text-emerald-800">{momoState.display_text}</p>
                  </>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {!momoState ? (
                <Button onClick={handleRequestMomo} disabled={isRequesting}>
                  <Smartphone className="h-4 w-4 mr-1.5" />
                  {isRequesting ? "Sending…" : "Request MoMo Payment"}
                </Button>
              ) : (
                <Button onClick={handleDone} disabled={isVerifying}>
                  {isVerifying ? "Verifying…" : "Done"}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildColumns(
  setPrintTarget: (row: ParcelRow) => void,
  printedIds: Set<number>,
  setReturnTarget: (row: ParcelRow) => void,
  setDetailTarget: (row: ParcelRow) => void,
  setPayTarget: (row: ParcelRow) => void
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
    col.display({
      id: "payment",
      header: "Payment",
      cell: ({ row }) => {
        const p = row.original;
        const feeStatus = p.fee_payment_status ?? "cash";
        if (Number(p.fee_ghs) <= 0) {
          return <span className="text-xs text-zinc-400">—</span>;
        }
        if (feeStatus === "paid") {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              Paid
            </span>
          );
        }
        if (feeStatus === "momo_pending") {
          return (
            <button
              onClick={() => setPayTarget(p)}
              title="Verify payment"
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors"
            >
              <Clock className="h-3 w-3" />
              Pending
            </button>
          );
        }
        return (
          <button
            onClick={() => setPayTarget(p)}
            title="Collect fee via MoMo"
            className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Smartphone className="h-3 w-3" />
            Pay
          </button>
        );
      },
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
    col.display({
      id: "return",
      header: "",
      cell: ({ row }) => {
        if (row.original.status !== "arrived") return null;
        return (
          <button
            onClick={() => setReturnTarget(row.original)}
            title="Mark as returned"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Return
          </button>
        );
      },
    }),
    col.display({
      id: "details",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => setDetailTarget(row.original)}
          title="View details"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Details
        </button>
      ),
    }),
  ];
}

// Format picker popover shown when a printer icon is clicked
function PrintFormatPicker({
  parcel,
  onSelect,
  onCancel,
}: {
  parcel: ParcelRow;
  onSelect: (format: PrintFormat) => void;
  onCancel: () => void;
}) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-zinc-200 shadow-xl w-56 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Print Label</p>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-mono truncate">{parcel.tracking_number}</p>
          </div>
          <button
            onClick={() => onSelect("receipt_80")}
            className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
          >
            <div className="text-[13px] font-semibold text-zinc-800">Thermal Receipt</div>
            <div className="text-[11px] text-zinc-500">80mm roll printer</div>
          </button>
          <div className="border-t border-zinc-100" />
          <button
            onClick={() => onSelect("label_62")}
            className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
          >
            <div className="text-[13px] font-semibold text-zinc-800">Label (QL-800)</div>
            <div className="text-[11px] text-zinc-500">62mm Brother label tape</div>
          </button>
          <div className="border-t border-zinc-100" />
          <button
            onClick={onCancel}
            className="w-full px-4 py-2.5 text-center text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// Mounts the thermal print layout via portal, fires triggerPrint(), then marks as printed
function ThermalPrintTrigger({
  parcel,
  format,
  onDone,
}: {
  parcel: ParcelRow;
  format: PrintFormat;
  onDone: () => void;
}) {
  function handleDone() {
    markPrinted(parcel.id);
    onDone();
  }

  return (
    <ParcelReceiptPrint
      trackingNumber={parcel.tracking_number}
      senderName={parcel.sender_name}
      receiverName={parcel.receiver_name}
      receiverPhone={parcel.receiver_phone}
      originStation={parcel.origin_station_name ?? `Station ${parcel.origin_station_id}`}
      destinationStation={parcel.destination_station_name ?? `Station ${parcel.destination_station_id}`}
      weightKg={parcel.weight_kg}
      feeGhs={parcel.fee_ghs}
      description={parcel.description}
      declaredValueGhs={parcel.declared_value_ghs}
      format={format}
      onDone={handleDone}
    />
  );
}

export default function ParcelTable({
  data: parcels,
  isLoading = false,
  isError = false,
  userRole,
}: {
  data: ParcelRow[];
  isLoading?: boolean;
  isError?: boolean;
  userRole: UserRole;
}) {
  "use no memo";
  const [printTarget, setPrintTarget] = useState<ParcelRow | null>(null);
  const [printFormat, setPrintFormat] = useState<PrintFormat | null>(null);
  const [printedIds, setPrintedIds] = useState<Set<number>>(new Set());
  const [returnTarget, setReturnTarget] = useState<ParcelRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<ParcelRow | null>(null);
  const [payTarget, setPayTarget] = useState<ParcelRow | null>(null);

  useEffect(() => {
    setPrintedIds(new Set(getPrintedIds()));
  }, []);

  const handlePrintDone = useCallback(() => {
    setPrintTarget(null);
    setPrintFormat(null);
    setPrintedIds(new Set(getPrintedIds()));
  }, []);

  const columns = buildColumns(setPrintTarget, printedIds, setReturnTarget, setDetailTarget, setPayTarget);

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

      {printTarget && !printFormat && (
        <PrintFormatPicker
          parcel={printTarget}
          onSelect={(fmt) => setPrintFormat(fmt)}
          onCancel={() => setPrintTarget(null)}
        />
      )}

      {printTarget && printFormat && (
        <ThermalPrintTrigger parcel={printTarget} format={printFormat} onDone={handlePrintDone} />
      )}

      {returnTarget && (
        <ReturnDialog parcel={returnTarget} onClose={() => setReturnTarget(null)} />
      )}

      {payTarget && (
        <PayParcelDialog parcel={payTarget} onClose={() => setPayTarget(null)} />
      )}

      <ParcelDetailDrawer
        parcel={detailTarget}
        userRole={userRole}
        onClose={() => setDetailTarget(null)}
      />
    </>
  );
}
