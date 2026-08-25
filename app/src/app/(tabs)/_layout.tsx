import React from "react";
import { Text, type ColorValue } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";
import { Screen, Loading } from "@/components/ui";

function Icon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { ready, signedIn } = useAuth();
  if (!ready) return <Screen scroll={false}><Loading /></Screen>;
  if (!signedIn) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.line },
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.sub,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarItemStyle: { paddingHorizontal: 2 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "홈", tabBarIcon: ({ color }) => <Icon glyph="◆" color={color} /> }} />
      <Tabs.Screen name="market" options={{ title: "마켓", tabBarIcon: ({ color }) => <Icon glyph="◈" color={color} /> }} />
      <Tabs.Screen name="collection" options={{ title: "컬렉션", tabBarIcon: ({ color }) => <Icon glyph="▦" color={color} /> }} />
      <Tabs.Screen name="me" options={{ title: "마이", tabBarIcon: ({ color }) => <Icon glyph="●" color={color} /> }} />
    </Tabs>
  );
}
