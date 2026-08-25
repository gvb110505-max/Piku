// 카드 아트 자리표시. 실제 스캔이 붙기 전까지 시안의 그라디언트 + 포일 시트로 대체한다.
import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { C, ART, R, gradeLabel, gradeColor } from "@/lib/theme";

const SIZES = {
  sm: { w: 60, h: 82, label: 0 },
  md: { w: 104, h: 142, label: 8 },
  lg: { w: 220, h: 300, label: 8.5 },
} as const;

export function SlabCard({ name, grade, points, size = "md", style }: {
  name?: string; grade: string; points?: number; size?: "sm" | "md" | "lg"; style?: ViewStyle;
}) {
  const d = SIZES[size];
  const hit = grade === "HIT";
  const [a, b, c] = hit ? ART.hero : ART.base;
  return (
    <View style={[st.wrap, { width: d.w, height: d.h, backgroundColor: b,
      borderColor: hit ? "rgba(145,132,217,0.5)" : "rgba(233,233,237,0.09)" }, style]}>
      {/* 3단 그라디언트를 겹친 뷰로 근사 — RN에 CSS 그라디언트가 없다 */}
      <View style={[st.fill, { backgroundColor: a, opacity: 0.85 }]} />
      <View style={[st.fill, { backgroundColor: c, opacity: 0.45, top: "45%" }]} />
      <View style={st.foil} />
      {size !== "sm" ? (
        <View style={st.tag}>
          <Text style={{ color: gradeColor(grade), fontSize: 9, fontWeight: "500", letterSpacing: 0.6 }}>
            {gradeLabel(grade)}
          </Text>
        </View>
      ) : null}
      {size === "lg" && name ? (
        <Text style={st.name} numberOfLines={3}>{name}</Text>
      ) : d.label ? (
        <Text style={[st.art, { fontSize: d.label }]}>CARD ART</Text>
      ) : null}
      {size !== "sm" && points != null ? (
        <Text style={st.pts}>{Number(points).toLocaleString("ko-KR")}P</Text>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: R.md, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 10 },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  foil: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(233,233,237,0.06)", transform: [{ rotate: "26deg" }, { scaleX: 0.4 }] },
  tag: { position: "absolute", top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: R.sm, backgroundColor: "rgba(22,24,38,0.72)" },
  pts: { position: "absolute", bottom: 8, right: 9, color: C.n400, fontSize: 10, fontWeight: "500" },
  art: { color: "rgba(233,233,237,0.4)", fontWeight: "500", letterSpacing: 1.4 },
  name: { color: C.text, fontSize: 17, fontWeight: "500", textAlign: "center", lineHeight: 24 },
});
