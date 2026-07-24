import { View, TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";

export default function PaymentWebView() {
  const { url, reference, ticket_id } = useLocalSearchParams<{
    url: string;
    reference: string;
    ticket_id: string;
  }>();
  const [loading, setLoading] = useState(true);

  function onNavigationStateChange({ url: navUrl }: { url: string }) {
    if (!navUrl) return;
    // Paystack callback or our deep link scheme
    if (navUrl.startsWith("kwanix://") || navUrl.includes("/payment/callback")) {
      router.replace({
        pathname: "/payment/callback",
        params: { reference, ticket_id },
      });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 py-3 border-b border-zinc-100">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Text className="text-zinc-500 text-lg">← Cancel</Text>
        </TouchableOpacity>
        <Text className="text-zinc-900 font-bold flex-1">Secure Payment</Text>
        {loading && <ActivityIndicator size="small" color="#18181b" />}
      </View>

      <WebView
        source={{ uri: url }}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={onNavigationStateChange}
        javaScriptEnabled
        domStorageEnabled
      />
    </SafeAreaView>
  );
}
