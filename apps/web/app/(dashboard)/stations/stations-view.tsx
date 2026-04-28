"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusCircle, BarChart2, Activity, Pencil, MapPin, Loader2, Map } from "lucide-react";

// Map picker is Leaflet-based — must be client-only
const StationMapPicker = dynamic(() => import("./StationMapPicker"), { ssr: false });
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
  latitude: number | null;
  longitude: number | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const stationSchema = z.object({
  name: z.string().min(1, "Station name is required"),
  location_code: z.string().max(10, "Max 10 characters").optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  contact_number: z.string().optional().or(z.literal("")),
  is_hub: z.boolean(),
  latitude: z.string().optional().or(z.literal("")),
  longitude: z.string().optional().or(z.literal("")),
});

type StationFormValues = z.infer<typeof stationSchema>;

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

// ── Geocode helper (Nominatim, multi-strategy) ────────────────────────────────

interface GeoResult {
  lat: string;
  lng: string;
  display_name: string;
}

async function geocodeStation(name: string, address: string): Promise<GeoResult[] | string> {
  // Try progressively looser queries, restricted to Ghana
  const queries = [
    [name, address, "Ghana"].filter(Boolean).join(", "),
    [name, "Ghana"].filter(Boolean).join(", "),
    name,
  ].filter((q, i, arr) => q.trim() && arr.indexOf(q) === i);

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=3&countrycodes=gh`,
        { headers: { "Accept-Language": "en" } }
      );
      const data: NominatimResult[] = await res.json();
      if (data.length > 0) {
        return data.map((r) => ({
          lat: parseFloat(r.lat).toFixed(6),
          lng: parseFloat(r.lon).toFixed(6),
          display_name: r.display_name,
        }));
      }
    } catch {
      return "Could not reach geocoding service. Use the map picker instead.";
    }
  }
  return "Location not found. Use the map picker to place the pin manually.";
}

// ── Shared coordinates fields ─────────────────────────────────────────────────

function CoordFields({
  lat, lng, onLatChange, onLngChange,
  onAutoDetect, detecting, geocodeError,
  geoResults, onPickResult,
  onOpenMap,
}: {
  lat: string; lng: string;
  onLatChange: (v: string) => void;
  onLngChange: (v: string) => void;
  onAutoDetect: () => void;
  detecting: boolean;
  geocodeError: string | null;
  geoResults: GeoResult[];
  onPickResult: (r: GeoResult) => void;
  onOpenMap: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-medium text-zinc-600">
          Map coordinates{" "}
          <span className="font-normal text-zinc-400">(for tracking page map)</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAutoDetect}
            disabled={detecting}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            {detecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
            {detecting ? "Detecting…" : "Auto-detect"}
          </button>
          <button
            type="button"
            onClick={onOpenMap}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            <Map className="h-3 w-3" />
            Pick on map
          </button>
        </div>
      </div>

      {/* Multiple geocode results — let user choose */}
      {geoResults.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">Multiple matches found — select one:</p>
          {geoResults.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPickResult(r)}
              className={`w-full text-left rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                lat === r.lat && lng === r.lng
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              <span className="font-mono text-zinc-500 mr-2">{r.lat}, {r.lng}</span>
              <span className="truncate">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Single result confirmation */}
      {geoResults.length === 1 && (
        <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1 truncate">
          Found: {geoResults[0].display_name}
        </p>
      )}

      {geocodeError && (
        <p className="text-xs text-amber-600">{geocodeError}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Latitude</label>
          <Input
            type="number" step="0.000001" min="-90" max="90"
            placeholder="5.603717"
            value={lat}
            onChange={(e) => onLatChange(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Longitude</label>
          <Input
            type="number" step="0.000001" min="-180" max="180"
            placeholder="-0.186964"
            value={lng}
            onChange={(e) => onLngChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

function buildColumns(
  canManage: boolean,
  onEdit: (s: StationResponse) => void,
): ColumnDef<StationResponse>[] {
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
          {row.original.latitude != null && row.original.longitude != null ? (
            <p className="text-xs text-emerald-600 mt-0.5">
              {row.original.latitude.toFixed(4)}, {row.original.longitude.toFixed(4)}
            </p>
          ) : (
            <p className="text-xs text-amber-500 mt-0.5">No map coords</p>
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
      id: "edit",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => onEdit(row.original)}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      ),
    });
    base.push({
      id: "actions",
      header: "",
      cell: ({ row }) => <StationActionsCell station={row.original} />,
    });
  }

  return base;
}

// ── Shared station form fields ─────────────────────────────────────────────────

function StationFormFields({
  form,
  lat, lng, onLatChange, onLngChange,
  detecting, geocodeError, onAutoDetect,
  geoResults, onPickResult, onOpenMap,
}: {
  form: ReturnType<typeof useForm<StationFormValues>>;
  lat: string; lng: string;
  onLatChange: (v: string) => void;
  onLngChange: (v: string) => void;
  detecting: boolean;
  geocodeError: string | null;
  onAutoDetect: () => void;
  geoResults: GeoResult[];
  onPickResult: (r: GeoResult) => void;
  onOpenMap: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="col-span-2">
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
                Code <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="ACC" maxLength={10} className="uppercase"
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
          name="contact_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Phone <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="233302123456" {...field} />
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
                City <span className="font-normal text-muted-foreground">(optional)</span>
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
                Address <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="Ring Road, Accra" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <CoordFields
        lat={lat} lng={lng}
        onLatChange={onLatChange}
        onLngChange={onLngChange}
        onAutoDetect={onAutoDetect}
        detecting={detecting}
        geocodeError={geocodeError}
        geoResults={geoResults}
        onPickResult={onPickResult}
        onOpenMap={onOpenMap}
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
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
              </FormControl>
              <FormLabel className="cursor-pointer font-normal">
                Hub station{" "}
                <span className="text-xs text-muted-foreground">(central depot)</span>
              </FormLabel>
            </div>
          </FormItem>
        )}
      />
    </>
  );
}

// ── Create station dialog ─────────────────────────────────────────────────────

function CreateStationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [mapOpen, setMapOpen] = useState(false);

  const form = useForm<StationFormValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: { name: "", location_code: "", city: "", address: "", contact_number: "", is_hub: false, latitude: "", longitude: "" },
  });

  async function handleAutoDetect() {
    setGeocodeError(null);
    setGeoResults([]);
    setDetecting(true);
    const result = await geocodeStation(form.getValues("name"), form.getValues("address") ?? "");
    setDetecting(false);
    if (typeof result === "string") { setGeocodeError(result); return; }
    setGeoResults(result);
    // Auto-select first result
    setLat(result[0].lat);
    setLng(result[0].lng);
  }

  const mutation = useMutation({
    mutationFn: (values: StationFormValues) =>
      clientFetch<StationResponse>("stations", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          location_code: values.location_code || undefined,
          city: values.city || undefined,
          address: values.address || undefined,
          contact_number: values.contact_number || undefined,
          is_hub: values.is_hub,
          latitude: lat ? parseFloat(lat) : undefined,
          longitude: lng ? parseFloat(lng) : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      form.reset(); setLat(""); setLng(""); setGeocodeError(null); setGeoResults([]);
      onOpenChange(false);
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create station</DialogTitle>
            <DialogDescription>Add a new origin or destination to your network.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <StationFormFields
                form={form} lat={lat} lng={lng}
                onLatChange={setLat} onLngChange={setLng}
                detecting={detecting} geocodeError={geocodeError}
                onAutoDetect={handleAutoDetect}
                geoResults={geoResults}
                onPickResult={(r) => { setLat(r.lat); setLng(r.lng); }}
                onOpenMap={() => setMapOpen(true)}
              />
              {mutation.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating…" : "Create station"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {mapOpen && (
        <StationMapPicker
          initialLat={lat ? parseFloat(lat) : undefined}
          initialLng={lng ? parseFloat(lng) : undefined}
          onSelect={(pickedLat, pickedLng) => {
            setLat(pickedLat);
            setLng(pickedLng);
            setGeoResults([]);
            setGeocodeError(null);
            setMapOpen(false);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </>
  );
}

// ── Edit station dialog ───────────────────────────────────────────────────────

function EditStationDialog({ station, open, onOpenChange }: { station: StationResponse; open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient();
  const [lat, setLat] = useState(station.latitude?.toString() ?? "");
  const [lng, setLng] = useState(station.longitude?.toString() ?? "");
  const [detecting, setDetecting] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [mapOpen, setMapOpen] = useState(false);

  const stationId = station.id;

  const form = useForm<StationFormValues>({
    resolver: zodResolver(stationSchema),
    defaultValues: {
      name: station.name,
      location_code: station.location_code ?? "",
      city: station.city ?? "",
      address: station.address ?? "",
      contact_number: station.contact_number ?? "",
      is_hub: station.is_hub,
      latitude: station.latitude?.toString() ?? "",
      longitude: station.longitude?.toString() ?? "",
    },
  });

  async function handleAutoDetect() {
    setGeocodeError(null);
    setGeoResults([]);
    setDetecting(true);
    const result = await geocodeStation(form.getValues("name"), form.getValues("address") ?? "");
    setDetecting(false);
    if (typeof result === "string") { setGeocodeError(result); return; }
    setGeoResults(result);
    setLat(result[0].lat);
    setLng(result[0].lng);
  }

  const mutation = useMutation({
    mutationFn: (values: StationFormValues) =>
      clientFetch<StationResponse>(`stations/${stationId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          location_code: values.location_code || undefined,
          city: values.city || undefined,
          address: values.address || undefined,
          contact_number: values.contact_number || undefined,
          is_hub: values.is_hub,
          latitude: lat ? parseFloat(lat) : null,
          longitude: lng ? parseFloat(lng) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stations"] });
      onOpenChange(false);
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit station</DialogTitle>
            <DialogDescription>Update details for <strong>{station.name}</strong>.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <StationFormFields
                form={form} lat={lat} lng={lng}
                onLatChange={setLat} onLngChange={setLng}
                detecting={detecting} geocodeError={geocodeError}
                onAutoDetect={handleAutoDetect}
                geoResults={geoResults}
                onPickResult={(r) => { setLat(r.lat); setLng(r.lng); }}
                onOpenMap={() => setMapOpen(true)}
              />
              {mutation.error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save changes"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {mapOpen && (
        <StationMapPicker
          initialLat={lat ? parseFloat(lat) : undefined}
          initialLng={lng ? parseFloat(lng) : undefined}
          onSelect={(pickedLat, pickedLng) => {
            setLat(pickedLat);
            setLng(pickedLng);
            setGeoResults([]);
            setGeocodeError(null);
            setMapOpen(false);
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </>
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editStation, setEditStation] = useState<StationResponse | null>(null);

  const columns = buildColumns(canManage, setEditStation);

  const { data, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: () => clientFetch<StationResponse[]>("stations"),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Stations</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Origins and destinations for trips and parcels.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
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

      {/* Dialogs */}
      {canCreate && (
        <CreateStationDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {editStation && canManage && (
        <EditStationDialog
          station={editStation}
          open={!!editStation}
          onOpenChange={(v) => { if (!v) setEditStation(null); }}
        />
      )}
    </div>
  );
}
