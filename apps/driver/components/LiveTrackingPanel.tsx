import { View, Text, Switch, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useState } from "react";
import { driverApi } from "@/lib/api";

export function LiveTrackingPanel({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  const [sharing, setSharing] = useState(false);

  async function handleToggle(val: boolean) {
    try {
      await driverApi.setBroadcast(val);
      onToggle(val);
    } catch {
      Alert.alert("Error", "Failed to update tracking.");
    }
  }

  async function handleShareLink() {
    setSharing(true);
    try {
      await driverApi.shareLink();
      Alert.alert("Sent", "Tracking link SMS sent to all passengers.");
    } catch {
      Alert.alert("Error", "Failed to send tracking link.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <View className="bg-zinc-800 mx-4 rounded-2xl p-4 mt-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-white font-bold text-sm">Live Location Broadcast</Text>
          <Text className="text-zinc-400 text-xs mt-0.5">
            {enabled ? "Passengers can track this bus" : "Broadcast is off"}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: "#3f3f46", true: "#22c55e" }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity
        onPress={handleShareLink}
        disabled={sharing || !enabled}
        className="mt-3 bg-zinc-700 rounded-xl py-3 items-center flex-row justify-center gap-2 active:opacity-70"
        style={{ opacity: sharing || !enabled ? 0.5 : 1 }}
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white text-sm font-semibold">📲 SMS Tracking Link to Passengers</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
