// 팩 상품 카드 (2열 그리드).
//
// 확률은 여기 적지 않는다 — 목록에서 %가 크게 박혀 있으면 상품이 아니라 통계표로 읽힌다.
// 확률표는 팩 상세에서 전체를 한 번에 보여준다. 여기 적는 건 사는 데 필요한 값,
// 이름 · 가격 · 남은 수량뿐이다.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { C, R, T, NUM, won } from "@/lib/theme";
import { Odds, imageUrl } from "@/lib/api";

export function PackCard({ o, onPress }: { o: Odds; onPress: () => void }) {
  const p = o.pack;
  const src = imageUrl(p.image);
  const sold = p.total_slots ? p.sold_slots / p.total_slots : 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.card, pressed && { opacity: 0.75 }]}>
      <View style={st.thumb}>
        {src ? <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={140} />
          : <Text style={st.tier}>{Math.round(p.price / 1000)}K</Text>}
        {p.sold_out ? (
          <View style={st.soldOut}><Text style={st.soldOutText}>SOLD OUT</Text></View>
        ) : null}
      </View>

      <Text style={st.name} numberOfLines={2}>{p.name}</Text>
      <Text style={st.price}>{won(p.price)}</Text>

      <View style={st.track}><View style={[st.bar, { width: `${Math.min(100, sold * 100)}%` }]} /></View>
      <Text style={st.left}>잔여 {p.remaining_slots}/{p.total_slots}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { width: "48%" },
  thumb: { aspectRatio: 1, borderRadius: R.sm, overflow: "hidden", backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  tier: { ...NUM, color: C.n600, fontSize: 20, fontWeight: "600" },
  soldOut: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(10,10,10,0.66)", alignItems: "center", justifyContent: "center" },
  soldOutText: { ...T, color: C.n300, fontSize: 11, fontWeight: "600", letterSpacing: 1 },

  name: { ...T, color: C.n200, fontSize: 12.5, lineHeight: 17, marginTop: 9 },
  price: { ...NUM, color: C.text, fontSize: 13.5, fontWeight: "600", marginTop: 4 },
  track: { height: 2, backgroundColor: C.track, marginTop: 9, overflow: "hidden" },
  bar: { height: "100%", backgroundColor: C.n500 },
  left: { ...NUM, color: C.n600, fontSize: 10.5, marginTop: 5 },
});
