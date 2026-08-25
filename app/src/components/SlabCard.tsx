// 그레이딩 슬랩 스타일 카드. 실제 카드 이미지가 붙기 전까지 등급·이름으로 구성한다.
import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { C, RARITY } from "@/lib/theme";

export function SlabCard({ name, grade, points, size = "md", style }: {
  name: string; grade: string; points?: number; size?: "sm" | "md" | "lg"; style?: ViewStyle;
}) {
  const r = RARITY[grade] || RARITY.common;
  const dims = size === "lg" ? { w: 240, h: 340, t: 20 } : size === "sm" ? { w: 104, h: 150, t: 12 } : { w: 150, h: 214, t: 14 };
  const isHit = grade === "HIT";
  return (
    <View style={[st.slab, { width: dims.w, height: dims.h, borderColor: isHit ? C.gold : C.line }, style]}>
      {/* 상단 라벨 — 그레이딩 슬랩의 라벨부 */}
      <View style={[st.label, { borderBottomColor: isHit ? C.gold : C.line }]}>
        <Text style={[st.labelGrade, { color: r.color, fontSize: dims.t }]} numberOfLines={1}>{r.label}</Text>
        {points != null ? <Text style={st.labelPts}>{Number(points).toLocaleString("ko-KR")}P</Text> : null}
      </View>
      {/* 카드 면 */}
      <View style={[st.face, isHit && { backgroundColor: "#1C1708" }]}>
        {isHit ? <View style={st.holo} /> : null}
        <Text style={[st.name, { fontSize: size === "lg" ? 18 : size === "sm" ? 11 : 14 }]} numberOfLines={3}>{name}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  slab: { borderWidth: 1.5, borderRadius: 12, backgroundColor: C.card, overflow: "hidden" },
  label: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", backgroundColor: "#0E0E12" },
  labelGrade: { fontWeight: "900", letterSpacing: 1 },
  labelPts: { color: C.sub, fontSize: 11, fontWeight: "700" },
  face: { flex: 1, alignItems: "center", justifyContent: "center", padding: 12, backgroundColor: C.cardHi },
  holo: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.gold, opacity: 0.07 },
  name: { color: C.text, fontWeight: "800", textAlign: "center", lineHeight: 22 },
});
