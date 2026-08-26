// 홈 최상단 풀블리드 히어로. 팩을 번갈아 보여주고, 그 위에 로고·포인트를 얹는다.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { C, R, won } from "@/lib/theme";
import { imageUrl } from "@/lib/api";
import type { Odds } from "@/lib/api";

const HOLD_MS = 4600;
const FADE_MS = 340;

export function PackHero({ packs, points, onOpen }: {
  packs: Odds[]; points: number; onOpen: (id: number) => void;
}) {
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (packs.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true })
        .start(() => {
          setI((n) => (n + 1) % packs.length);
          Animated.timing(fade, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        });
    }, HOLD_MS);
    return () => clearInterval(t);
  }, [packs.length, fade]);

  if (!packs.length) return null;
  const cur = packs[i % packs.length];
  const p = cur.pack;
  const src = imageUrl(p.image);
  const list = p.list_price && p.list_price > p.price ? p.list_price : null;
  const off = list ? Math.round((1 - p.price / list) * 100) : null;
  const height = Math.min(Math.round(width * 1.28), 520);

  return (
    <Pressable onPress={() => onOpen(p.id)} style={[st.wrap, { height }]}>
      <Animated.View style={[st.fill, { opacity: fade }]}>
        {src ? (
          <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={200} />
        ) : (
          <View style={[st.fill, st.placeholder]} />
        )}
      </Animated.View>

      {/* 글자가 이미지 위에서 읽히도록 아래쪽만 단계적으로 어둡게 깐다.
          단색 한 장으로 덮으면 이미지가 통째로 죽는다. */}
      <View style={[st.scrim, { height: "46%", backgroundColor: "rgba(10,10,10,0.30)" }]} pointerEvents="none" />
      <View style={[st.scrim, { height: "30%", backgroundColor: "rgba(10,10,10,0.45)" }]} pointerEvents="none" />
      <View style={[st.scrim, { height: "18%", backgroundColor: "rgba(10,10,10,0.55)" }]} pointerEvents="none" />

      {/* 오버레이 헤더 */}
      <View style={st.header}>
        <Text style={st.logo}>PIKU</Text>
        <View style={st.headerRight}>
          <View style={st.balance}>
            <View style={st.coin} />
            <Text style={st.balanceText}>{Number(points).toLocaleString("ko-KR")}</Text>
          </View>
          <View style={st.bell}>
            <View style={st.bellDot} />
          </View>
        </View>
      </View>

      <Animated.View style={[st.body, { opacity: fade }]}>
        <Text style={st.eyebrow}>FEATURED DROP</Text>
        <Text style={st.title} numberOfLines={2}>{p.name}</Text>

        <View style={st.bar}>
          <View style={[st.barFill, { width: `${p.total_slots ? (p.sold_slots / p.total_slots) * 100 : 0}%` }]} />
        </View>

        <View style={st.priceRow}>
          <Text style={st.slots}>
            <Text style={st.slotsNow}>{p.sold_slots}</Text> / {p.total_slots}
          </Text>
          <View style={st.priceRight}>
            {off ? <Text style={st.off}>{off}%</Text> : null}
            {list ? <Text style={st.list}>{won(list)}</Text> : null}
            <Text style={st.price}>{Number(p.price).toLocaleString("ko-KR")}</Text>
            <Text style={st.priceUnit}>원</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { width: "100%", backgroundColor: "#0E0E0E", justifyContent: "flex-end" },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  placeholder: { backgroundColor: "#141414" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0 },
  header: { position: "absolute", left: 20, right: 20, top: 14, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between" },
  logo: { color: C.text, fontSize: 24, fontWeight: "800", fontStyle: "italic", letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  balance: { flexDirection: "row", alignItems: "center", gap: 7, height: 38, paddingHorizontal: 14,
    borderRadius: R.pill, backgroundColor: "rgba(30,30,30,0.82)" },
  coin: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: C.gold },
  balanceText: { color: C.text, fontSize: 14, fontWeight: "600" },
  bell: { width: 38, height: 38, borderRadius: R.pill, backgroundColor: "rgba(30,30,30,0.82)",
    alignItems: "center", justifyContent: "center" },
  bellDot: { width: 13, height: 13, borderRadius: 3, borderWidth: 1.6, borderColor: C.n300 },

  body: { paddingHorizontal: 20, paddingBottom: 22, gap: 10 },
  eyebrow: { color: C.n400, fontSize: 11, fontWeight: "600", letterSpacing: 2.4 },
  title: { color: C.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.6, lineHeight: 34 },
  bar: { height: 5, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.16)", overflow: "hidden", marginTop: 4 },
  barFill: { height: "100%", backgroundColor: C.text },
  priceRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  slots: { color: C.n400, fontSize: 14 },
  slotsNow: { color: C.text, fontWeight: "700" },
  priceRight: { flexDirection: "row", alignItems: "flex-end", gap: 7 },
  off: { color: C.gold, fontSize: 15, fontWeight: "700" },
  list: { color: C.n500, fontSize: 13, textDecorationLine: "line-through" },
  price: { color: C.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  priceUnit: { color: C.text, fontSize: 14, fontWeight: "600", paddingBottom: 3 },
});
