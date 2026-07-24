import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center px-6"
      >
        {/* Logo */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-2xl bg-zinc-800 items-center justify-center mb-4">
            <Text className="text-white text-2xl font-black">K</Text>
          </View>
          <Text className="text-white text-3xl font-black tracking-tight">Kwanix Driver</Text>
          <Text className="text-zinc-400 text-sm mt-1">Sign in to your driver account</Text>
        </View>

        {/* Form */}
        <View className="gap-3">
          <View>
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Email
            </Text>
            <TextInput
              className="bg-zinc-800 text-white rounded-2xl px-4 py-4 text-base"
              placeholder="driver@company.com"
              placeholderTextColor="#71717a"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View>
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Password
            </Text>
            <TextInput
              className="bg-zinc-800 text-white rounded-2xl px-4 py-4 text-base"
              placeholder="••••••••"
              placeholderTextColor="#71717a"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
          </View>

          {error && (
            <View className="bg-red-500/20 rounded-xl px-4 py-3">
              <Text className="text-red-400 text-sm font-medium">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            className="bg-white rounded-2xl py-4 items-center mt-2 active:opacity-80"
            onPress={() => login(email, password)}
            disabled={loading || !email || !password}
            style={{ opacity: loading || !email || !password ? 0.5 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text className="text-zinc-900 font-bold text-base">Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
