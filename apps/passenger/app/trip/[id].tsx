import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import { useTripDetail, useSeatMap } from "@/hooks/useTrips";
import { SeatGrid } from "@/components/SeatGrid";
import { formatGhDate, formatGhTime } from "@routpass/mobile-shared";

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = Number(id);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);

  const { data: trip, isLoading: tripLoading } = useTripDetail(tripId);
  const { data: seatMap, isLoading: seatLoading } = useSeatMap(tripId);

  if (tripLoading || seatLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#18181b" />
      </SafeAreaView>
    );
  }

  if (!trip || !seatMap) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
        <Text className="text-zinc-500">Trip not found.</Text>
      </SafeAreaView>
    );
  }

  const brandColor = trip.brand_color || "#18181b";
  const available = seatMap.capacity - seatMap.taken.length;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Nav */}
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Text className="text-zinc-500 text-lg">←</Text>
        </TouchableOpacity>
        <Text className="text-zinc-900 font-black text-lg flex-1">Select a Seat</Text>
      </View>

      <ScrollView className="flex-1">
        {/* Trip summary */}
        <View className="px-4 py-4 border-b border-zinc-100">
          <View
            className="self-start rounded-full px-3 py-1 mb-3"
            style={{ backgroundColor: brandColor + "22" }}
          >
            <Text className="text-xs font-bold" style={{ color: brandColor }}>
              {trip.company_name}
            </Text>
          </View>
          <View className="flex-row items-center gap-3 mb-3">
            <Text className="text-zinc-900 font-black text-xl flex-1" numberOfLines={1}>
              {trip.departure_station_name}
            </Text>
            <Text className="text-zinc-400 text-xl">→</Text>
            <Text className="text-zinc-900 font-black text-xl flex-1 text-right" numberOfLines={1}>
              {trip.destination_station_name}
            </Text>
          </View>
          <View className="flex-row gap-4">
            <View>
              <Text className="text-zinc-400 text-xs">Date</Text>
              <Text className="text-zinc-700 text-sm font-semibold">
                {formatGhDate(trip.departure_time)}
              </Text>
            </View>
            <View>
              <Text className="text-zinc-400 text-xs">Time</Text>
              <Text className="text-zinc-700 text-sm font-semibold">
                {formatGhTime(trip.departure_time)}
              </Text>
            </View>
            <View>
              <Text className="text-zinc-400 text-xs">Fare</Text>
              <Text className="text-zinc-700 text-sm font-semibold">
                {trip.price_ticket_base != null ? `GH₵${trip.price_ticket_base}` : "—"}
              </Text>
            </View>
            <View>
              <Text className="text-zinc-400 text-xs">Available</Text>
              <Text className="text-zinc-700 text-sm font-semibold">{available} seats</Text>
            </View>
          </View>
        </View>

        {/* Seat picker */}
        <View className="px-4 py-4">
          <Text className="text-zinc-900 font-black text-base mb-4">Choose Your Seat</Text>
          <SeatGrid
            capacity={seatMap.capacity}
            taken={seatMap.taken}
            selected={selectedSeat}
            onSelect={setSelectedSeat}
            brandColor={brandColor}
          />
        </View>
      </ScrollView>

      {/* CTA */}
      <View className="px-4 pb-6 pt-3 border-t border-zinc-100">
        {selectedSeat && (
          <Text className="text-center text-zinc-500 text-sm mb-2">
            Seat <Text className="font-bold text-zinc-900">{selectedSeat}</Text> selected
          </Text>
        )}
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/booking/[trip_id]",
              params: { trip_id: String(tripId), seat: String(selectedSeat) },
            })
          }
          disabled={!selectedSeat}
          className="rounded-2xl py-4 items-center"
          style={{
            backgroundColor: selectedSeat ? brandColor : "#e4e4e7",
            opacity: selectedSeat ? 1 : 0.6,
          }}
        >
          <Text
            className="font-bold text-base"
            style={{ color: selectedSeat ? "#fff" : "#a1a1aa" }}
          >
            Continue to Booking
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
