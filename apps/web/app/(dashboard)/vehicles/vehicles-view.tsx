"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

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

interface VehicleResponse {
  id: number;
  plate_number: string;
  model: string | null;
  capacity: number;
  is_active: boolean;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

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

// ── Column definitions ────────────────────────────────────────────────────────

const columns: ColumnDef<VehicleResponse>[] = [
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
];

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

// ── Main view ─────────────────────────────────────────────────────────────────

interface VehiclesViewProps {
  canCreate: boolean;
}

export function VehiclesView({ canCreate }: VehiclesViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => clientFetch<VehicleResponse[]>("vehicles"),
  });

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

      {/* Table */}
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
      />

      {/* Dialog */}
      {canCreate && (
        <CreateVehicleDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
