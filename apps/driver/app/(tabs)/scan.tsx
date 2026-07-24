import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRef, useState, useCallback } from "react";
import { useDriverTrip } from "@/hooks/useDriverTrip";
import { useDriverScan } from "@/hooks/useDriverPassengers";
import { ScanOverlay, type ScanResult } from "@/components/ScanOverlay";

export default function ScanTab() {
  const { data: trip } = useDriverTrip();
  const [permission, requestPermission] = useCameraPermissions();
  const [overlay, setOverlay] = useState<ScanResult>(null);
  const lastScanAt = useRef(0);
  const isProcessing = useRef(false);
  const scanMutation = useDriverScan();

  const canScan = trip?.status === "loading" || trip?.status === "departed";

  const onBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      const now = Date.now();
      if (now - lastScanAt.current < 1_500) return;
      if (isProcessing.current) return;
      lastScanAt.current = now;
      isProcessing.current = true;

      try {
        const result = await scanMutation.mutateAsync(data.trim());
        if (result.valid) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setOverlay({
            kind: "valid",
            passengerName: result.passenger_name ?? "Passenger",
            seatNumber: result.seat_number ?? 0,
          });
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setOverlay({ kind: "invalid", reason: result.reason ?? "Invalid ticket" });
        }
      } catch {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setOverlay({ kind: "invalid", reason: "Could not verify ticket. Try again." });
      } finally {
        isProcessing.current = false;
      }
    },
    [scanMutation]
  );

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-8">
        <Text className="text-4xl mb-4">📷</Text>
        <Text className="text-white text-xl font-black text-center">Camera Access Needed</Text>
        <Text className="text-zinc-400 text-sm text-center mt-2 mb-6">
          Grant camera permission to scan passenger QR codes.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="bg-white rounded-2xl px-8 py-4"
        >
          <Text className="text-zinc-900 font-bold">Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!canScan) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center px-8">
        <Text className="text-4xl mb-4">🚫</Text>
        <Text className="text-white text-xl font-black text-center">Scanner Unavailable</Text>
        <Text className="text-zinc-400 text-sm text-center mt-2">
          Scanning is available when the trip is boarding or departed.
          {trip ? `\n\nCurrent status: ${trip.status}` : ""}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={overlay ? undefined : onBarcodeScanned}
      />

      {/* Viewfinder overlay */}
      {!overlay && (
        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-64 border-2 border-white/60 rounded-3xl" />
          <Text className="text-white/70 text-sm mt-4 font-medium">
            Point camera at passenger QR code
          </Text>
        </View>
      )}

      <ScanOverlay result={overlay} onDismiss={() => setOverlay(null)} />
    </View>
  );
}
