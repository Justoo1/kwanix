"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PencilLine, PlusCircle, Wrench, TrendingUp } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { clientFetch } from "@/lib/client-api";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VehicleResponse {
  id: number;
  plate_number: string;
  model: string | null;
  capacity: number;
  is_active: boolean;
  is_available: boolean;
  default_driver_id: number | null;
  default_driver_name: string | null;
}

interface DriverOption {
  id: number;
  full_name: string;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const maintenanceSchema = z.object({
  note: z.string().min(1, "Note is required"),
  mark_unavailable: z.boolean(),
});

type MaintenanceValues = z.infer<typeof maintenanceSchema>;

const createVehicleSchema = z.object({
  plate_number: z.string().min(1, "Plate number is required"),
  capacity: z
    .string()
    .min(1, "Capacity is required")
    .refine(
      (v) => {
        const n = Number(v);
        return !isNaN(n) && Number.isInteger(n) && n > 0;
      },
      { message: "Capacity must be a positive whole number" }
    ),
});

type CreateVehicleValues = z.infer<typeof createVehicleSchema>;

const editVehicleSchema = z.object({
  plate_number: z.string().min(1, "Plate number is required"),
  model: z.string().optional(),
  capacity: z
    .string()
    .min(1, "Capacity is required")
    .refine(
      (v) => {
        const n = Number(v);
        return !isNaN(n) && Number.isInteger(n) && n > 0;
      },
      { message: "Capacity must be a positive whole number" }
    ),
  driver_id: z.string().optional(),
});

type EditVehicleValues = z.infer<typeof editVehicleSchema>;

// ── Column definitions ────────────────────────────────────────────────────────

function buildColumns(
  canManage: boolean,
  onMaintenance: (v: VehicleResponse) => void,
  onEdit: (v: VehicleResponse) => void
): ColumnDef<VehicleResponse>[] {
  const cols: ColumnDef<VehicleResponse>[] = [
    {
      accessorKey: "plate_number",
      header: "Plate",
      cell: ({ row }) => (
        <span className="font-mono font-semibold text-foreground">
          {row.original.plate_number}
        </span>
      ),
    },
    {
      accessorKey: "model",
      header: "Model",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.model ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "capacity",
      header: "Capacity",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.capacity}{" "}
          <span className="text-xs text-muted-foreground">seats</span>
        </span>
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
    {
      accessorKey: "is_available",
      header: "Availability",
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
            row.original.is_available
              ? "bg-sky-50 text-sky-700 ring-sky-200"
              : "bg-red-50 text-red-700 ring-red-200"
          }`}
        >
          {row.original.is_available ? "Available" : "Out of service"}
        </span>
      ),
    },
  ];

  if (canManage) {
    cols.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onEdit(row.original)}
          >
            <PencilLine className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onMaintenance(row.original)}
          >
            <Wrench className="mr-1 h-3 w-3" />
            Maintenance
          </Button>
        </div>
      ),
    });
  }

  return cols;
}

// ── Maintenance log dialog ────────────────────────────────────────────────────

function MaintenanceDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: VehicleResponse | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<MaintenanceValues, unknown, MaintenanceValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: { note: "", mark_unavailable: false },
  });

  const mutation = useMutation({
    mutationFn: (values: MaintenanceValues) =>
      clientFetch(`vehicles/${vehicle!.id}/maintenance`, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Maintenance logged.");
      form.reset();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to log maintenance.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Maintenance — {vehicle?.plate_number}</DialogTitle>
          <DialogDescription>
            Record a service event. Optionally mark the vehicle as out of
            service.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Oil change, tyre replaced…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mark_unavailable"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">
                    Mark vehicle as out of service
                  </FormLabel>
                </FormItem>
              )}
            />

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
                {mutation.isPending ? "Saving…" : "Log maintenance"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Create vehicle dialog ─────────────────────────────────────────────────────

function CreateVehicleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<CreateVehicleValues, unknown, CreateVehicleValues>({
    resolver: zodResolver(createVehicleSchema),
    defaultValues: { plate_number: "", capacity: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateVehicleValues) =>
      clientFetch<VehicleResponse>("vehicles", {
        method: "POST",
        body: JSON.stringify({
          plate_number: values.plate_number,
          capacity: parseInt(values.capacity, 10),
        }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(`Vehicle ${data.plate_number} added to fleet.`);
      form.reset();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create vehicle.");
    },
  });

  function onSubmit(values: CreateVehicleValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add vehicle</DialogTitle>
          <DialogDescription>
            Register a new vehicle to your company fleet.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="plate_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="GR-1234-24"
                      className="uppercase font-mono"
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
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seating capacity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="50"
                      min={1}
                      {...field}
                    />
                  </FormControl>
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
                {mutation.isPending ? "Adding…" : "Add vehicle"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit vehicle dialog ───────────────────────────────────────────────────────

function EditVehicleDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: VehicleResponse | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => clientFetch<DriverOption[]>("admin/users?role=driver"),
    enabled: open,
  });

  const form = useForm<EditVehicleValues, unknown, EditVehicleValues>({
    resolver: zodResolver(editVehicleSchema),
    values: vehicle
      ? {
          plate_number: vehicle.plate_number,
          model: vehicle.model ?? "",
          capacity: String(vehicle.capacity),
          driver_id: vehicle.default_driver_id ? String(vehicle.default_driver_id) : "",
        }
      : { plate_number: "", model: "", capacity: "", driver_id: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: EditVehicleValues) => {
      await clientFetch(`vehicles/${vehicle!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          plate_number: values.plate_number,
          model: values.model || null,
          capacity: parseInt(values.capacity, 10),
        }),
      });
      await clientFetch(`vehicles/${vehicle!.id}/driver`, {
        method: "PATCH",
        body: JSON.stringify({
          driver_id: values.driver_id ? parseInt(values.driver_id, 10) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle updated.");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update vehicle.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit vehicle — {vehicle?.plate_number}</DialogTitle>
          <DialogDescription>
            Update plate number, model, capacity, or assigned driver.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="plate_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="GR-1234-24"
                      className="uppercase font-mono"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Model <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Yutong ZK6122H9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Seating capacity</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="50" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="driver_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Default driver <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">— Unassigned —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                {mutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Vehicle utilisation section (company_admin only) ─────────────────────────

interface VehicleUtilisationItem {
  vehicle_id: number;
  plate_number: string;
  trips_total: number;
  trips_last_30_days: number;
  avg_occupancy_pct: number;
  total_revenue_ghs: number;
  is_available: boolean;
}

function UtilisationSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-utilisation"],
    queryFn: () => clientFetch<VehicleUtilisationItem[]>("admin/vehicles/utilisation"),
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200">
        <TrendingUp className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-700">Fleet Utilisation</h2>
      </div>
      {isLoading ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No vehicles found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Plate</th>
                <th className="px-5 py-3 text-right">Total Trips</th>
                <th className="px-5 py-3 text-right">Last 30 Days</th>
                <th className="px-5 py-3 text-right">Avg Occupancy</th>
                <th className="px-5 py-3 text-right">Revenue (GHS)</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.vehicle_id} className="border-b border-zinc-100 last:border-0 hover:bg-white/60">
                  <td className="px-5 py-3 font-mono font-semibold text-zinc-800">{v.plate_number}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{v.trips_total}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{v.trips_last_30_days}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{v.avg_occupancy_pct}%</td>
                  <td className="px-5 py-3 text-right tabular-nums">{v.total_revenue_ghs.toFixed(2)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                      v.is_available
                        ? "bg-sky-50 text-sky-700 ring-sky-200"
                        : "bg-red-50 text-red-700 ring-red-200"
                    }`}>
                      {v.is_available ? "Available" : "Out of service"}
                    </span>
                  </td>
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

interface VehiclesViewProps {
  canCreate: boolean;
  canManage: boolean;
}

export function VehiclesView({ canCreate, canManage }: VehiclesViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [maintenanceVehicle, setMaintenanceVehicle] =
    useState<VehicleResponse | null>(null);
  const [editVehicle, setEditVehicle] = useState<VehicleResponse | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => clientFetch<VehicleResponse[]>("vehicles"),
  });

  const columns = buildColumns(
    canManage,
    (v) => setMaintenanceVehicle(v),
    (v) => setEditVehicle(v)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fleet registered to your company.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add vehicle
          </Button>
        )}
      </div>

      {/* Fleet table */}
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} />

      {/* Utilisation stats — company_admin only */}
      {canCreate && <UtilisationSection />}

      {/* Dialogs */}
      {canCreate && (
        <CreateVehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
      {canManage && (
        <MaintenanceDialog
          vehicle={maintenanceVehicle}
          open={maintenanceVehicle !== null}
          onOpenChange={(open) => {
            if (!open) setMaintenanceVehicle(null);
          }}
        />
      )}
      {canManage && (
        <EditVehicleDialog
          vehicle={editVehicle}
          open={editVehicle !== null}
          onOpenChange={(open) => {
            if (!open) setEditVehicle(null);
          }}
        />
      )}
    </div>
  );
}
