// nocturne 공통 UI. 시안의 필 버튼 / 카드 / 필드 / 칩 규격을 그대로 옮겼다.
import React from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet,
  ViewStyle, TextStyle, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R } from "@/lib/theme";

export function Screen({ children, scroll, onRefresh, refreshing, style }: {
  children: React.ReactNode; scroll?: boolean; onRefresh?: () => void; refreshing?: boolean; style?: ViewStyle;
}) {
  const inner = <View style={[{ padding: 20, paddingBottom: 56 }, style]}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      {scroll === false ? inner : (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.accent} /> : undefined}
        >{inner}</ScrollView>
      )}
    </SafeAreaView>
  );
}

export const H1 = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) =>
  <Text style={[s.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) =>
  <Text style={[s.h2, style]}>{children}</Text>;
export const Sub = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) =>
  <Text style={[s.sub, style]}>{children}</Text>;
export const Body = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) =>
  <Text style={[s.body, style]}>{children}</Text>;
// 섹션 라벨 — 대문자 트래킹. 화면 상단이 아니라 섹션 머리에만 쓴다.
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={s.label}>{children}</Text>;

export function Card({ children, style, tone = "surface" }: {
  children: React.ReactNode; style?: ViewStyle; tone?: "surface" | "panel" | "accent";
}) {
  return <View style={[s.card, tone === "panel" && s.cardPanel, tone === "accent" && s.cardAccent, style]}>{children}</View>;
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
        off && { opacity: 0.4 },
        pressed && !off && { opacity: 0.75 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={kind === "primary" ? C.accent200 : C.n300} />
        : <Text style={[s.btnText, kind === "ghost" && { color: C.n300 }, kind === "danger" && { color: C.danger }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...p }: React.ComponentProps<typeof TextInput> & { label?: string; hint?: string }) {
  return (
    <View style={{ marginTop: 16 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.n500} {...p} style={[s.input, p.style]} />
      {hint ? <Text style={[s.sub, { marginTop: 6 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ text, on, onPress }: { text: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on ? s.chipOn : s.chipOff]}>
      <Text style={[s.chipText, { color: on ? C.accent200 : C.n300 }]}>{text}</Text>
    </Pressable>
  );
}

export function Pill({ text, tone = "neutral" }: { text: string; tone?: "accent" | "neutral" | "danger" }) {
  const fg = tone === "accent" ? C.accent200 : tone === "danger" ? C.danger : C.n300;
  return (
    <View style={[s.pill, tone === "accent" && { borderColor: C.accent, backgroundColor: C.accentFillStrong }]}>
      <Text style={{ color: fg, fontSize: 10, fontWeight: "500", letterSpacing: 0.5 }}>{text}</Text>
    </View>
  );
}

export function Bar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return <View style={s.bar}><View style={[s.barFill, { width: `${w}%` }]} /></View>;
}

export const Rule = () => <View style={s.rule} />;

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ paddingVertical: 64, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={C.accent} />
      {text ? <Sub>{text}</Sub> : null}
    </View>
  );
}
export function Empty({ text }: { text: string }) {
  return <View style={{ paddingVertical: 52, alignItems: "center" }}><Sub>{text}</Sub></View>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: "rgba(224,140,140,0.35)" }}>
      <Text style={{ color: C.danger, fontSize: 13, lineHeight: 20 }}>{message}</Text>
      {onRetry ? <Button title="다시 시도" kind="ghost" onPress={onRetry} style={{ marginTop: 14 }} /> : null}
    </Card>
  );
}
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 24, fontWeight: "500", letterSpacing: -0.3 },
  h2: { color: C.text, fontSize: 17, fontWeight: "500" },
  sub: { color: C.n500, fontSize: 12, lineHeight: 18 },
  body: { color: C.n400, fontSize: 13, lineHeight: 20 },
  label: { color: C.n600, fontSize: 10, fontWeight: "500", letterSpacing: 1.6, marginBottom: 10, textTransform: "uppercase" },
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: 16, marginTop: 14 },
  cardPanel: { backgroundColor: "#232532", borderRadius: R.lg, padding: 18, borderWidth: 1, borderColor: "rgba(233,233,237,0.10)" },
  cardAccent: { backgroundColor: "rgba(145,132,217,0.10)", borderWidth: 1, borderColor: C.accent, borderRadius: R.md },
  btn: { borderRadius: R.pill, height: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  btnPrimary: { backgroundColor: C.accentFill, borderWidth: 1, borderColor: C.accent },
  btnGhost: { borderWidth: 1, borderColor: "rgba(233,233,237,0.16)" },
  btnDanger: { borderWidth: 1, borderColor: "rgba(224,140,140,0.4)" },
  btnText: { color: C.accent200, fontWeight: "500", fontSize: 15 },
  input: { backgroundColor: C.surface, borderRadius: R.md, color: C.text, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, justifyContent: "center" },
  chipOn: { borderColor: C.accent, backgroundColor: C.accentFillStrong },
  chipOff: { borderColor: C.line, backgroundColor: C.surface },
  chipText: { fontSize: 12.5, fontWeight: "500" },
  pill: { borderRadius: R.sm, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(22,24,38,0.72)" },
  bar: { height: 3, backgroundColor: "rgba(233,233,237,0.08)", borderRadius: 3, overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", backgroundColor: C.accent },
  rule: { height: 1, backgroundColor: C.lineSoft, marginVertical: 4 },
});
