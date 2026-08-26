import React from "react";
import { Text, type ColorValue } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";
import { Screen, Loading } from "@/components/ui";
import { IconHome, IconBag, IconBinder, IconUser } from "@/components/icons";

// 기본 라벨은 한글 받침이 잘려서(홈 → 호) 직접 렌더한다
function TabLabel({ children, color }: { children: React.ReactNode; color: ColorValue }) {
  return (
    <Text style={{ color, fontSize: 10, lineHeight: 16, fontWeight: "500", textAlign: "center",
      includeFontPadding: false, paddingTop: 2 }}>{children}</Text>
  );
}

export default function TabsLayout() {
  const { ready, signedIn } = useAuth();
  if (!ready) return <Screen scroll={false}><Loading /></Screen>;
  if (!signedIn) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.track, height: 82, paddingTop: 10, paddingBottom: 24 },
        tabBarActiveTintColor: C.accent200,
        tabBarInactiveTintColor: C.n600,
        
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "홈", tabBarLabel: ({ color }) => <TabLabel color={color}>홈</TabLabel>, tabBarIcon: ({ color }) => <IconHome color={color as string} /> }} />
      <Tabs.Screen name="market" options={{ title: "마켓", tabBarLabel: ({ color }) => <TabLabel color={color}>마켓</TabLabel>, tabBarIcon: ({ color }) => <IconBag color={color as string} /> }} />
      <Tabs.Screen name="collection" options={{ title: "컬렉션", tabBarLabel: ({ color }) => <TabLabel color={color}>컬렉션</TabLabel>, tabBarIcon: ({ color }) => <IconBinder color={color as string} /> }} />
      <Tabs.Screen name="me" options={{ title: "마이", tabBarLabel: ({ color }) => <TabLabel color={color}>마이</TabLabel>, tabBarIcon: ({ color }) => <IconUser color={color as string} /> }} />
    </Tabs>
  );
}
