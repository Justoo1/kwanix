"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

interface StationResponse {
  id: number;
  name: string;
  location_code: string | null;
  contact_number: string | null;
  address: string | null;
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
  is_hub: z.boolean(),
});

type CreateStationValues = z.infer<typeof createStationSchema>;

// ── Column definitions ────────────────────────────────────────────────────────

const columns: ColumnDef<StationResponse>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div>
        <p className="font-medium text-foreground">{row.original.name}</p>
        {row.original.address && (
          <p className="text-xs text-muted-foreground">{row.original.address}</p>
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

// ── Create station dialog ─────────────────────────────────────────────────────

function CreateStationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();

  const form = useForm<CreateStationValues, unknown, CreateStationValues>({
    resolver: zodResolver(createStationSchema),
    defaultValues: { name: "", location_code: "", is_hub: false },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateStationValues) =>
      clientFetch<StationResponse>("stations", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          location_code: values.location_code || undefined,
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

// ── Main view ─────────────────────────────────────────────────────────────────

interface StationsViewProps {
  canCreate: boolean;
}

export function StationsView({ canCreate }: StationsViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

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
