import { ScrollView, View, Text, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDriverTrip } from "@/hooks/useDriverTrip";
import { useDriverPassengers } from "@/hooks/useDriverPassengers";
import { useGpsBackground } from "@/hooks/useGpsBackground";
import { TripHero } from "@/components/TripHero";
import { BoardingProgress } from "@/components/BoardingProgress";
import { LiveTrackingPanel } from "@/components/LiveTrackingPanel";
import { QUERY_KEYS } from "@/lib/constants";

export default function HomeTab() {
  const qc = useQueryClient();
  const { data: trip, isLoading } = useDriverTrip();
  const { data: passengers = [] } = useDriverPassengers(trip?.id ?? 0);
  const [broadcastEnabled, setBroadcastEnabled] = useState(
    trip?.location_broadcast_enabled ?? false
  );
  const [refreshing, setRefreshing] = useState(false);

  useGpsBackground(trip?.status);

  const boarded = passengers.filter((p) => p.status === "used").length;

  async function onRefresh() {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: QUERY_KEYS.trip });
    setRefreshing(false);
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center">
        <Text className="text-zinc-400 text-sm">Loading trip...</Text>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-8">
        <Text className="text-5xl mb-4">🚌</Text>
        <Text className="text-white text-xl font-black text-center">No Active Trip</Text>
        <Text className="text-zinc-400 text-sm text-center mt-2">
          You haven't been assigned to a trip yet. Contact your manager.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <TripHero trip={trip} />
        <BoardingProgress boarded={boarded} total={trip.passenger_count} />
        <LiveTrackingPanel
          enabled={broadcastEnabled}
          onToggle={setBroadcastEnabled}
        />
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
