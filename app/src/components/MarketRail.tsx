// 마켓 최신 매물 가로 레일. 커머스 앱의 상품 카드 줄과 같은 구조지만,
// 카드에 적는 값은 판매가와 총 결제액(배송비 포함)이다 — 결제창에서 금액이 달라지는 일이 없게.
import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { C, R, T, NUM, won } from "@/lib/theme";
import { Listing, imageUrl } from "@/lib/api";

const W = 132;
const PAD = 20;

export function MarketRail({ items, shippingFee, onOpen }: {
  items: Listing[]; shippingFee: number; onOpen: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -PAD }}
      contentContainerStyle={{ paddingHorizontal: PAD, gap: 12 }}>
      {items.map((l) => {
        const src = imageUrl(l.images?.[0]);
        return (
          <Pressable key={l.id} onPress={() => onOpen(l.id)}
            style={({ pressed }) => [{ width: W }, pressed && { opacity: 0.75 }]}>
            <View style={st.thumb}>
              {src ? <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={140} />
                : <Text style={st.blank}>{l.kind === "box" ? "BOX" : "SINGLE"}</Text>}
            </View>
            <Text style={st.title} numberOfLines={2}>{l.title}</Text>
            <Text style={st.price}>{won(l.ask_price)}</Text>
            <Text style={st.total}>결제 {won(l.ask_price + shippingFee)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  thumb: { width: W, height: W * 1.3, borderRadius: R.sm, overflow: "hidden",
    borderWidth: 1, borderColor: C.line, backgroundColor: C.panel,
    alignItems: "center", justifyContent: "center" },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  blank: { ...T, color: C.artLabel, fontSize: 9.5, letterSpacing: 1.2 },
  title: { ...T, color: C.n200, fontSize: 12, lineHeight: 16, marginTop: 8 },
  price: { ...NUM, color: C.text, fontSize: 13.5, fontWeight: "600", marginTop: 4 },
  total: { ...NUM, color: C.n600, fontSize: 10, marginTop: 2 },
});
