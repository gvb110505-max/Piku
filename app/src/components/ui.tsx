// 공통 UI 조각. 앱 전체가 같은 결을 갖도록 여기 모아둔다.
import React from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet,
  ViewStyle, TextStyle, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/lib/theme";

export function Screen({ children, scroll, onRefresh, refreshing, style }: {
  children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean; style?: ViewStyle;
}) {
  const inner = <View style={[{ padding: 16, paddingBottom: 48 }, style]}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      {scroll === false ? inner : (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.gold} /> : undefined}
        >{inner}</ScrollView>
      )}
    </SafeAreaView>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const H2 = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.h2, style]}>{children}</Text>;
export const Sub = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.sub, style]}>{children}</Text>;
export const Body = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.body, style]}>{children}</Text>;

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({ title, onPress, kind = "primary", disabled, loading, style }: {
  title: string; onPress?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        kind === "primary" && s.btnPrimary,
        kind === "ghost" && s.btnGhost,
        kind === "danger" && s.btnDanger,
        off && { opacity: 0.45 },
        pressed && !off && { opacity: 0.8 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={kind === "primary" ? "#111" : C.text} />
        : <Text style={[s.btnText, kind !== "primary" && { color: C.text }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...p }: React.ComponentProps<typeof TextInput> & { label?: string; hint?: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.sub}
        {...p}
        style={[s.input, p.style]}
      />
      {hint ? <Text style={[s.sub, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone = "neutral" }: { text: string; tone?: "on" | "off" | "neutral" | "gold" }) {
  const bg = tone === "on" ? "#14291C" : tone === "off" ? "#2A1A1F" : tone === "gold" ? "#2A2413" : C.cardHi;
  const fg = tone === "on" ? C.green : tone === "off" ? C.red : tone === "gold" ? C.gold : C.sub;
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 11, fontWeight: "800" }}>{text}</Text></View>;
}

export function Bar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return <View style={s.bar}><View style={[s.barFill, { width: `${w}%` }]} /></View>;
}

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ paddingVertical: 60, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={C.gold} />
      {text ? <Sub>{text}</Sub> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <View style={{ paddingVertical: 48, alignItems: "center" }}><Sub>{text}</Sub></View>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: "#4A2A33" }}>
      <Text style={{ color: C.red, fontWeight: "700" }}>{message}</Text>
      {onRetry ? <Button title="다시 시도" kind="ghost" onPress={onRetry} style={{ marginTop: 12 }} /> : null}
    </Card>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 26, fontWeight: "900", fontStyle: "italic" },
  h2: { color: C.text, fontSize: 17, fontWeight: "800" },
  sub: { color: C.sub, fontSize: 12, lineHeight: 18 },
  body: { color: C.text, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 12 },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: C.gold },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.line },
  btnDanger: { backgroundColor: "#2A1A1F", borderWidth: 1, borderColor: "#4A2A33" },
  btnText: { color: "#111", fontWeight: "900", fontSize: 15 },
  label: { color: C.sub, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: { backgroundColor: C.bg, borderColor: C.line, borderWidth: 1, borderRadius: 12, color: C.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  bar: { height: 6, backgroundColor: C.line, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", backgroundColor: C.goldDim },
});
