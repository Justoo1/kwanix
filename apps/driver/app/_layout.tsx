import "../global.css";
import "../lib/background-location"; // register GPS TaskManager task at startup
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getAccessToken } from "@/lib/auth-store";
import { router } from "expo-router";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getAccessToken().then((token) => {
      if (!token) router.replace("/(auth)/login");
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
