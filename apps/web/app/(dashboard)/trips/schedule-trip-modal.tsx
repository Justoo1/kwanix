"use client"

import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CalendarIcon, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })
}

import { useStations, useVehicles, useCreateTrip, type TripStopInput } from "@/hooks/use-trips"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z
  .object({
    vehicle_id: z.string().min(1, "Please select a vehicle"),
    departure_station_id: z.string().min(1, "Please select a departure station"),
    destination_station_id: z.string().min(1, "Please select a destination"),
    departure_date: z
      .date()
      .refine((d) => d instanceof Date && !isNaN(d.getTime()), {
        message: "Departure date is required",
      }),
    departure_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Enter a valid time (HH:MM)")
      .refine((t) => {
        const [h, m] = t.split(":").map(Number)
        return h >= 0 && h <= 23 && m >= 0 && m <= 59
      }, "Enter a valid time (HH:MM)"),
    base_fare_ghs: z
      .string()
      .optional()
      .refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 0), {
        message: "Base fare must be a positive number",
      }),
    booking_open: z.boolean(),
  })
  .refine((d) => d.departure_station_id !== d.destination_station_id, {
    message: "Departure and destination stations cannot be the same",
    path: ["destination_station_id"],
  })

type FormValues = z.infer<typeof schema>

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Callback after a trip is created — lets parent page refetch. */
  onCreated?: () => void
}

export default function ScheduleTripModal({ onCreated }: Props) {
  const [open, setOpen] = React.useState(false)
  const [calendarOpen, setCalendarOpen] = React.useState(false)
  const [stops, setStops] = React.useState<TripStopInput[]>([])

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset()
      setStops([])
    }
    setOpen(next)
  }

  const { data: stations = [], isLoading: loadingStations } = useStations()
  const { data: vehicles = [], isLoading: loadingVehicles } = useVehicles()
  const createTrip = useCreateTrip()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicle_id: "",
      departure_station_id: "",
      destination_station_id: "",
      departure_time: "08:00",
      base_fare_ghs: "",
      booking_open: false,
    },
  })

  async function onSubmit(values: FormValues) {
    // Build ISO datetime: combine date + time components
    const [hours, minutes] = values.departure_time.split(":").map(Number)
    const dt = new Date(values.departure_date)
    dt.setHours(hours, minutes, 0, 0)

    try {
      await createTrip.mutateAsync({
        vehicle_id: Number(values.vehicle_id),
        departure_station_id: Number(values.departure_station_id),
        destination_station_id: Number(values.destination_station_id),
        departure_time: dt.toISOString(),
        base_fare_ghs: values.base_fare_ghs ? Number(values.base_fare_ghs) : undefined,
        booking_open: values.booking_open,
        stops: stops
          .filter((s) => s.station_id !== 0)
          .map((s) => {
            if (!s.eta) return { station_id: s.station_id }
            // Combine trip departure date with the stop's HH:MM time
            const [sh, sm] = s.eta.split(":").map(Number)
            const etaDt = new Date(values.departure_date)
            etaDt.setHours(sh, sm, 0, 0)
            return { station_id: s.station_id, eta: etaDt.toISOString() }
          }),
      })
      toast.success("Trip scheduled successfully")
      form.reset()
      setStops([])
      setOpen(false)
      onCreated?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to schedule trip"
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="size-4" />
          Schedule trip
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a new trip</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* Vehicle */}
            <FormField
              control={form.control}
              name="vehicle_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={loadingVehicles}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={loadingVehicles ? "Loading…" : "Select vehicle"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.plate_number}
                          {v.model ? ` — ${v.model}` : ""}
                          {v.capacity ? ` (${v.capacity} seats)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Departure / Destination */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="departure_station_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={loadingStations}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={loadingStations ? "Loading…" : "Station"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stations.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destination_station_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>To</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={loadingStations}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={loadingStations ? "Loading…" : "Station"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stations.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Departure date (Calendar popover) + time */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="departure_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departure date</FormLabel>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <button
                            type="button"
                            className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-left shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
                            <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                              {field.value ? fmtDate(field.value) : "Pick a date"}
                            </span>
                          </button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent align="start">
                        <Calendar
                          value={field.value}
                          fromDate={new Date()}
                          onSelect={(date) => {
                            field.onChange(date)
                            setCalendarOpen(false)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="departure_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departure time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Base fare */}
            <FormField
              control={form.control}
              name="base_fare_ghs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Base fare (GHS){" "}
                    <span className="text-muted-foreground font-normal text-xs">optional</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Route stops */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Route stops{" "}
                  <span className="text-muted-foreground font-normal text-xs">optional</span>
                </span>
                <button
                  type="button"
                  onClick={() => setStops((prev) => [...prev, { station_id: 0, eta: null }])}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <Plus className="size-3" />
                  Add stop
                </button>
              </div>
              {stops.length > 0 && (
                <ol className="space-y-2">
                  {stops.map((stop, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <select
                        value={stop.station_id || ""}
                        onChange={(e) => {
                          const updated = [...stops]
                          updated[idx] = { ...updated[idx], station_id: Number(e.target.value) }
                          setStops(updated)
                        }}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select station…</option>
                        {stations.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={stop.eta ?? ""}
                        onChange={(e) => {
                          const updated = [...stops]
                          updated[idx] = {
                            ...updated[idx],
                            eta: e.target.value || null,
                          }
                          setStops(updated)
                        }}
                        className="w-28 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="ETA"
                        title="ETA (optional)"
                      />
                      <button
                        type="button"
                        onClick={() => setStops((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                        aria-label="Remove stop"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Booking open toggle */}
            <Controller
              control={form.control}
              name="booking_open"
              render={({ field }) => (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={field.onChange}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                  />
                  <span className="text-sm text-zinc-700">
                    Allow passengers to book seats online
                  </span>
                </label>
              )}
            />

            <DialogFooter showCloseButton>
              <Button
                type="submit"
                disabled={createTrip.isPending}
              >
                {createTrip.isPending ? "Scheduling…" : "Schedule trip"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
