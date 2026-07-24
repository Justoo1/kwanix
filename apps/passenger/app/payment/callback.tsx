import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect } from "react";
import { useVerifyPayment } from "@/hooks/useTrips";

export default function PaymentCallback() {
  const { reference, ticket_id } = useLocalSearchParams<{
    reference: string;
    ticket_id: string;
  }>();

  const { data, isError, refetch } = useVerifyPayment(reference);
  const paid = data?.payment_status === "paid";

  useEffect(() => {
    if (paid) {
      router.replace({
        pathname: "/ticket/[id]",
        params: { id: ticket_id },
      });
    }
  }, [paid, ticket_id]);

  return (
    <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
      {isError ? (
        <>
          <Text className="text-4xl mb-4">⚠️</Text>
          <Text className="text-zinc-900 text-xl font-black text-center">Payment Pending</Text>
          <Text className="text-zinc-500 text-sm text-center mt-2 mb-6">
            We couldn't confirm your payment yet. You can check your tickets later.
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            className="bg-zinc-900 rounded-2xl px-8 py-4 mb-3"
          >
            <Text className="text-white font-bold">Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace("/tabs/tickets")}>
            <Text className="text-zinc-400 text-sm">Go to My Tickets</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#18181b" className="mb-4" />
          <Text className="text-zinc-900 text-xl font-black text-center">Confirming Payment…</Text>
          <Text className="text-zinc-500 text-sm text-center mt-2">
            Please wait while we verify your payment.
          </Text>
        </>
      )}
    </SafeAreaView>
  );
}
