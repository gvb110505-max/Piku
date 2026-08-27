// 구성 상품 목록 — 이 팩에서 실제로 나올 수 있는 카드 전부.
//
// 위쪽 확률표는 숫자를 정확히 읽는 자리고, 여기는 "뭐가 들었는지" 눈으로 보는 자리다.
// 등급색으로 칠해서 HIT과 일반이 한눈에 갈리고, 이미지가 없는 칸도 회색으로 죽지 않게 한다.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T, NUM, pt, pct, gradeColor, gradeLabel } from "@/lib/theme";
import { imageUrl } from "@/lib/api";

export type Prize = {
  key: string; name: string; grade: string; image: string | null;
  probability: number; point_value?: number; remaining?: number; total?: number;
};

function Tile({ p }: { p: Prize }) {
  const g = gradeColor(p.grade);
  const src = imageUrl(p.image);
  const gone = p.remaining != null && p.remaining <= 0;

  return (
    <View style={[st.tile, gone && { opacity: 0.42 }]}>
      <View style={[st.art, { borderColor: g + (p.grade === "HIT" ? "AA" : "44") }]}>
        {src ? (
          <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={140} />
        ) : (
          <LinearGradient colors={[g + "3D", g + "0F"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
            style={st.fill} />
        )}
        <View style={[st.tag, { backgroundColor: g + "26", borderColor: g + "66" }]}>
          <Text style={[st.tagText, { color: g }]}>{gradeLabel(p.grade)}</Text>
        </View>
        {p.remaining != null && p.total != null ? (
          <Text style={st.left}>{gone ? "소진" : `${p.remaining}/${p.total}`}</Text>
        ) : null}
      </View>

      <Text style={st.name} numberOfLines={2}>{p.name}</Text>
      <View style={st.foot}>
        <Text style={[st.prob, { color: gone ? C.n600 : g }]}>{pct(p.probability)}</Text>
        {p.point_value != null ? <Text style={st.value}>{pt(p.point_value)}</Text> : null}
      </View>
    </View>
  );
}

export function PrizeGrid({ prizes }: { prizes: Prize[] }) {
  if (!prizes.length) return null;
  return <View style={st.grid}>{prizes.map((p) => <Tile key={p.key} p={p} />)}</View>;
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  tile: { width: "31%" },
  art: { aspectRatio: 3 / 4, borderRadius: R.sm, overflow: "hidden", borderWidth: 1,
    backgroundColor: C.panel },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  tag: { position: "absolute", top: 5, left: 5, paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1 },
  tagText: { ...T, fontSize: 7.5, fontWeight: "700", letterSpacing: 0.4 },
  left: { ...NUM, position: "absolute", bottom: 4, right: 5, color: C.text, fontSize: 9.5,
    fontWeight: "700", textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 4 },
  name: { ...T, color: C.n200, fontSize: 11, lineHeight: 15, marginTop: 7 },
  foot: { marginTop: 4 },
  prob: { ...NUM, fontSize: 11.5, fontWeight: "700" },
  value: { ...NUM, color: C.n500, fontSize: 10, marginTop: 1 },
});
