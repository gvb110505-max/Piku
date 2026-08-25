// 개봉 연출 — 시안의 바인더 스택 위로 카드가 뒤집혀 올라온다.
// 내장 Animated만 사용해 추가 설정 없이 동작한다.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { C, R, pt } from "@/lib/theme";
import { SlabCard } from "./SlabCard";
import type { DrawResult } from "@/lib/api";

export function Reveal({ result, packName, onExchange, onShip, onDone }: {
  result: DrawResult; packName?: string;
  onExchange?: () => void; onShip?: () => void; onDone: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const hit = result.grade === "HIT";

  const open = () => {
    if (opened) return;
    setOpened(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(hit ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    Animated.timing(flip, { toValue: 1, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      if (hit && Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
  };

  useEffect(() => {
    if (!opened || !hit) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opened, hit, glow]);

  const rotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "0deg"] });
  const scale = flip.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.88, 1.05, 1] });
  const coverOpacity = flip.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: "clamp" });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.34] });

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text style={st.meta}>{packName ?? "랜덤팩"}</Text>
        <Text style={st.meta}>{result.draw_no}번째 개봉</Text>
      </View>

      <Pressable onPress={open} style={st.stage}>
        {hit && opened ? <Animated.View style={[st.glow, { opacity: glowOpacity }]} /> : null}
        <View style={[st.ghost, { transform: [{ rotate: "7deg" }, { translateY: 10 }], opacity: 0.35 }]} />
        <View style={[st.ghost, { transform: [{ rotate: "-4deg" }, { translateY: 4 }], opacity: 0.55 }]} />

        <Animated.View style={{ transform: [{ perspective: 900 }, { rotateY }, { scale }] }}>
          <SlabCard name={result.name} grade={result.grade} points={result.point_value} size="lg" />
        </Animated.View>

        {!opened ? (
          <Animated.View style={[st.cover, { opacity: coverOpacity }]} pointerEvents="none">
            <Text style={st.coverText}>탭해서 개봉</Text>
          </Animated.View>
        ) : null}
      </Pressable>

      {opened ? (
        <View style={{ alignItems: "center", gap: 6, paddingTop: 26 }}>
          <Text style={st.name}>{result.name}</Text>
          <Text style={st.sub}>
            {packName ?? "랜덤팩"} · {result.grade === "HIT" ? "HIT" : "일반 카드"} · 교환 {pt(result.point_value)}
          </Text>

          {result.bonus ? (
            <View style={st.bonus}>
              <Text style={st.bonusTitle}>GUARANTEED #{result.bonus.slot_no}</Text>
              <Text style={st.bonusName}>{result.bonus.name}</Text>
            </View>
          ) : null}

          <View style={st.actions}>
            <Pressable onPress={onShip} style={[st.btn, st.btnGhost]}>
              <Text style={[st.btnText, { color: C.n300 }]}>실물 배송</Text>
            </Pressable>
            <Pressable onPress={onExchange} style={[st.btn, st.btnPrimary]}>
              <Text style={st.btnText}>{pt(result.point_value)} 교환</Text>
            </Pressable>
          </View>
          <Pressable onPress={onDone} style={{ paddingVertical: 14 }}>
            <Text style={st.later}>나중에 결정하기</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 4 },
  head: { width: "100%", flexDirection: "row", justifyContent: "space-between", paddingBottom: 10 },
  meta: { color: C.n500, fontSize: 11.5 },
  stage: { alignItems: "center", justifyContent: "center", width: 280, height: 380 },
  glow: { position: "absolute", width: 320, height: 400, borderRadius: 200, backgroundColor: C.accent },
  ghost: { position: "absolute", width: 236, height: 300, borderRadius: R.lg, backgroundColor: C.surface,
    borderWidth: 1, borderColor: "rgba(233,233,237,0.08)" },
  cover: { position: "absolute", left: 20, right: 20, top: 30, bottom: 30, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: "rgba(233,233,237,0.10)" },
  coverText: { color: C.accent200, fontWeight: "500", fontSize: 15, letterSpacing: 1.5 },
  name: { color: C.text, fontWeight: "500", fontSize: 26, letterSpacing: -0.4, textAlign: "center" },
  sub: { color: C.n500, fontSize: 12.5, textAlign: "center" },
  bonus: { marginTop: 14, backgroundColor: "rgba(145,132,217,0.16)", borderWidth: 1, borderColor: C.accent,
    borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", gap: 3 },
  bonusTitle: { color: C.accent200, fontWeight: "500", fontSize: 10, letterSpacing: 1.4 },
  bonusName: { color: C.text, fontWeight: "500", fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 24, width: "100%" },
  btn: { flex: 1, height: 52, borderRadius: R.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnPrimary: { backgroundColor: "rgba(145,132,217,0.14)", borderColor: C.accent },
  btnGhost: { borderColor: "rgba(233,233,237,0.16)" },
  btnText: { color: C.accent200, fontWeight: "500", fontSize: 14.5 },
  later: { color: C.n600, fontSize: 12.5 },
});
