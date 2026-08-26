// 팩 한 줄. Piku에서 팔리는 건 이미지가 아니라 "지금 이 순간의 확률"이라서,
// 카드에서 가장 큰 글자는 팩 이름도 가격도 아닌 HIT 확률이다.
//
// 참고: 표시 확률은 서버가 남은 수량 ÷ 남은 슬롯으로 계산해 내려준 값 그대로다.
// 앱에서 반올림해 부풀리지 않는다.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { C, R, NUM, won, pct } from "@/lib/theme";
import { Odds, imageUrl } from "@/lib/api";

export function OddsRow({ o, onPress }: { o: Odds; onPress: () => void }) {
  const p = o.pack;
  const src = imageUrl(p.image);
  // HIT 전체가 나올 확률 — 개별 카드 확률보다 이게 사람이 실제로 묻는 값이다.
  const hitP = o.hits.reduce((s, h) => s + h.probability, 0);
  const top = [...o.hits].sort((a, b) => b.point_value - a.point_value)[0];
  const soldRatio = p.total_slots ? p.sold_slots / p.total_slots : 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
      <View style={st.head}>
        {/* 이미지가 없으면 빈 회색 상자 대신 가격대를 적는다 — 자리만 차지하는 장식은 두지 않는다 */}
        <View style={st.thumb}>
          {src ? <Image source={{ uri: src }} style={st.thumbFill} contentFit="cover" transition={140} />
            : <Text style={st.tier}>{Math.round(p.price / 1000)}K</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.name} numberOfLines={1}>{p.name}</Text>
          <Text style={st.price}>{won(p.price)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={st.pLabel}>HIT 확률</Text>
          <Text style={[st.p, p.sold_out && { color: C.n600 }]}>{pct(hitP)}</Text>
        </View>
      </View>

      {/* 슬롯 진행 — 이 막대가 차오를수록 위의 확률이 올라간다 */}
      <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, soldRatio * 100)}%` }]} /></View>

      <View style={st.foot}>
        <Text style={st.footText}>
          {p.sold_out ? "판매 종료" : `남은 슬롯 ${p.remaining_slots} / ${p.total_slots}`}
        </Text>
        {top ? <Text style={st.footText} numberOfLines={1}>최고가 {top.name}</Text> : null}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 44, height: 44, borderRadius: R.sm, overflow: "hidden",
    borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  tier: { ...NUM, color: C.n500, fontSize: 12, fontWeight: "600" },
  thumbFill: { width: "100%", height: "100%" },
  name: { color: C.text, fontSize: 15, fontWeight: "500" },
  price: { ...NUM, color: C.n500, fontSize: 12.5, marginTop: 3 },
  pLabel: { color: C.n600, fontSize: 9.5, letterSpacing: 1.2 },
  p: { ...NUM, color: C.text, fontSize: 22, fontWeight: "600", marginTop: 2, letterSpacing: -0.3 },
  track: { height: 2, backgroundColor: C.track, marginTop: 14, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: C.n400 },
  foot: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 8 },
  footText: { ...NUM, color: C.n500, fontSize: 11.5, flexShrink: 1 },
});
