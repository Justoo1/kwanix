import { View, Text } from "react-native";
import type { DriverTripData } from "@routpass/mobile-shared";
import { formatGhDate, formatGhTime } from "@routpass/mobile-shared";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: "bg-zinc-700",    text: "text-zinc-200",  label: "Scheduled" },
  loading:   { bg: "bg-amber-500",   text: "text-amber-950", label: "Boarding" },
  departed:  { bg: "bg-blue-500",    text: "text-blue-950",  label: "Departed" },
  arrived:   { bg: "bg-emerald-500", text: "text-emerald-950", label: "Arrived" },
  cancelled: { bg: "bg-red-500",     text: "text-red-950",   label: "Cancelled" },
};

export function TripHero({ trip }: { trip: DriverTripData }) {
  const s = STATUS_STYLES[trip.status] ?? STATUS_STYLES.scheduled;

  return (
    <View className="bg-zinc-900 px-5 pt-5 pb-6">
      {/* Status badge */}
      <View className={`self-start rounded-full px-3 py-1 mb-4 ${s.bg}`}>
        <Text className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>{s.label}</Text>
      </View>

      {/* Route */}
      <View className="flex-row items-center gap-3 mb-4">
        <View className="flex-1">
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-0.5">From</Text>
          <Text className="text-white text-xl font-black" numberOfLines={1}>
            {trip.departure_station_name}
          </Text>
        </View>
        <Text className="text-zinc-500 text-2xl">→</Text>
        <View className="flex-1 items-end">
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-0.5">To</Text>
          <Text className="text-white text-xl font-black" numberOfLines={1}>
            {trip.destination_station_name}
          </Text>
        </View>
      </View>

      {/* Date / time / vehicle */}
      <View className="flex-row gap-4">
        <View>
          <Text className="text-zinc-500 text-[10px] uppercase tracking-wider">Date</Text>
          <Text className="text-zinc-200 text-sm font-semibold mt-0.5">
            {formatGhDate(trip.departure_time)}
          </Text>
        </View>
        <View>
          <Text className="text-zinc-500 text-[10px] uppercase tracking-wider">Time</Text>
          <Text className="text-zinc-200 text-sm font-semibold mt-0.5">
            {formatGhTime(trip.departure_time)}
          </Text>
        </View>
        <View>
          <Text className="text-zinc-500 text-[10px] uppercase tracking-wider">Vehicle</Text>
          <Text className="text-zinc-200 text-sm font-semibold mt-0.5">{trip.vehicle_plate}</Text>
        </View>
      </View>
    </View>
  );
}
