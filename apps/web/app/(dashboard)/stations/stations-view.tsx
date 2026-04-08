"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusCircle, BarChart2, Activity } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { clientFetch } from "@/lib/client-api";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StationResponse {
  id: number;
  name: string;
  location_code: string | null;
  contact_number: string | null;
  address: string | null;
  city: string | null;
  is_hub: boolean;
  is_active: boolean;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const createStationSchema = z.object({
  name: z.string().min(1, "Station name is required"),
  location_code: z
    .string()
    .max(10, "Max 10 characters")
    .optional()
    .or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  is_hub: z.boolean(),
});

type CreateStationValues = z.infer<typeof createStationSchema>;

// ── Throughput chart ──────────────────────────────────────────────────────────

interface ThroughputPoint {
  date: string;
  received: number;
  dispatched: number;
}

function ThroughputDialog({
  station,
  open,
  onOpenChange,
}: {
  station: StationResponse;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["station-throughput", station.id],
    queryFn: () =>
      clientFetch<ThroughputPoint[]>(`stations/${station.id}/throughput?days=14`),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{station.name} — Parcel Throughput</DialogTitle>
          <DialogDescription>
            Parcels received and dispatched over the last 14 days.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [value, ""]}
                labelFormatter={(label) => `Date: ${String(label)}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="received" fill="#6366f1" name="Received" radius={[3, 3, 0, 0]} />
              <Bar dataKey="dispatched" fill="#22c55e" name="Dispatched" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No throughput data for this period.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Station lifecycle actions ─────────────────────────────────────────────────

function StationActionsCell({ station }: { station: StationResponse }) {
  const queryClient = useQueryClient();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const toggle = useMutation({
    mutationFn: (action: "deactivate" | "activate") =>
      clientFetch<StationResponse>(`stations/${station.id}/${action}`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
    },
  });

  if (station.is_active) {
    return (
      <>
        <button
          onClick={() => setConfirmDeactivate(true)}
          disabled={toggle.isPending}
          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
        >
          Deactivate
        </button>

        {/* Confirmation dialog */}
        <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Deactivate station?</DialogTitle>
              <DialogDescription>
                <strong>{station.name}</strong> will no longer be selectable for
                new trips or parcels. Existing records are not affected.
              </DialogDescription>
            </DialogHeader>
            {toggle.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {toggle.error.message}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmDeactivate(false)}
                disabled={toggle.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={toggle.isPending}
                onClick={() => {
                  toggle.mutate("deactivate", {
                    onSuccess: () => setConfirmDeactivate(false),
                  });
                }}
              >
                {toggle.isPending ? "Deactivating…" : "Deactivate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <button
      onClick={() => toggle.mutate("activate")}
      disabled={toggle.isPending}
      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors"
    >
      {toggle.isPending ? "Activating…" : "Activate"}
    </button>
  );
}

// ── Throughput button cell ────────────────────────────────────────────────────

function ThroughputCell({ station }: { station: StationResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Chart
      </button>
      <ThroughputDialog station={station} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

function buildColumns(canManage: boolean): ColumnDef<StationResponse>[] {
  const base: ColumnDef<StationResponse>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">{row.original.name}</p>
          {(row.original.city || row.original.address) && (
            <p className="text-xs text-muted-foreground">
              {[row.original.city, row.original.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "location_code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.original.location_code ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "is_hub",
      header: "Hub",
      cell: ({ row }) =>
        row.original.is_hub ? (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
            Hub
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
            row.original.is_active
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-zinc-100 text-zinc-500 ring-zinc-200"
          }`}
        >
          {row.original.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  base.push({
    id: "throughput",
    header: "",
    cell: ({ row }) => <ThroughputCell station={row.original} />,
  });

  if (canManage) {
    base.push({
      id: "actions",
      header: "",
      cell: ({ row }) => <StationActionsCell station={row.original} />,
    });
  }

  return base;
}

// ── Create station dialog ─────────────────────────────────────────────────────

function CreateStationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();

  const form = useForm<CreateStationValues, unknown, CreateStationValues>({
    resolver: zodResolver(createStationSchema),
    defaultValues: { name: "", location_code: "", city: "", address: "", is_hub: false },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateStationValues) =>
      clientFetch<StationResponse>("stations", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          location_code: values.location_code || undefined,
          city: values.city || undefined,
          address: values.address || undefined,
          is_hub: values.is_hub,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      form.reset();
      onOpenChange(false);
    },
  });

  function onSubmit(values: CreateStationValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create station</DialogTitle>
          <DialogDescription>
            Add a new origin or destination to your network.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Station name</FormLabel>
                  <FormControl>
                    <Input placeholder="Accra — Neoplan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Location code{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional, max 10 chars)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ACC"
                      maxLength={10}
                      className="uppercase"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    City{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Accra" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Address{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Tema Station, Ring Road" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_hub"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        id="is_hub"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                    </FormControl>
                    <FormLabel htmlFor="is_hub" className="cursor-pointer font-normal">
                      Mark as hub station{" "}
                      <span className="text-xs text-muted-foreground">
                        (central depot for parcel collection)
                      </span>
                    </FormLabel>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {mutation.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create station"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Station performance section (company_admin only) ─────────────────────────

interface StationPerformanceItem {
  station_id: number;
  station_name: string;
  parcels_originated: number;
  parcels_arrived: number;
  trips_departed: number;
  revenue_ghs: number;
}

function StationPerformanceSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["station-performance"],
    queryFn: () => clientFetch<StationPerformanceItem[]>("admin/stations/performance"),
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200">
        <Activity className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-700">Station Performance — Last 30 Days</h2>
      </div>
      {isLoading ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Station</th>
                <th className="px-5 py-3 text-right">Parcels Sent</th>
                <th className="px-5 py-3 text-right">Parcels Received</th>
                <th className="px-5 py-3 text-right">Trips Departed</th>
                <th className="px-5 py-3 text-right">Revenue (GHS)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.station_id} className="border-b border-zinc-100 last:border-0 hover:bg-white/60">
                  <td className="px-5 py-3 font-medium text-zinc-800">{s.station_name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.parcels_originated}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.parcels_arrived}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.trips_departed}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.revenue_ghs.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface StationsViewProps {
  canCreate: boolean;
  canManage: boolean;
}

export function StationsView({ canCreate, canManage }: StationsViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const columns = buildColumns(canManage);

  const { data, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: () => clientFetch<StationResponse[]>("stations"),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Origins and destinations for trips and parcels.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create station
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
      />

      {/* Performance stats — company_admin only */}
      {canCreate && <StationPerformanceSection />}

      {/* Dialog */}
      {canCreate && (
        <CreateStationDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
