// 홈 히어로 캐러셀.
//
// 커머스 앱의 큰 배너 자리. 문구는 얹지 않고 그 팩의 실제 정보만 둔다 — 이름 · 가격 · 남은 수량.
// 확률은 배너에 적지 않는다(상세에서 표로 본다).
// 이미지가 아직 없는 팩은 회색으로 두지 않고 팩 고유색 그라디언트로 채운다 —
// packHue가 id로 고정되니 같은 팩은 언제 봐도 같은 색이다.
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T, NUM, won, packHue } from "@/lib/theme";
import { Odds, imageUrl } from "@/lib/api";

const AUTO_MS = 5000;
const PAD = 20;
const H = 280;

export function HomeHero({ packs, onOpen }: { packs: Odds[]; onOpen: (id: number) => void }) {
  const { width } = useWindowDimensions();
  // 배너는 화면 폭을 거의 다 쓰고, 다음 장이 살짝 걸쳐 보이게 한다
  const slideW = Math.max(260, width - PAD * 2);
  const ref = useRef<ScrollView>(null);
  const [i, setI] = useState(0);
  // 사용자가 직접 넘긴 직후에는 자동 넘김이 끼어들지 않게 잠깐 쉰다
  const held = useRef(0);

  useEffect(() => {
    if (packs.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() < held.current) return;
      setI((prev) => {
        const next = (prev + 1) % packs.length;
        ref.current?.scrollTo({ x: next * slideW, animated: true });
        return next;
      });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [packs.length, slideW]);

  if (!packs.length) return null;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const n = Math.round(e.nativeEvent.contentOffset.x / slideW);
    if (n !== i) setI(n);
    held.current = Date.now() + AUTO_MS;
  }

  return (
    <View>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={slideW}
        onMomentumScrollEnd={onScroll}
        style={{ marginHorizontal: -PAD }}
        contentContainerStyle={{ paddingHorizontal: PAD }}
      >
        {packs.map((o) => {
          const p = o.pack;
          const src = imageUrl(p.image);
          const [h1, h2] = packHue(p.id);
          return (
            <Pressable key={p.id} onPress={() => onOpen(p.id)}
              style={({ pressed }) => [st.slide, { width: slideW }, pressed && { opacity: 0.85 }]}>
              {src ? (
                <>
                  <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={180} />
                  {/* 사진 위 글자가 읽히도록 아래쪽에만 어둠을 겹친다 */}
                  <View style={[st.scrim, { top: "30%", opacity: 0.5 }]} />
                  <View style={[st.scrim, { top: "58%", opacity: 0.68 }]} />
                </>
              ) : (
                <>
                  <LinearGradient colors={[h1, h2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.fill} />
                  {/* 색 위에서도 글자가 또렷하게 — 아래쪽만 눌러준다 */}
                  <LinearGradient colors={["transparent", "rgba(8,8,10,0.82)"]}
                    start={{ x: 0, y: 0.15 }} end={{ x: 0, y: 1 }} style={st.fill} />
                  <Text style={[st.ghostTier, { color: "rgba(255,255,255,0.16)" }]}>
                    {Math.round(p.price / 1000)}K
                  </Text>
                </>
              )}

              <View style={st.slideTop}>
                <View style={[st.badge, p.sold_out
                  ? { borderColor: C.lineStrong, backgroundColor: "rgba(8,8,10,0.55)" }
                  : { borderColor: "rgba(255,255,255,0.5)", backgroundColor: "rgba(8,8,10,0.42)" }]}>
                  <View style={[st.badgeDot, { backgroundColor: p.sold_out ? C.n500 : C.up }]} />
                  <Text style={st.badgeText}>{p.sold_out ? "판매 종료" : "판매 중"}</Text>
                </View>
              </View>

              <View style={st.slideBody}>
                <Text style={st.name} numberOfLines={1}>{p.name}</Text>
                <Text style={st.price}>{won(p.price)}</Text>

                <View style={st.metrics}>
                  <Text style={st.mLabel}>잔여</Text>
                  <Text style={st.mValue}>{p.remaining_slots}</Text>
                  <Text style={st.mOf}>/ {p.total_slots}</Text>
                </View>
              </View>

              <View style={st.counter}>
                <Text style={st.counterText}>{packs.indexOf(o) + 1}/{packs.length}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {packs.length > 1 ? (
        <View style={st.dots}>
          {packs.map((o, n) => <View key={o.pack.id} style={[st.dot, n === i && st.dotOn]} />)}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  slide: { height: H, borderRadius: R.md, overflow: "hidden", backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line, justifyContent: "space-between" },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#000" },

  slideTop: { padding: 13 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: R.pill, borderWidth: 1 },
  badgeDot: { width: 5, height: 5, borderRadius: 5 },
  badgeText: { ...T, color: C.text, fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
  ghostTier: { ...NUM, position: "absolute", right: 18, top: 40, fontSize: 92, fontWeight: "700" },

  slideBody: { padding: 18 },
  name: { ...T, color: C.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.6 },
  price: { ...NUM, color: C.text, fontSize: 17, fontWeight: "700", marginTop: 6 },

  metrics: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 14 },
  mLabel: { ...T, color: C.n400, fontSize: 11.5, marginRight: 2 },
  mValue: { ...NUM, color: C.hit, fontSize: 18, fontWeight: "700" },
  mOf: { ...NUM, color: C.n500, fontSize: 12.5 },

  counter: { position: "absolute", right: 12, bottom: 12, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: R.pill, backgroundColor: "rgba(8,8,10,0.6)", borderWidth: 1, borderColor: C.line },
  counterText: { ...NUM, color: C.n200, fontSize: 10.5, fontWeight: "500" },

  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 12 },
  dot: { width: 5, height: 5, borderRadius: 5, backgroundColor: C.n600 },
  dotOn: { backgroundColor: C.brand, width: 18 },
});
