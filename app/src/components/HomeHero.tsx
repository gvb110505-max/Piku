// 홈 히어로 캐러셀.
//
// 커머스 앱의 큰 배너 자리. 문구는 얹지 않고 그 팩의 실제 정보만 둔다 — 이름 · 가격 · 남은 수량.
// 확률은 배너에 적지 않는다(상세에서 표로 본다). 이미지가 없어도 빈 회색 상자로 두지 않는다.
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, ScrollView, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { C, R, T, NUM, won } from "@/lib/theme";
import { Odds, imageUrl } from "@/lib/api";

const AUTO_MS = 5000;
const PAD = 20;
const H = 190;

export function HomeHero({ packs, onOpen }: { packs: Odds[]; onOpen: (id: number) => void }) {
  const { width } = useWindowDimensions();
  const slideW = Math.max(240, width - PAD * 2);
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
          return (
            <Pressable key={p.id} onPress={() => onOpen(p.id)}
              style={({ pressed }) => [st.slide, { width: slideW }, pressed && { opacity: 0.85 }]}>
              {src ? (
                <>
                  <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={180} />
                  {/* 사진 위 글자가 읽히도록 아래쪽에만 어둠을 겹친다 */}
                  <View style={[st.scrim, { top: "35%", opacity: 0.45 }]} />
                  <View style={[st.scrim, { top: "60%", opacity: 0.6 }]} />
                </>
              ) : null}

              <View style={st.slideTop}>
                <Text style={st.badge}>{p.sold_out ? "판매 종료" : "판매 중"}</Text>
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
  badge: { ...T, alignSelf: "flex-start", color: C.n300, fontSize: 9.5, letterSpacing: 0.8,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: "rgba(10,10,10,0.5)", overflow: "hidden" },

  slideBody: { padding: 16 },
  name: { ...T, color: C.text, fontSize: 17, fontWeight: "600", letterSpacing: -0.4 },
  price: { ...NUM, color: C.n200, fontSize: 13, marginTop: 4 },

  metrics: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 12 },
  mLabel: { ...T, color: C.n500, fontSize: 10.5, marginRight: 2 },
  mValue: { ...NUM, color: C.text, fontSize: 14, fontWeight: "600" },
  mOf: { ...NUM, color: C.n500, fontSize: 11 },

  counter: { position: "absolute", right: 12, bottom: 12, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: R.pill, backgroundColor: "rgba(10,10,10,0.62)" },
  counterText: { ...NUM, color: C.n200, fontSize: 10.5, fontWeight: "500" },

  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 12 },
  dot: { width: 5, height: 5, borderRadius: 5, backgroundColor: C.n600 },
  dotOn: { backgroundColor: C.text, width: 16 },
});
