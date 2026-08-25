// 개봉 연출. 1차 버전은 내장 Animated만 사용한다 (추가 설정 없이 확실히 동작).
//   덮개 스와이프/탭 → 카드 플립 → HIT이면 골드 글로우 + 햅틱
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { C } from "@/lib/theme";
import { SlabCard } from "./SlabCard";
import type { DrawResult } from "@/lib/api";

export function Reveal({ result, onDone }: { result: DrawResult; onDone: () => void }) {
  const [opened, setOpened] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const isHit = result.grade === "HIT";

  const open = () => {
    if (opened) return;
    setOpened(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(isHit ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    Animated.timing(flip, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      if (isHit && Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
  };

  useEffect(() => {
    if (!opened || !isHit) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opened, isHit, glow]);

  const rotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "0deg"] });
  const scale = flip.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.86, 1.06, 1] });
  const coverOpacity = flip.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: "clamp" });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.5] });

  return (
    <View style={st.wrap}>
      <Pressable onPress={open} style={st.stage}>
        {isHit && opened ? <Animated.View style={[st.glow, { opacity: glowOpacity }]} /> : null}

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
        <View style={{ alignItems: "center", marginTop: 24, gap: 6 }}>
          {isHit ? <Text style={st.hit}>HIT!</Text> : null}
          <Text style={st.name}>{result.name}</Text>
          <Text style={st.meta}>{result.draw_no}번째 개봉 · 교환 {Number(result.point_value).toLocaleString("ko-KR")}P</Text>
          {result.bonus ? (
            <View style={st.bonus}>
              <Text style={st.bonusTitle}>GUARANTEED #{result.bonus.slot_no}</Text>
              <Text style={st.bonusName}>{result.bonus.name}</Text>
            </View>
          ) : null}
          <Pressable onPress={onDone} style={st.done}><Text style={st.doneText}>확인</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 24 },
  stage: { alignItems: "center", justifyContent: "center", width: 260, height: 360 },
  glow: { position: "absolute", width: 300, height: 400, borderRadius: 200, backgroundColor: C.gold },
  cover: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center",
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, margin: 8 },
  coverText: { color: C.gold, fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  hit: { color: C.gold, fontWeight: "900", fontSize: 30, fontStyle: "italic", letterSpacing: 2 },
  name: { color: C.text, fontWeight: "800", fontSize: 19, textAlign: "center" },
  meta: { color: C.sub, fontSize: 12 },
  bonus: { marginTop: 12, backgroundColor: "#2A2413", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center" },
  bonusTitle: { color: C.gold, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  bonusName: { color: C.text, fontWeight: "700", marginTop: 2 },
  done: { marginTop: 22, backgroundColor: C.gold, borderRadius: 12, paddingHorizontal: 40, paddingVertical: 13 },
  doneText: { color: "#111", fontWeight: "900", fontSize: 15 },
});
