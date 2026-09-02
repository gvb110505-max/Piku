// 마켓 목록 한 칸.
//
// 카드 거래는 사진으로 고른다 — 상태·광택·센터링이 값을 정하기 때문에
// 이름만 늘어놓은 목록은 쓸모가 적다. 사진을 크게 두고 값은 그 아래로.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T, NUM, won, packHue } from "@/lib/theme";
import { Listing, imageUrl } from "@/lib/api";

export function ListingCard({ item, shippingFee, onPress }: {
  item: Listing; shippingFee: number; onPress: () => void;
}) {
  const src = imageUrl(item.images?.[0]);
  const [h1, h2] = packHue(item.id);
  const sold = item.status !== "active";
  // 세트·등급·상태 중 있는 것만. 없으면 줄을 아예 안 만든다("정보 없음"은 쓰지 않는다)
  const meta = [item.card_set, item.grade, item.condition].filter(Boolean).join(" · ");

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.card, pressed && { opacity: 0.75 }]}>
      <View style={st.art}>
        {src ? (
          <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={140} />
        ) : (
          <>
            <LinearGradient colors={[h1 + "44", h2 + "18"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
              style={st.fill} />
            <Text style={st.blank}>{item.kind === "box" ? "BOX" : "SINGLE"}</Text>
          </>
        )}
        <View style={st.kind}><Text style={st.kindText}>{item.kind === "box" ? "박스" : "싱글"}</Text></View>
        {sold ? <View style={st.sold}><Text style={st.soldText}>판매완료</Text></View> : null}
      </View>

      <Text style={st.title} numberOfLines={2}>{item.title}</Text>
      {meta ? <Text style={st.meta} numberOfLines={1}>{meta}</Text> : null}
      <Text style={st.price}>{won(item.ask_price)}</Text>
      <Text style={st.total}>결제 {won(item.ask_price + shippingFee)}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { width: "48%" },
  art: { aspectRatio: 3 / 4, borderRadius: R.md, overflow: "hidden", backgroundColor: C.panel,
    alignItems: "center", justifyContent: "center" },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  blank: { ...T, color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },

  kind: { position: "absolute", top: 7, left: 7, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: R.sm, backgroundColor: "rgba(8,8,10,0.7)", borderWidth: 1, borderColor: C.line },
  kindText: { ...T, color: C.n200, fontSize: 9.5, fontWeight: "600" },
  sold: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(8,8,10,0.66)", alignItems: "center", justifyContent: "center" },
  soldText: { ...T, color: C.n200, fontSize: 12, fontWeight: "700", letterSpacing: 1 },

  title: { ...T, color: C.n200, fontSize: 12.5, lineHeight: 17, marginTop: 9 },
  meta: { ...T, color: C.n600, fontSize: 10.5, marginTop: 3 },
  price: { ...NUM, color: C.text, fontSize: 14, fontWeight: "700", marginTop: 5 },
  total: { ...NUM, color: C.n600, fontSize: 10.5, marginTop: 2 },
});
