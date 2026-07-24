import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import { z } from "zod";
import { useBookTrip, useTripDetail } from "@/hooks/useTrips";
import { saveTicketId } from "@/lib/storage";
import { ghanaPhone } from "@routpass/mobile-shared";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: ghanaPhone,
  email: z.string().email().optional().or(z.literal("")),
});

export default function BookingScreen() {
  const { trip_id, seat } = useLocalSearchParams<{ trip_id: string; seat: string }>();
  const tripId = Number(trip_id);
  const seatNumber = Number(seat);

  const { data: trip } = useTripDetail(tripId);
  const bookMutation = useBookTrip(tripId);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const brandColor = trip?.brand_color || "#18181b";

  async function handleBook() {
    const validation = formSchema.safeParse({ name, phone, email });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((e) => {
        fieldErrors[String(e.path[0])] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    try {
      const result = await bookMutation.mutateAsync({
        passenger_name: name,
        passenger_phone: phone,
        passenger_email: email || undefined,
        seat_number: seatNumber,
      });

      await saveTicketId(result.ticket_id);

      router.push({
        pathname: "/payment/webview",
        params: {
          url: result.authorization_url,
          reference: result.reference,
          ticket_id: String(result.ticket_id),
        },
      });
    } catch {
      Alert.alert("Booking Failed", "Could not reserve this seat. Please try again.");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        {/* Nav */}
        <View className="flex-row items-center px-4 py-3 border-b border-zinc-100">
          <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
            <Text className="text-zinc-500 text-lg">←</Text>
          </TouchableOpacity>
          <Text className="text-zinc-900 font-black text-lg">Passenger Details</Text>
        </View>

        <ScrollView className="flex-1 px-4">
          {/* Trip recap */}
          {trip && (
            <View className="mt-4 mb-5 bg-zinc-50 rounded-2xl p-4">
              <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">
                Booking
              </Text>
              <Text className="text-zinc-900 font-black text-base">
                {trip.departure_station_name} → {trip.destination_station_name}
              </Text>
              <View className="flex-row gap-4 mt-1.5">
                <Text className="text-zinc-500 text-sm">Seat {seatNumber}</Text>
                {trip.price_ticket_base != null && (
                  <Text className="text-zinc-700 font-semibold text-sm">
                    GH₵{trip.price_ticket_base}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Form */}
          <View className="gap-4 pb-6">
            <Field
              label="Full Name"
              placeholder="Kofi Mensah"
              value={name}
              onChangeText={setName}
              error={errors.name}
            />
            <Field
              label="Phone Number"
              placeholder="0244123456"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />
            <Field
              label="Email (optional)"
              placeholder="kofi@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />
          </View>
        </ScrollView>

        {/* CTA */}
        <View className="px-4 pb-6 pt-3 border-t border-zinc-100">
          <TouchableOpacity
            onPress={handleBook}
            disabled={bookMutation.isPending}
            className="rounded-2xl py-4 items-center"
            style={{ backgroundColor: brandColor }}
          >
            {bookMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">
                Pay GH₵{trip?.price_ticket_base ?? "—"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  error,
  ...props
}: {
  label: string;
  error?: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <TextInput
        className="bg-zinc-100 text-zinc-900 rounded-2xl px-4 py-4 text-base"
        placeholderTextColor="#a1a1aa"
        {...props}
      />
      {error && <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text>}
    </View>
  );
}
