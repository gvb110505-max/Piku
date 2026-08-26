// 홈 상단 회전 캐러셀.
//  - 위: 큰 히어로 카드가 팩을 번갈아 보여준다
//  - 아래: 히어로에 안 뜬 "나머지" 팩들이 같이 바뀐다
// 두 영역이 한 인덱스를 공유하므로 히어로가 넘어가면 아래 줄도 자연히 갱신된다.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, Easing, StyleSheet } from "react-native";
import { C, R, won, pct } from "@/lib/theme";
import { SlabCard } from "./SlabCard";
import type { Odds } from "@/lib/api";

const HOLD_MS = 4200;   // 한 팩이 히어로에 머무는 시간
const FADE_MS = 320;

export function PackCarousel({ packs, onOpen }: { packs: Odds[]; onOpen: (id: number) => void }) {
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
  const rest = packs.filter((_, n) => n !== i % packs.length);
  const p = cur.pack;
  // 가장 안 나오는 HIT = 확률이 가장 낮은 것. 히어로에서 이걸 미끼로 보여준다.
  const top = [...cur.hits].sort((a, b) => a.probability - b.probability)[0];

  return (
    <View style={{ gap: 14 }}>
      <Animated.View style={{ opacity: fade }}>
        <Pressable onPress={() => onOpen(p.id)} style={s.hero}>
          <View style={[s.glow, { width: 300, height: 300, borderRadius: 150, right: -90, top: -110, opacity: 0.10 }]} />
          <View style={[s.glow, { width: 220, height: 220, borderRadius: 110, right: -50, top: -70, opacity: 0.12 }]} />
          <View style={[s.glow, { width: 140, height: 140, borderRadius: 70, right: -10, top: -30, opacity: 0.14 }]} />

          <View style={s.heroArt}>
            <SlabCard grade={p.sold_out ? "common" : "HIT"} image={p.image} size="md" />
          </View>

          <Text style={s.heroTitle} numberOfLines={2}>{p.name}</Text>
          {top ? (
            <Text style={s.heroHit} numberOfLines={1}>
              {top.name} <Text style={s.heroHitPct}>{pct(top.probability)}</Text>
            </Text>
          ) : null}

          <View style={s.bar}>
            <View style={[s.barFill, { width: `${p.total_slots ? (p.sold_slots / p.total_slots) * 100 : 0}%` }]} />
          </View>
          <Text style={s.heroMeta}>개봉 {p.sold_slots} / {p.total_slots} · 남은 슬롯 {p.remaining_slots}</Text>

          <View style={s.cta}>
            <Text style={s.ctaText}>{p.sold_out ? "품절" : `${won(p.price)} 개봉하기`}</Text>
          </View>
        </Pressable>
      </Animated.View>

      {/* 페이지 인디케이터 */}
      {packs.length > 1 ? (
        <View style={s.dots}>
          {packs.map((o, n) => (
            <View key={o.pack.id} style={[s.dotBase, n === i % packs.length ? s.dotOn : s.dotOff]} />
          ))}
        </View>
      ) : null}

      {/* 나머지 팩 — 히어로가 넘어갈 때 같이 바뀐다 */}
      {rest.length ? (
        <Animated.View style={{ opacity: fade }}>
          <View style={s.restRow}>
            {rest.slice(0, 3).map((o) => (
              <Pressable key={o.pack.id} onPress={() => onOpen(o.pack.id)} style={s.restCard}>
                <SlabCard grade={o.pack.sold_out ? "common" : "HIT"} image={o.pack.image} size="md" />
                <Text style={s.restName} numberOfLines={2}>{o.pack.name}</Text>
                <Text style={[s.restPrice, o.pack.sold_out && { color: C.danger }]}>
                  {o.pack.sold_out ? "SOLD OUT" : won(o.pack.price)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    borderRadius: R.lg, padding: 20, overflow: "hidden", minHeight: 258,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    justifyContent: "flex-end",
  },
  glow: { position: "absolute", backgroundColor: C.accent },
  heroArt: { position: "absolute", right: 20, top: 34 },
  heroTitle: { color: C.text, fontSize: 26, fontWeight: "500", letterSpacing: -0.5, maxWidth: 210 },
  heroHit: { color: C.n400, fontSize: 12.5, marginTop: 8, maxWidth: 220 },
  heroHitPct: { color: C.accent200, fontWeight: "500" },
  bar: { height: 3, borderRadius: 3, backgroundColor: C.line, overflow: "hidden", marginTop: 14 },
  barFill: { height: "100%", backgroundColor: C.accent },
  heroMeta: { color: C.n500, fontSize: 11.5, marginTop: 8 },
  cta: {
    alignSelf: "flex-start", marginTop: 16, height: 44, paddingHorizontal: 20,
    borderRadius: R.pill, justifyContent: "center",
    backgroundColor: C.accentFill, borderWidth: 1, borderColor: C.accent,
  },
  ctaText: { color: C.accent200, fontSize: 15, fontWeight: "500" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dotBase: { height: 4, borderRadius: 4 },
  dotOn: { width: 18, backgroundColor: C.accent },
  dotOff: { width: 4, backgroundColor: C.lineStrong },
  restRow: { flexDirection: "row", gap: 12 },
  restCard: { flex: 1, gap: 7, alignItems: "center" },
  restName: { color: C.n300, fontSize: 11.5, lineHeight: 16, textAlign: "center" },
  restPrice: { color: C.text, fontSize: 12.5, fontWeight: "500", textAlign: "center" },
});
