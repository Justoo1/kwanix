"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { clientFetch } from "@/lib/client-api";
import { parcelKeys, type ParcelRow } from "@/hooks/use-parcels";
import { markPrinted } from "@/lib/print-tracker";
import ParcelPrint from "./parcel-print";

interface WeightTier {
  max_kg: number | null;
  fee_ghs: number;
}

function calcFee(weightKg: number, tiers: WeightTier[]): number | null {
  if (tiers.length === 0) return null;
  for (const tier of tiers) {
    if (tier.max_kg === null || weightKg <= tier.max_kg) return tier.fee_ghs;
  }
  return tiers[tiers.length - 1].fee_ghs;
}

interface Station {
  id: number;
  name: string;
  location_code: string | null;
}

interface Props {
  stations: Station[];
  open: boolean;
  onClose: () => void;
}

// All fields are strings because HTML inputs return strings
interface FormValues {
  sender_name: string;
  sender_phone: string;
  receiver_name: string;
  receiver_phone: string;
  origin_station_id: string;
  destination_station_id: string;
  weight_kg: string;
  fee_ghs: string;
  description: string;
}

export default function CreateParcelModal({ stations, open, onClose }: Props) {
  const qc = useQueryClient();
  const [printData, setPrintData] = useState<ParcelRow | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { fee_ghs: "0", description: "" },
  });

  // Fetch weight tiers (accessible to all roles including station_clerk)
  const { data: tiersData } = useQuery({
    queryKey: ["weight-tiers"],
    queryFn: () => clientFetch<{ tiers: WeightTier[] }>("admin/companies/me/weight-tiers"),
    staleTime: 5 * 60_000,
  });
  const tiers = useMemo(() => tiersData?.tiers ?? [], [tiersData]);

  // Auto-fill fee when weight changes
  const weightStr = useWatch({ control, name: "weight_kg" });
  useEffect(() => {
    const w = parseFloat(weightStr);
    if (!isNaN(w) && w > 0 && tiers.length > 0) {
      const auto = calcFee(w, tiers);
      if (auto !== null) setValue("fee_ghs", auto.toFixed(2));
    }
  }, [weightStr, tiers, setValue]);

  const mutation = useMutation({
    mutationFn: (body: object) =>
      clientFetch<ParcelRow>("parcels", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (parcel) => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
      setPrintData(parcel);
      reset();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create parcel");
    },
  });

  useEffect(() => {
    if (printData) {
      const t = setTimeout(() => {
        window.print();
        markPrinted(printData.id);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [printData]);

  const stationById = (id: number) =>
    stations.find((s) => s.id === id)?.name ?? `Station ${id}`;

  function handleClose() {
    setPrintData(null);
    reset();
    onClose();
  }

  function onSubmit(data: FormValues) {
    mutation.mutate({
      sender_name: data.sender_name,
      sender_phone: data.sender_phone,
      receiver_name: data.receiver_name,
      receiver_phone: data.receiver_phone,
      origin_station_id: Number(data.origin_station_id),
      destination_station_id: Number(data.destination_station_id),
      weight_kg: Number(data.weight_kg),
      fee_ghs: Number(data.fee_ghs) || 0,
      description: data.description || null,
    });
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100">
            <h2 className="font-semibold text-zinc-900">Log New Parcel</h2>
            <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {printData ? (
            <div className="px-6 py-8 text-center space-y-4">
              <div className="text-emerald-600 font-semibold">Parcel logged!</div>
              <p className="text-sm text-zinc-600">
                Tracking:{" "}
                <span className="font-mono font-bold text-zinc-900">
                  {printData.tracking_number}
                </span>
              </p>
              <p className="text-xs text-zinc-500">Label printed automatically. Reprint below.</p>
              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 transition-colors"
                >
                  Reprint Label
                </button>
                <button
                  onClick={() => setPrintData(null)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Log Another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sender Name" error={errors.sender_name?.message}>
                  <input
                    {...register("sender_name", { required: "Required", minLength: { value: 2, message: "Too short" } })}
                    placeholder="Kofi Mensah"
                    className={inputCls}
                  />
                </Field>
                <Field label="Sender Phone *" error={errors.sender_phone?.message}>
                  <input
                    {...register("sender_phone", {
                      required: "Required",
                      minLength: { value: 10, message: "Enter a valid Ghana number" },
                    })}
                    type="tel"
                    placeholder="0541234567"
                    className={inputCls}
                  />
                </Field>
                <Field label="Receiver Name" error={errors.receiver_name?.message}>
                  <input
                    {...register("receiver_name", { required: "Required", minLength: { value: 2, message: "Too short" } })}
                    placeholder="Ama Owusu"
                    className={inputCls}
                  />
                </Field>
                <Field label="Receiver Phone *" error={errors.receiver_phone?.message}>
                  <input
                    {...register("receiver_phone", {
                      required: "Required",
                      minLength: { value: 10, message: "Enter a valid Ghana number" },
                    })}
                    type="tel"
                    placeholder="0201234567"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Origin Station" error={errors.origin_station_id?.message}>
                  <select
                    {...register("origin_station_id", { required: "Select a station", validate: (v) => v !== "" || "Select a station" })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Destination Station *" error={errors.destination_station_id?.message}>
                  <select
                    {...register("destination_station_id", { required: "Select a station", validate: (v) => v !== "" || "Select a station" })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Weight (kg) *" error={errors.weight_kg?.message}>
                  <input
                    {...register("weight_kg", {
                      required: "Weight is required",
                      validate: (v) => (Number(v) > 0) || "Must be greater than 0",
                    })}
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="2.5"
                    className={inputCls}
                  />
                </Field>
                <Field label="Fee (GHS)" error={errors.fee_ghs?.message}>
                  <input
                    {...register("fee_ghs")}
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Description (optional)" error={errors.description?.message}>
                <input {...register("description")} placeholder="Fragile electronics…" className={inputCls} />
              </Field>

              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {mutation.isPending ? "Logging…" : "Log Parcel & Print Label"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Portal renders ParcelPrint as a direct <body> child so the
          @media print rule "body > * { display:none } + #parcel-print-root
          { display:block }" collapses the page to exactly the receipt height. */}
      {printData &&
        createPortal(
          <ParcelPrint
            trackingNumber={printData.tracking_number}
            senderName={printData.sender_name}
            receiverName={printData.receiver_name}
            receiverPhone={printData.receiver_phone}
            originStation={printData.origin_station_name ?? stationById(printData.origin_station_id)}
            destinationStation={printData.destination_station_name ?? stationById(printData.destination_station_id)}
            weightKg={printData.weight_kg}
            feeGhs={printData.fee_ghs}
          />,
          document.body
        )}
    </>
  );
}

const inputCls =
  "block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
