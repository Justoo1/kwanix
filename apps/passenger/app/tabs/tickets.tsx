import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useState, useEffect } from "react";
import { useTicket } from "@/hooks/useTrips";
import { loadTicketIds } from "@/lib/storage";
import { formatGhDate, formatGhTime } from "@routpass/mobile-shared";
import type { PublicTicket } from "@routpass/mobile-shared";

function TicketRow({ ticketId }: { ticketId: number }) {
  const { data: ticket, isLoading } = useTicket(ticketId);

  if (isLoading) {
    return (
      <View className="bg-white rounded-2xl px-4 py-4 border border-zinc-100">
        <ActivityIndicator size="small" color="#a1a1aa" />
      </View>
    );
  }

  if (!ticket) return null;

  const brandColor = ticket.brand_color || "#18181b";
  const isPaid = ticket.payment_status === "paid";

  return (
    <TouchableOpacity
      onPress={() => router.push(`/ticket/${ticketId}`)}
      className="bg-white rounded-2xl overflow-hidden border border-zinc-100 active:opacity-80"
    >
      <View className="h-1.5" style={{ backgroundColor: brandColor }} />
      <View className="px-4 py-3.5">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-zinc-900 font-black text-base" numberOfLines={1}>
              {ticket.departure_station_name} → {ticket.destination_station_name}
            </Text>
            <Text className="text-zinc-500 text-xs mt-0.5">
              {formatGhDate(ticket.departure_time)} · {formatGhTime(ticket.departure_time)}
            </Text>
          </View>
          <View
            className="rounded-full px-2.5 py-1 ml-3"
            style={{ backgroundColor: isPaid ? "#d1fae5" : "#fef3c7" }}
          >
            <Text
              className="text-[10px] font-bold uppercase"
              style={{ color: isPaid ? "#065f46" : "#92400e" }}
            >
              {ticket.payment_status}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-4 mt-2">
          <Text className="text-zinc-400 text-xs">Seat {ticket.seat_number}</Text>
          <Text className="text-zinc-400 text-xs">GH₵{ticket.fare_ghs}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function TicketsTab() {
  const [ticketIds, setTicketIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const ids = await loadTicketIds();
    setTicketIds(ids);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-zinc-900 text-2xl font-black">My Tickets</Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator color="#18181b" className="mt-8" />
        ) : ticketIds.length === 0 ? (
          <View className="items-center mt-16">
            <Text className="text-4xl mb-3">🎫</Text>
            <Text className="text-zinc-700 font-bold text-lg">No tickets yet</Text>
            <Text className="text-zinc-400 text-sm mt-1 text-center px-8">
              Book a trip and your tickets will appear here.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/tabs/")}
              className="mt-5 bg-zinc-900 rounded-2xl px-6 py-3"
            >
              <Text className="text-white font-bold">Find a Trip</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-3 pb-8">
            {ticketIds.map((id) => (
              <TicketRow key={id} ticketId={id} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
