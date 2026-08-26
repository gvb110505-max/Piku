// 실시간 HIT 당첨 티커 — 홈 최상단에서 최근 HIT 당첨자가 한 줄씩 올라온다.
// 서버가 닉네임을 마스킹해서 내려주므로 여기서는 그대로 표시만 한다.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { C, R, pt } from "@/lib/theme";
import type { RecentHit } from "@/lib/api";

const HOLD_MS = 2600;   // 한 건이 머무는 시간
const SLIDE_MS = 420;   // 다음 건으로 밀려 올라가는 시간

export function HitTicker({ hits }: { hits: RecentHit[] }) {
  const [i, setI] = useState(0);
  const y = useRef(new Animated.Value(0)).current;
  const dot = useRef(new Animated.Value(0)).current;

  // 살아있다는 느낌을 주는 점멸. 데이터가 없어도 계속 돈다.
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dot, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [dot]);

  useEffect(() => {
    if (hits.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(y, { toValue: -1, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        .start(() => {
          setI((n) => (n + 1) % hits.length);
          y.setValue(0);
        });
    }, HOLD_MS);
    return () => clearInterval(t);
  }, [hits.length, y]);

  if (!hits.length) return null;

  const cur = hits[i];
  const next = hits[(i + 1) % hits.length];
  const translateY = y.interpolate({ inputRange: [-1, 0], outputRange: [-26, 0] });
  const dotOpacity = dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <View style={s.wrap}>
      <View style={s.badge}>
        <Animated.View style={[s.dot, { opacity: dotOpacity }]} />
        <Text style={s.badgeText}>LIVE</Text>
      </View>

      {/* 26px 창을 두고 두 줄을 위로 밀어 올린다 */}
      <View style={s.window}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Line hit={cur} />
          <Line hit={next} />
        </Animated.View>
      </View>
    </View>
  );
}

function Line({ hit }: { hit: RecentHit }) {
  return (
    <View style={s.line}>
      <Text style={s.who} numberOfLines={1}>{hit.nickname}</Text>
      <Text style={s.verb}>님</Text>
      <Text style={s.card} numberOfLines={1}>{hit.name}</Text>
      <Text style={s.points}>{pt(hit.point_value)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    height: 44, paddingHorizontal: 12, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong,
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0,
    paddingHorizontal: 8, height: 22, borderRadius: R.pill,
    backgroundColor: C.accentFillStrong, borderWidth: 1, borderColor: C.accent,
  },
  dot: { width: 5, height: 5, borderRadius: 5, backgroundColor: C.accent200 },
  badgeText: { color: C.accent200, fontSize: 9, fontWeight: "500", letterSpacing: 1.2 },
  window: { flex: 1, height: 26, overflow: "hidden", justifyContent: "flex-start" },
  line: { height: 26, flexDirection: "row", alignItems: "center", gap: 4 },
  who: { color: C.accent200, fontSize: 12, fontWeight: "500", flexShrink: 0, maxWidth: 62 },
  verb: { color: C.n500, fontSize: 12, flexShrink: 0 },
  card: { color: C.text, fontSize: 12, fontWeight: "500", flex: 1, marginLeft: 2 },
  points: { color: C.n400, fontSize: 11, fontWeight: "500", flexShrink: 0 },
});
