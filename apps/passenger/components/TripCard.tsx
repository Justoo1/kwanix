import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import type { PublicTrip } from "@routpass/mobile-shared";
import { formatGhDate, formatGhTime } from "@routpass/mobile-shared";

export function TripCard({ trip }: { trip: PublicTrip }) {
  const canBook = trip.booking_open && trip.available_seats > 0 && trip.status === "scheduled";

  return (
    <TouchableOpacity
      onPress={() => router.push(`/trip/${trip.id}`)}
      className="bg-white rounded-3xl p-4 shadow-sm border border-zinc-100 active:opacity-80"
    >
      {/* Company badge */}
      <View className="flex-row items-center justify-between mb-3">
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: trip.brand_color + "22" }}
        >
          <Text className="text-xs font-bold" style={{ color: trip.brand_color }}>
            {trip.company_name}
          </Text>
        </View>
        {!canBook && (
          <Text className="text-xs text-zinc-400 font-medium capitalize">{trip.status}</Text>
        )}
      </View>

      {/* Route */}
      <View className="flex-row items-center gap-2 mb-3">
        <Text className="flex-1 text-zinc-900 font-black text-base" numberOfLines={1}>
          {trip.departure_station_name}
        </Text>
        <Text className="text-zinc-400">→</Text>
        <Text className="flex-1 text-zinc-900 font-black text-base text-right" numberOfLines={1}>
          {trip.destination_station_name}
        </Text>
      </View>

      {/* Meta row */}
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-zinc-500 text-xs">{formatGhDate(trip.departure_time)}</Text>
          <Text className="text-zinc-700 text-sm font-semibold mt-0.5">
            {formatGhTime(trip.departure_time)}
          </Text>
        </View>
        <View className="items-end">
          {trip.price_ticket_base != null && (
            <Text className="text-zinc-900 font-black text-lg">
              GH₵{trip.price_ticket_base}
            </Text>
          )}
          <Text className="text-zinc-400 text-xs mt-0.5">
            {trip.available_seats} seat{trip.available_seats !== 1 ? "s" : ""} left
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
