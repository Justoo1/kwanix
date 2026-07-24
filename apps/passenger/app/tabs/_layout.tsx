import { Tabs } from "expo-router";
import { Text, View } from "react-native";

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View className="items-center gap-0.5 pt-1">
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text className={`text-[10px] font-semibold ${focused ? "text-zinc-900" : "text-zinc-400"}`}>
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
          backgroundColor: "#ffffff",
          borderTopColor: "#e4e4e7",
          height: 68,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Search" emoji="🔍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Tickets" emoji="🎫" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Track" emoji="📦" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
