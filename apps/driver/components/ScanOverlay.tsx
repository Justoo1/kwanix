import { View, Text, TouchableOpacity } from "react-native";

export type ScanResult =
  | { kind: "valid"; passengerName: string; seatNumber: number }
  | { kind: "invalid"; reason: string }
  | null;

export function ScanOverlay({
  result,
  onDismiss,
}: {
  result: ScanResult;
  onDismiss: () => void;
}) {
  if (!result) return null;

  const isValid = result.kind === "valid";

  return (
    <View
      className={`absolute inset-0 items-center justify-center ${
        isValid ? "bg-emerald-500/95" : "bg-red-500/95"
      }`}
    >
      <Text className="text-8xl mb-4">{isValid ? "✓" : "✗"}</Text>

      {isValid ? (
        <>
          <Text className="text-white text-2xl font-black text-center px-6">
            {result.passengerName}
          </Text>
          <Text className="text-white/80 text-lg font-semibold mt-1">
            Seat {result.seatNumber}
          </Text>
          <Text className="text-white/70 text-base mt-2 font-medium">Boarded ✓</Text>
        </>
      ) : (
        <>
          <Text className="text-white text-xl font-black text-center px-6">Invalid Ticket</Text>
          <Text className="text-white/80 text-base text-center mt-2 px-8">{result.reason}</Text>
        </>
      )}

      <TouchableOpacity
        onPress={onDismiss}
        className="mt-10 bg-white/20 rounded-2xl px-8 py-3.5 active:opacity-70"
      >
        <Text className="text-white font-bold text-base">Continue Scanning</Text>
      </TouchableOpacity>
    </View>
  );
}
