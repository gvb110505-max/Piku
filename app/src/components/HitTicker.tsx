// 실시간 HIT 티커 — 홈 히어로 아래에서 가로로 흐른다.
// 같은 줄을 두 벌 이어붙이고 한 벌 너비만큼 왼쪽으로 민 뒤 되감아 끊김 없이 순환시킨다.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { C, R, pt } from "@/lib/theme";
import type { RecentHit } from "@/lib/api";

const SPEED = 42;   // px/초 — 읽을 수 있을 만큼 느리게

export function HitTicker({ hits }: { hits: RecentHit[] }) {
  const x = useRef(new Animated.Value(0)).current;
  const [runWidth, setRunWidth] = useState(0);

  useEffect(() => {
    if (!runWidth) return;
    x.setValue(0);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: -runWidth,
        duration: (runWidth / SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }));
    anim.start();
    return () => anim.stop();
  }, [runWidth, x]);

  if (!hits.length) return null;

  // 교환가 큰 순으로 몇 건을 골라 "HEAVY HITS"로 따로 묶는다
  const sorted = [...hits].sort((a, b) => b.point_value - a.point_value);
  const heavy = sorted.slice(0, 3);
  const normal = hits.slice(0, 8);

  const Run = ({ measure }: { measure?: boolean }) => (
    <View
      style={st.run}
      onLayout={measure ? (e) => setRunWidth(e.nativeEvent.layout.width) : undefined}
    >
      <Text style={st.tag}>HITS</Text>
      {normal.map((hb, i) => <Item key={"n" + i} hit={hb} />)}
      <Text style={[st.tag, { color: C.gold }]}>HEAVY HITS</Text>
      {heavy.map((hb, i) => <Item key={"h" + i} hit={hb} gold />)}
    </View>
  );

  return (
    <View style={st.wrap}>
      <Animated.View style={[st.track, { transform: [{ translateX: x }] }]}>
        <Run measure />
        <Run />
      </Animated.View>
    </View>
  );
}

function Item({ hit, gold }: { hit: RecentHit; gold?: boolean }) {
  return (
    <View style={st.item}>
      <View style={st.avatar} />
      <Text style={st.who}>{hit.nickname}</Text>
      <Text style={st.card} numberOfLines={1}>{hit.name}</Text>
      <Text style={[st.pts, gold && { color: C.gold }]}>{pt(hit.point_value)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { height: 46, justifyContent: "center", overflow: "hidden",
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.lineSoft, backgroundColor: C.bg },
  track: { flexDirection: "row" },
  run: { flexDirection: "row", alignItems: "center", gap: 22, paddingRight: 22 },
  tag: { color: C.text, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: { width: 20, height: 20, borderRadius: R.sm - 2, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  who: { color: C.n400, fontSize: 12 },
  card: { color: C.n200, fontSize: 12, maxWidth: 150 },
  pts: { color: C.n500, fontSize: 11, fontWeight: "500" },
});
