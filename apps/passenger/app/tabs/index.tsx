import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { usePublicRoutes, useTrips } from "@/hooks/useTrips";
import { TripCard } from "@/components/TripCard";

export default function SearchTab() {
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [searched, setSearched] = useState(false);

  const { data: trips = [], isLoading, isFetching } = useTrips(
    searched ? { from_city: fromCity || undefined, to_city: toCity || undefined } : {}
  );

  function handleSearch() {
    setSearched(true);
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-50">
      {/* Header */}
      <View className="bg-white px-4 pt-4 pb-5 shadow-sm">
        <Text className="text-zinc-900 text-2xl font-black mb-4">Find a Trip</Text>

        <View className="gap-3">
          <View>
            <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
              From
            </Text>
            <TextInput
              className="bg-zinc-100 text-zinc-900 rounded-2xl px-4 py-3.5 text-base"
              placeholder="Departure city"
              placeholderTextColor="#a1a1aa"
              value={fromCity}
              onChangeText={setFromCity}
              autoCapitalize="words"
            />
          </View>
          <View>
            <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
              To
            </Text>
            <TextInput
              className="bg-zinc-100 text-zinc-900 rounded-2xl px-4 py-3.5 text-base"
              placeholder="Destination city"
              placeholderTextColor="#a1a1aa"
              value={toCity}
              onChangeText={setToCity}
              autoCapitalize="words"
            />
          </View>
          <TouchableOpacity
            onPress={handleSearch}
            className="bg-zinc-900 rounded-2xl py-4 items-center mt-1 active:opacity-80"
          >
            <Text className="text-white font-bold text-base">Search Trips</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      <ScrollView className="flex-1 px-4 pt-4">
        {(isLoading || isFetching) && searched ? (
          <ActivityIndicator color="#18181b" className="mt-8" />
        ) : searched && trips.length === 0 ? (
          <View className="items-center mt-12">
            <Text className="text-3xl mb-3">🔍</Text>
            <Text className="text-zinc-700 font-bold text-lg">No trips found</Text>
            <Text className="text-zinc-400 text-sm mt-1 text-center px-8">
              Try different cities or check back later.
            </Text>
          </View>
        ) : (
          <View className="gap-3 pb-8">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </View>
        )}
        {!searched && (
          <View className="items-center mt-12">
            <Text className="text-4xl mb-3">🚌</Text>
            <Text className="text-zinc-500 text-sm text-center">
              Search for trips between Ghana cities.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
