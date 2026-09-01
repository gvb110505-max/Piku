// 상품 구성표.
//
// 확률(%)은 적지 않는다. 대신 남은 재고 수량만 그대로 보여준다 —
// HIT 잔여 합 + 일반(N LINE) = 남은 슬롯이 정확히 맞아떨어지므로,
// 보는 사람이 직접 "1 / 300" 처럼 계산할 수 있다. 반올림된 %보다 정보가 더 많다.
//
// 묶음은 세 단: HEAVY HITS(간판) → HITS → N LINE(꽝은 한 칸으로 통일).
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T, NUM } from "@/lib/theme";
import { imageUrl } from "@/lib/api";

export type PrizeItem = {
  key: string; name: string; qty: number; image: string | null;
  color: string; label?: string; gone?: boolean;
};
export type PrizeSection = { title: string; color: string; items: PrizeItem[] };

function Tile({ p }: { p: PrizeItem }) {
  const src = imageUrl(p.image);
  return (
    <View style={[st.tile, p.gone && { opacity: 0.4 }]}>
      <View style={[st.art, { borderColor: p.color + "88" }]}>
        {src ? (
          <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={140} />
        ) : (
          <LinearGradient colors={[p.color + "3D", p.color + "0F"]}
            start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={st.fill} />
        )}
        {p.label ? (
          <View style={[st.chip, { backgroundColor: "rgba(8,8,10,0.72)", borderColor: p.color + "66" }]}>
            <Text style={[st.chipText, { color: p.color }]}>{p.label}</Text>
          </View>
        ) : null}
        <View style={[st.qty, { backgroundColor: p.color }]}>
          <Text style={st.qtyText}>{p.gone ? "소진" : `x${p.qty.toLocaleString("ko-KR")}`}</Text>
        </View>
      </View>
      <Text style={st.name} numberOfLines={2}>{p.name}</Text>
    </View>
  );
}

export function PrizeList({ sections }: { sections: PrizeSection[] }) {
  return (
    <View>
      {sections.filter((s) => s.items.length).map((s) => (
        <View key={s.title} style={{ marginTop: 20 }}>
          <View style={st.head}>
            <View style={[st.headBar, { backgroundColor: s.color }]} />
            <Text style={st.headText}>{s.title}</Text>
          </View>
          <View style={st.grid}>{s.items.map((p) => <Tile key={p.key} p={p} />)}</View>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  headBar: { width: 3, height: 15, borderRadius: 3 },
  headText: { ...T, color: C.text, fontSize: 14, fontWeight: "700", letterSpacing: 0.6 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "48%" },
  art: { aspectRatio: 3 / 4, borderRadius: R.sm, overflow: "hidden", borderWidth: 1,
    backgroundColor: C.panel },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },

  chip: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 5, borderWidth: 1 },
  chipText: { ...T, fontSize: 8.5, fontWeight: "700", letterSpacing: 0.5 },

  qty: { position: "absolute", top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: R.sm },
  qtyText: { ...NUM, color: "#0A0A0A", fontSize: 11, fontWeight: "800" },

  name: { ...T, color: C.n200, fontSize: 12, lineHeight: 16, marginTop: 8 },
});
