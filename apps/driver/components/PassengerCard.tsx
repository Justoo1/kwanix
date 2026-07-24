import { View, Text, TouchableOpacity } from "react-native";
import type { DriverPassenger } from "@routpass/mobile-shared";

export function PassengerCard({
  passenger: p,
  canCheckin,
  onCheckin,
}: {
  passenger: DriverPassenger;
  canCheckin: boolean;
  onCheckin: () => void;
}) {
  const boarded = p.status === "used";

  return (
    <View
      className={`rounded-2xl flex-row items-center gap-3 px-4 py-3.5 ${
        boarded ? "bg-emerald-950/60 border border-emerald-800/40" : "bg-zinc-800 border border-zinc-700/50"
      }`}
    >
      {/* Seat badge */}
      <View
        className={`w-11 h-11 rounded-full items-center justify-center shrink-0 ${
          boarded ? "bg-emerald-800" : "bg-zinc-700"
        }`}
      >
        <Text className={`text-sm font-black ${boarded ? "text-emerald-200" : "text-zinc-200"}`}>
          {p.seat_number}
        </Text>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text className="text-white font-bold text-sm" numberOfLines={1}>{p.passenger_name}</Text>
        <Text className="text-zinc-400 text-xs mt-0.5">{p.passenger_phone}</Text>
      </View>

      {/* Status / action */}
      {boarded ? (
        <Text className="text-emerald-400 text-lg">✓</Text>
      ) : canCheckin ? (
        <TouchableOpacity
          onPress={onCheckin}
          className="bg-white rounded-xl px-3.5 py-2.5 active:opacity-70"
        >
          <Text className="text-zinc-900 text-xs font-bold">Check In</Text>
        </TouchableOpacity>
      ) : (
        <Text className="text-zinc-500 text-xs font-medium capitalize">{p.payment_status}</Text>
      )}
    </View>
  );
}
