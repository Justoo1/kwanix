import { Tabs } from "expo-router";
import { Text, View } from "react-native";

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View className="items-center gap-0.5 pt-1">
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text
        className={`text-[10px] font-semibold ${focused ? "text-white" : "text-zinc-500"}`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#18181b",
          borderTopColor: "#27272a",
          height: 68,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Trip" emoji="🚌" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="manifest"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Manifest" emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Scan" emoji="📷" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
