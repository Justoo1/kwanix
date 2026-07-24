import {
  View,
  Text,
  TextInput,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { router } from "expo-router";
import { useDriverTrip } from "@/hooks/useDriverTrip";
import { useDriverPassengers } from "@/hooks/useDriverPassengers";
import { PassengerCard } from "@/components/PassengerCard";

export default function ManifestTab() {
  const { data: trip } = useDriverTrip();
  const { data: passengers = [], refetch, isLoading } = useDriverPassengers(trip?.id ?? 0);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const canCheckin = trip?.status === "loading" || trip?.status === "departed";

  const filtered = passengers.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.passenger_name.toLowerCase().includes(q) ||
      p.passenger_phone.includes(q) ||
      String(p.seat_number).includes(q)
    );
  });

  const boarded = passengers.filter((p) => p.status === "used").length;
  const pending = passengers.filter((p) => p.status === "valid").length;

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  // Check In → navigate to Scan tab
  function handleCheckinPress() {
    router.push("/tabs/scan");
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      {/* Header */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-white text-xl font-black">Passenger Manifest</Text>
        <View className="flex-row gap-3 mt-3">
          <View className="flex-1 bg-zinc-800 rounded-xl py-2 items-center">
            <Text className="text-white text-lg font-black">{passengers.length}</Text>
            <Text className="text-zinc-400 text-[10px] uppercase tracking-wider">Total</Text>
          </View>
          <View className="flex-1 bg-emerald-950/60 rounded-xl py-2 items-center border border-emerald-800/40">
            <Text className="text-emerald-400 text-lg font-black">{boarded}</Text>
            <Text className="text-zinc-400 text-[10px] uppercase tracking-wider">Boarded</Text>
          </View>
          <View className="flex-1 bg-amber-950/40 rounded-xl py-2 items-center border border-amber-800/30">
            <Text className="text-amber-400 text-lg font-black">{pending}</Text>
            <Text className="text-zinc-400 text-[10px] uppercase tracking-wider">Pending</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View className="px-4 mb-3">
        <TextInput
          className="bg-zinc-800 text-white rounded-2xl px-4 py-3 text-sm"
          placeholder="Search name, phone or seat…"
          placeholderTextColor="#71717a"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* List */}
      <ScrollView
        className="flex-1 px-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {isLoading ? (
          <Text className="text-zinc-400 text-center py-8 text-sm">Loading passengers…</Text>
        ) : filtered.length === 0 ? (
          <Text className="text-zinc-500 text-center py-8 text-sm">
            {search ? `No results for "${search}"` : "No passengers yet."}
          </Text>
        ) : (
          <View className="gap-2 pb-8">
            {filtered.map((p) => (
              <PassengerCard
                key={p.ticket_id}
                passenger={p}
                canCheckin={canCheckin && p.status === "valid"}
                onCheckin={handleCheckinPress}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
