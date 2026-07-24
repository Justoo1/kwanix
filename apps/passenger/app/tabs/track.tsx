import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useParcelTracking } from "@/hooks/useTrips";
import { formatGhDateTime } from "@routpass/mobile-shared";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:    { bg: "#fef9c3", text: "#854d0e" },
  in_transit: { bg: "#dbeafe", text: "#1e40af" },
  arrived:    { bg: "#d1fae5", text: "#065f46" },
  picked_up:  { bg: "#f3f4f6", text: "#374151" },
  returned:   { bg: "#fee2e2", text: "#991b1b" },
};

export default function TrackTab() {
  const [input, setInput] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const { data: parcel, isLoading, isError } = useParcelTracking(trackingNumber);

  function handleTrack() {
    setTrackingNumber(input.trim().toUpperCase());
  }

  const statusStyle = parcel ? (STATUS_COLORS[parcel.status] ?? STATUS_COLORS.pending) : null;

  return (
    <SafeAreaView className="flex-1 bg-zinc-50">
      <View className="bg-white px-4 pt-4 pb-5 shadow-sm">
        <Text className="text-zinc-900 text-2xl font-black mb-4">Track Parcel</Text>
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 bg-zinc-100 text-zinc-900 rounded-2xl px-4 py-3.5 text-base"
            placeholder="Enter tracking number"
            placeholderTextColor="#a1a1aa"
            value={input}
            onChangeText={setInput}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleTrack}
          />
          <TouchableOpacity
            onPress={handleTrack}
            disabled={!input.trim()}
            className="bg-zinc-900 rounded-2xl px-5 items-center justify-center active:opacity-80"
            style={{ opacity: input.trim() ? 1 : 0.4 }}
          >
            <Text className="text-white font-bold">Track</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {isLoading && trackingNumber ? (
          <ActivityIndicator color="#18181b" className="mt-8" />
        ) : isError ? (
          <View className="items-center mt-12">
            <Text className="text-3xl mb-3">🔍</Text>
            <Text className="text-zinc-700 font-bold text-lg">Not Found</Text>
            <Text className="text-zinc-400 text-sm mt-1 text-center">
              No parcel found for "{trackingNumber}". Check the number and try again.
            </Text>
          </View>
        ) : parcel ? (
          <View className="bg-white rounded-3xl border border-zinc-100 overflow-hidden mb-8">
            {/* Header */}
            <View className="px-5 py-4 bg-zinc-900">
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-black text-base">{parcel.tracking_number}</Text>
                {statusStyle && (
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ backgroundColor: statusStyle.bg }}
                  >
                    <Text className="text-xs font-bold capitalize" style={{ color: statusStyle.text }}>
                      {parcel.status.replace("_", " ")}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-zinc-400 text-sm mt-1">
                {parcel.origin_station_name} → {parcel.destination_station_name}
              </Text>
            </View>

            {/* Details */}
            <View className="px-5 py-4 gap-3">
              <InfoRow label="Description" value={parcel.description} />
              <InfoRow label="Sender" value={parcel.sender_name} />
              <InfoRow label="Receiver" value={parcel.receiver_name} />
              <InfoRow label="Receiver Phone" value={parcel.receiver_phone} />
              {parcel.fee_ghs != null && (
                <InfoRow label="Fee" value={`GH₵${parcel.fee_ghs}`} />
              )}
              <InfoRow label="Last Updated" value={formatGhDateTime(parcel.updated_at)} />
            </View>
          </View>
        ) : !trackingNumber ? (
          <View className="items-center mt-12">
            <Text className="text-4xl mb-3">📦</Text>
            <Text className="text-zinc-500 text-sm text-center">
              Enter a tracking number to check your parcel's status.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between border-b border-zinc-50 pb-3">
      <Text className="text-zinc-400 text-sm">{label}</Text>
      <Text className="text-zinc-900 text-sm font-semibold flex-1 text-right ml-4">{value}</Text>
    </View>
  );
}
