import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { useTicket } from "@/hooks/useTrips";
import { formatGhDate, formatGhTime } from "@routpass/mobile-shared";

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: ticket, isLoading } = useTicket(Number(id));

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#18181b" />
      </SafeAreaView>
    );
  }

  if (!ticket) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
        <Text className="text-zinc-500">Ticket not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-zinc-400">Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Construct QR value — must match the format the driver scanner expects
  const qrValue = `TICKET:${ticket.id}:${ticket.trip_id}:${ticket.seat_number}`;
  const brandColor = ticket.brand_color || "#18181b";

  async function handleShare() {
    try {
      await Share.share({
        message: `My Kwanix ticket: ${ticket!.departure_station_name} → ${ticket!.destination_station_name} on ${formatGhDate(ticket!.departure_time)} at ${formatGhTime(ticket!.departure_time)}. Seat ${ticket!.seat_number}.`,
      });
    } catch {}
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Text className="text-zinc-500 text-lg">←</Text>
        </TouchableOpacity>
        <Text className="text-zinc-900 font-black text-lg flex-1">Your Ticket</Text>
        <TouchableOpacity onPress={handleShare}>
          <Text className="text-zinc-500 text-sm">Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1">
        {/* QR Code */}
        <View className="items-center py-8 px-4">
          <View
            className="rounded-3xl p-6 mb-4 shadow-sm"
            style={{ backgroundColor: brandColor + "11", borderWidth: 1, borderColor: brandColor + "33" }}
          >
            <QRCode value={qrValue} size={240} backgroundColor="transparent" color={brandColor} />
          </View>
          <Text className="text-zinc-400 text-xs text-center">
            Show this QR code to the driver when boarding
          </Text>
        </View>

        {/* Ticket info */}
        <View className="mx-4 rounded-3xl border border-zinc-100 overflow-hidden mb-8">
          <View className="px-5 py-4" style={{ backgroundColor: brandColor }}>
            <Text className="text-white font-black text-lg">{ticket.company_name}</Text>
            <Text className="text-white/80 text-sm mt-0.5">
              {ticket.departure_station_name} → {ticket.destination_station_name}
            </Text>
          </View>
          <View className="px-5 py-4 bg-white divide-y divide-zinc-100">
            <Row label="Date" value={formatGhDate(ticket.departure_time)} />
            <Row label="Departure" value={formatGhTime(ticket.departure_time)} />
            <Row label="Seat" value={String(ticket.seat_number)} />
            <Row label="Passenger" value={ticket.passenger_name} />
            <Row label="Fare" value={`GH₵${ticket.fare_ghs}`} />
            <Row label="Status" value={ticket.payment_status.toUpperCase()} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-3 border-b border-zinc-50">
      <Text className="text-zinc-400 text-sm">{label}</Text>
      <Text className="text-zinc-900 text-sm font-semibold">{value}</Text>
    </View>
  );
}
