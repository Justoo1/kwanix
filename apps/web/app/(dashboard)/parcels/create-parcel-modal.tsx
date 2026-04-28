"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Smartphone, CheckCircle2 } from "lucide-react";
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

type Step = "form" | "payment" | "receipt";

interface MomoState {
  reference: string;
  status: string;
  display_text: string;
}

export default function CreateParcelModal({ stations, open, onClose }: Props) {
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("form");
  const [parcel, setParcel] = useState<ParcelRow | null>(null);
  const [senderPhone, setSenderPhone] = useState("");
  const [momoState, setMomoState] = useState<MomoState | null>(null);
  const [isRequestingMomo, setIsRequestingMomo] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

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

  const { data: tiersData } = useQuery({
    queryKey: ["weight-tiers"],
    queryFn: () => clientFetch<{ tiers: WeightTier[] }>("admin/companies/me/weight-tiers"),
    staleTime: 5 * 60_000,
  });
  const tiers = useMemo(() => tiersData?.tiers ?? [], [tiersData]);

  const weightStr = useWatch({ control, name: "weight_kg" });
  useEffect(() => {
    const w = parseFloat(weightStr);
    if (!isNaN(w) && w > 0 && tiers.length > 0) {
      const auto = calcFee(w, tiers);
      if (auto !== null) setValue("fee_ghs", auto.toFixed(2));
    }
  }, [weightStr, tiers, setValue]);

  // Auto-print when the receipt step is first entered
  useEffect(() => {
    if (step === "receipt" && parcel) {
      const t = setTimeout(() => {
        window.print();
        markPrinted(parcel.id);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [step, parcel]);

  const mutation = useMutation({
    mutationFn: (body: object) =>
      clientFetch<ParcelRow>("parcels", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: parcelKeys.all });
      setParcel(data);
      setStep(data.fee_ghs > 0 ? "payment" : "receipt");
      reset();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create parcel");
    },
  });

  async function handleRequestMomo() {
    if (!parcel) return;
    setIsRequestingMomo(true);
    try {
      const data = await clientFetch<MomoState>(
        `parcels/${parcel.id}/initiate-momo-payment`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setMomoState(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send payment request");
    } finally {
      setIsRequestingMomo(false);
    }
  }

  async function handleDone() {
    if (!parcel) return;
    setIsVerifying(true);
    try {
      const result = await clientFetch<{ payment_status: string; updated: boolean }>(
        `parcels/${parcel.id}/verify-payment`,
        { method: "POST" }
      );
      setPaymentStatus(result.payment_status);
    } catch {
      setPaymentStatus(null);
    } finally {
      setIsVerifying(false);
      setStep("receipt");
    }
  }

  const stationById = (id: number) =>
    stations.find((s) => s.id === id)?.name ?? `Station ${id}`;

  function handleClose() {
    setStep("form");
    setParcel(null);
    setSenderPhone("");
    setMomoState(null);
    setIsRequestingMomo(false);
    setIsVerifying(false);
    setPaymentStatus(null);
    reset();
    onClose();
  }

  function onSubmit(data: FormValues) {
    setSenderPhone(data.sender_phone);
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

  const stepNum = step === "form" ? 1 : step === "payment" ? 2 : 3;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100">
            <div className="space-y-1.5">
              <h2 className="font-semibold text-zinc-900">
                {step === "form" && "Log New Parcel"}
                {step === "payment" && "Collect Shipping Fee"}
                {step === "receipt" && "Parcel Logged"}
              </h2>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex items-center">
                    <div
                      className={`h-2 w-2 rounded-full transition-colors ${
                        n < stepNum
                          ? "bg-emerald-500"
                          : n === stepNum
                          ? "bg-blue-600"
                          : "bg-zinc-300"
                      }`}
                    />
                    {n < 3 && (
                      <div
                        className={`h-px w-6 transition-colors ${
                          n < stepNum ? "bg-emerald-500" : "bg-zinc-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ── Step 1: Form ── */}
          {step === "form" && (
            <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sender Name" error={errors.sender_name?.message}>
                  <input
                    {...register("sender_name", {
                      required: "Required",
                      minLength: { value: 2, message: "Too short" },
                    })}
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
                    {...register("receiver_name", {
                      required: "Required",
                      minLength: { value: 2, message: "Too short" },
                    })}
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
                    {...register("origin_station_id", {
                      required: "Select a station",
                      validate: (v) => v !== "" || "Select a station",
                    })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Destination Station *" error={errors.destination_station_id?.message}>
                  <select
                    {...register("destination_station_id", {
                      required: "Select a station",
                      validate: (v) => v !== "" || "Select a station",
                    })}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Weight (kg) *" error={errors.weight_kg?.message}>
                  <input
                    {...register("weight_kg", {
                      required: "Weight is required",
                      validate: (v) => Number(v) > 0 || "Must be greater than 0",
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
                <input
                  {...register("description")}
                  placeholder="Fragile electronics…"
                  className={inputCls}
                />
              </Field>

              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {mutation.isPending ? "Logging…" : "Log Parcel"}
              </button>
            </form>
          )}

          {/* ── Step 2: Payment ── */}
          {step === "payment" && parcel && (
            <div className="px-6 py-6 space-y-5">
              <p className="text-sm text-zinc-500 text-center">
                Send a MoMo payment request to the sender for the shipping fee.
              </p>

              {/* Parcel summary */}
              <div className="bg-zinc-50 rounded-xl px-4 py-3 space-y-2 text-sm">
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
                <div className="flex justify-between">
                  <span className="text-zinc-500">Phone</span>
                  <span className="font-mono text-zinc-900">{senderPhone}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-2 mt-1">
                  <span className="font-medium text-zinc-700">Amount</span>
                  <span className="font-bold text-zinc-900">
                    GHS {parcel.fee_ghs.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* MoMo initiation / status display */}
              {!momoState ? (
                <button
                  onClick={handleRequestMomo}
                  disabled={isRequestingMomo}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  <Smartphone className="h-4 w-4" />
                  {isRequestingMomo ? "Sending request…" : "Request MoMo Payment"}
                </button>
              ) : (
                <div
                  className={`rounded-xl px-4 py-3 text-sm space-y-1 ${
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

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                {momoState && (
                  <button
                    onClick={handleDone}
                    disabled={isVerifying}
                    className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {isVerifying ? "Verifying…" : "Done"}
                  </button>
                )}
                <button
                  onClick={() => setStep("receipt")}
                  className={`${
                    momoState ? "flex-1" : "w-full"
                  } rounded-lg hidden border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors`}
                >
                  {momoState ? "Skip & Print Label" : "Skip Payment & Print"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Receipt ── */}
          {step === "receipt" && parcel && (
            <div className="px-6 py-8 text-center space-y-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <div>
                <div className="text-emerald-600 font-semibold text-base">Parcel logged!</div>
                <p className="text-sm text-zinc-600 mt-1">
                  Tracking:{" "}
                  <span className="font-mono font-bold text-zinc-900">
                    {parcel.tracking_number}
                  </span>
                </p>
              </div>

              {paymentStatus === "paid" && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700">
                  Payment confirmed
                </div>
              )}
              {paymentStatus && paymentStatus !== "paid" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
                  Payment not yet confirmed — follow up with the sender.
                </div>
              )}

              <p className="text-xs text-zinc-500">Label printed automatically. Reprint below.</p>

              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 transition-colors"
                >
                  Reprint Label
                </button>
                <button
                  onClick={() => {
                    setStep("form");
                    setParcel(null);
                    setSenderPhone("");
                    setMomoState(null);
                    setPaymentStatus(null);
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Log Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Portal renders ParcelPrint as a direct <body> child — only when receipt is visible */}
      {step === "receipt" &&
        parcel &&
        createPortal(
          <ParcelPrint
            trackingNumber={parcel.tracking_number}
            senderName={parcel.sender_name}
            receiverName={parcel.receiver_name}
            receiverPhone={parcel.receiver_phone}
            originStation={
              parcel.origin_station_name ?? stationById(parcel.origin_station_id)
            }
            destinationStation={
              parcel.destination_station_name ?? stationById(parcel.destination_station_id)
            }
            weightKg={parcel.weight_kg}
            feeGhs={parcel.fee_ghs}
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
