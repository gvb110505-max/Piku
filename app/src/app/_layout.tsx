import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/lib/auth";
import { C } from "@/lib/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
            headerTitleStyle: { fontWeight: "800" },
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="pack/[id]" options={{ title: "팩 상세" }} />
          <Stack.Screen name="market/[id]" options={{ title: "상품" }} />
          <Stack.Screen name="market/sell" options={{ title: "판매 등록" }} />
          <Stack.Screen name="market/orders" options={{ title: "내 거래" }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
