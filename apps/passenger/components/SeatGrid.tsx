import { View, Text, TouchableOpacity } from "react-native";

export function SeatGrid({
  capacity,
  taken,
  selected,
  onSelect,
  brandColor,
}: {
  capacity: number;
  taken: number[];
  selected: number | null;
  onSelect: (seat: number) => void;
  brandColor: string;
}) {
  const takenSet = new Set(taken);

  return (
    <View>
      {/* Legend */}
      <View className="flex-row gap-4 mb-4">
        {[
          { color: "#e4e4e7", label: "Available" },
          { color: "#71717a", label: "Taken" },
          { color: brandColor, label: "Selected" },
        ].map((item) => (
          <View key={item.label} className="flex-row items-center gap-1.5">
            <View className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
            <Text className="text-zinc-500 text-xs">{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Grid: 4 columns with aisle between col 2 and 3 */}
      <View className="flex-row flex-wrap gap-2">
        {Array.from({ length: capacity }, (_, i) => i + 1).map((seat) => {
          const isTaken = takenSet.has(seat);
          const isSelected = selected === seat;
          // Add aisle gap after every 2nd seat in a row of 4
          const col = ((seat - 1) % 4) + 1;
          const hasAisle = col === 2;

          return (
            <View key={seat} className="flex-row">
              <TouchableOpacity
                onPress={() => !isTaken && onSelect(seat)}
                disabled={isTaken}
                className="w-12 h-12 rounded-xl items-center justify-center"
                style={{
                  backgroundColor: isTaken
                    ? "#71717a"
                    : isSelected
                    ? brandColor
                    : "#e4e4e7",
                  marginRight: hasAisle ? 16 : 0,
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: isTaken || isSelected ? "#fff" : "#3f3f46" }}
                >
                  {seat}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}
