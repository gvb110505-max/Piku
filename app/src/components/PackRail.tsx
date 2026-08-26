// 가로 스크롤 팩 레일. 이미지 · 잔여 배지 · 진행바 · 할인가를 한 카드에 담는다.
import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { C, R, won } from "@/lib/theme";
import { imageUrl } from "@/lib/api";
import type { Odds } from "@/lib/api";

export function PackRail({ packs, onOpen }: { packs: Odds[]; onOpen: (id: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={st.row}>
      {packs.map((o) => {
        const p = o.pack;
        const src = imageUrl(p.image);
        const list = p.list_price && p.list_price > p.price ? p.list_price : null;
        const off = list ? Math.round((1 - p.price / list) * 100) : null;
        return (
          <Pressable key={p.id} onPress={() => onOpen(p.id)} style={st.card}>
            <View style={st.art}>
              {src ? (
                <Image source={{ uri: src }} style={st.artFill} contentFit="cover" transition={160} />
              ) : <View style={[st.artFill, { backgroundColor: "#171717" }]} />}
              {/* 광고 문구 대신 실제 재고를 배지에 쓴다 */}
              <View style={[st.badge, p.sold_out && st.badgeOut]}>
                <Text style={[st.badgeText, p.sold_out && { color: C.danger }]}>
                  {p.sold_out ? "SOLD OUT" : `잔여 ${p.remaining_slots}`}
                </Text>
              </View>
            </View>

            <Text style={st.name} numberOfLines={1}>{p.name}</Text>
            <View style={st.bar}>
              <View style={[st.barFill, { width: `${p.total_slots ? (p.sold_slots / p.total_slots) * 100 : 0}%` }]} />
            </View>
            <View style={st.priceRow}>
              {off ? <Text style={st.off}>{off}%</Text> : null}
              {list ? <Text style={st.list}>{won(list)}</Text> : null}
              <Text style={st.price}>{Number(p.price).toLocaleString("ko-KR")}</Text>
              <Text style={st.unit}>원</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { gap: 12, paddingHorizontal: 20, paddingVertical: 4 },
  card: { width: 208, backgroundColor: C.surface, borderRadius: R.md, padding: 10, gap: 9 },
  art: { height: 132, borderRadius: R.sm + 2, overflow: "hidden", backgroundColor: "#171717" },
  artFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  badge: { position: "absolute", top: 8, left: 8, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: R.sm, backgroundColor: C.gold },
  badgeOut: { backgroundColor: "rgba(10,10,10,0.86)" },
  badgeText: { color: "#1A1405", fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  name: { color: C.text, fontSize: 14, fontWeight: "600" },
  bar: { height: 4, borderRadius: 4, backgroundColor: C.track, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: C.n300 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  off: { color: C.gold, fontSize: 12.5, fontWeight: "700" },
  list: { color: C.n500, fontSize: 11.5, textDecorationLine: "line-through" },
  price: { color: C.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginLeft: "auto" },
  unit: { color: C.text, fontSize: 11.5, fontWeight: "600", paddingBottom: 2 },
});
