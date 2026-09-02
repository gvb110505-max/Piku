// nocturne 공통 UI. 시안의 필 버튼 / 카드 / 필드 / 칩 규격을 그대로 옮겼다.
import React from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet,
  ViewStyle, TextStyle, ScrollView, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T } from "@/lib/theme";

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
  const body = loading
    ? <ActivityIndicator color={kind === "primary" && !off ? C.onBrand : C.n300} />
    : <Text style={[s.btnText,
        kind === "primary" && off && { color: C.n500 },
        kind === "ghost" && { color: C.n300 },
        kind === "danger" && { color: C.danger }]}>{title}</Text>;

  // 주 버튼만 브랜드 그라디언트로 채운다 — 화면에서 "지금 누를 것"이 하나로 읽히게.
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        kind === "ghost" && s.btnGhost,
        kind === "danger" && s.btnDanger,
        off && kind !== "primary" && { opacity: 0.42 },
        pressed && !off && { opacity: 0.82 },
        style,
      ]}
    >
      {kind === "primary" ? (
        // 못 누르는 상태에서 브랜드 그라디언트를 흐리게 깔면 진흙색이 된다 —
        // 아예 회색 채움으로 바꿔서 "지금은 못 누른다"가 분명히 보이게 한다.
        off ? <View style={[s.btnFill, s.btnOff]}>{body}</View>
          : <LinearGradient colors={[C.brand, C.brand2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.btnFill}>{body}</LinearGradient>
      ) : body}
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
      <Text style={[s.chipText, { color: on ? C.brand : C.n300 }]}>{text}</Text>
    </Pressable>
  );
}

// color를 주면 그 색으로 칠한다 — 등급 칩처럼 색 자체가 정보인 자리에 쓴다.
export function Pill({ text, tone = "neutral", color }: {
  text: string; tone?: "accent" | "neutral" | "danger"; color?: string;
}) {
  const fg = color || (tone === "accent" ? C.brand : tone === "danger" ? C.danger : C.n300);
  const tinted = !!color || tone !== "neutral";
  return (
    <View style={[s.pill, tinted && { borderColor: fg + "66", backgroundColor: fg + "1F" }]}>
      <Text style={{ ...T, color: fg, fontSize: 10, fontWeight: "600", letterSpacing: 0.4 }}>{text}</Text>
    </View>
  );
}

export function Bar({ value, colors }: { value: number; colors?: [string, string] }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  const [a, b] = colors || [C.brand, C.brand2];
  return (
    <View style={s.bar}>
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[s.barFill, { width: `${w}%` }]} />
    </View>
  );
}

export const Rule = () => <View style={s.rule} />;

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ paddingVertical: 64, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={C.brand} />
      {text ? <Sub>{text}</Sub> : null}
    </View>
  );
}
export function Empty({ text }: { text: string }) {
  return <View style={{ paddingVertical: 52, alignItems: "center" }}><Sub>{text}</Sub></View>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: C.dangerLine }}>
      <Text style={{ ...T, color: C.danger, fontSize: 12.5, lineHeight: 19 }}>{message}</Text>
      {onRetry ? <Button title="다시 시도" kind="ghost" onPress={onRetry} style={{ marginTop: 14 }} /> : null}
    </Card>
  );
}
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  h1: { ...T, color: C.text, fontSize: 21, fontWeight: "600", letterSpacing: -0.4 },
  h2: { ...T, color: C.text, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  sub: { ...T, color: C.n500, fontSize: 11.5, lineHeight: 17 },
  body: { ...T, color: C.n400, fontSize: 12.5, lineHeight: 19 },
  // 한글에는 대문자 트래킹이 맞지 않는다("세 트 ( 선 택 )"처럼 벌어진다).
  // 섹션 라벨은 자간 없이, 크기로만 위계를 준다.
  label: { ...T, color: C.n500, fontSize: 11.5, fontWeight: "500", marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: 16, marginTop: 14, borderWidth: 1, borderColor: C.lineSoft },
  cardPanel: { backgroundColor: C.panel, borderRadius: R.lg, padding: 18, borderWidth: 1, borderColor: C.line },
  cardAccent: { backgroundColor: C.brandSoft, borderWidth: 1, borderColor: C.brandLine, borderRadius: R.md },
  btn: { borderRadius: R.pill, height: 48, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 20, overflow: "hidden" },
  btnFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center", justifyContent: "center" },
  btnOff: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  btnGhost: { borderWidth: 1, borderColor: C.lineStrong },
  btnDanger: { borderWidth: 1, borderColor: C.dangerLine, backgroundColor: C.dangerSoft },
  btnText: { ...T, color: C.onBrand, fontWeight: "700", fontSize: 14 },
  input: { ...T, backgroundColor: C.surface, borderRadius: R.md, color: C.text, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, justifyContent: "center" },
  chipOn: { borderColor: C.brandLine, backgroundColor: C.brandSoft },
  chipOff: { borderColor: C.line, backgroundColor: C.surface },
  chipText: { ...T, fontSize: 12, fontWeight: "500" },
  pill: { borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 3.5, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  bar: { height: 4, backgroundColor: C.track, borderRadius: 4, overflow: "hidden", marginTop: 8 },
  barFill: { height: "100%", borderRadius: 4 },
  rule: { height: 1, backgroundColor: C.lineSoft, marginVertical: 4 },
});
