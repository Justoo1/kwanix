import { View, Text } from "react-native";

export function BoardingProgress({
  boarded,
  total,
}: {
  boarded: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((boarded / total) * 100) : 0;

  return (
    <View className="bg-zinc-800 px-5 py-4">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Boarding Progress
        </Text>
        <Text className="text-white text-sm font-bold">
          {boarded} / {total} <Text className="text-zinc-400 font-normal">({pct}%)</Text>
        </Text>
      </View>
      <View className="h-2 bg-zinc-700 rounded-full overflow-hidden">
        <View
          className="h-2 bg-emerald-400 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
}
