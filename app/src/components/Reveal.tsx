// 개봉 연출 — 시안의 바인더 스택 위로 카드가 뒤집혀 올라온다.
// 내장 Animated만 사용해 추가 설정 없이 동작한다.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T, NUM, pt, gradeColor, gradeLabel } from "@/lib/theme";
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
  const g = gradeColor(result.grade);   // 등급색이 연출 전체를 물들인다

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
    if (!opened) return;
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
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: hit ? [0.16, 0.4] : [0.05, 0.13] });

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text style={st.meta}>{packName ?? "랜덤팩"}</Text>
        <Text style={st.meta}>{result.draw_no}번째 개봉</Text>
      </View>

      <Pressable onPress={open} style={st.stage}>
        {opened ? <Animated.View style={[st.glow, { opacity: glowOpacity, backgroundColor: g }]} /> : null}
        <View style={[st.ghost, { transform: [{ rotate: "7deg" }, { translateY: 10 }], opacity: 0.35 }]} />
        <View style={[st.ghost, { transform: [{ rotate: "-4deg" }, { translateY: 4 }], opacity: 0.55 }]} />

        <Animated.View style={{ transform: [{ perspective: 900 }, { rotateY }, { scale }] }}>
          <SlabCard name={result.name} grade={result.grade} points={result.point_value} image={result.image} size="lg" />
        </Animated.View>

        {!opened ? (
          <Animated.View style={[st.cover, { opacity: coverOpacity }]} pointerEvents="none">
            <LinearGradient colors={[C.brand, C.brand2]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
              style={[st.fill, { opacity: 0.9 }]} />
            <Text style={st.coverText}>탭해서 개봉</Text>
          </Animated.View>
        ) : null}
      </Pressable>

      {opened ? (
        <View style={{ alignSelf: "stretch", alignItems: "center", gap: 6, paddingTop: 26 }}>
          <View style={[st.gradeChip, { borderColor: g + "66", backgroundColor: g + "1F" }]}>
            <Text style={[st.gradeChipText, { color: g }]}>{gradeLabel(result.grade)}</Text>
          </View>
          <Text style={st.name}>{result.name}</Text>
          <Text style={st.sub}>
            {packName ?? "랜덤팩"} · 교환 <Text style={{ color: g, fontWeight: "700" }}>{pt(result.point_value)}</Text>
          </Text>

          {result.bonus ? (
            <View style={[st.bonus, result.bonus.kind === "last_one" && st.bonusLast]}>
              <Text style={[st.bonusTitle, result.bonus.kind === "last_one" && { color: C.brand }]}>
                {result.bonus.kind === "last_one" ? "LAST ONE · 마지막 1구" : "GUARANTEED #" + result.bonus.slot_no}
              </Text>
              <Text style={st.bonusName}>{result.bonus.name}</Text>
              <Text style={[st.bonusValue, result.bonus.kind === "last_one" && { color: C.brand }]}>
                {pt(result.bonus.point_value)}
              </Text>
            </View>
          ) : null}

          <View style={st.actions}>
            <Pressable onPress={onShip} style={[st.btn, st.btnGhost]}>
              <Text style={[st.btnText, { color: C.n300 }]}>실물 배송</Text>
            </Pressable>
            <Pressable onPress={onExchange} style={[st.btn, { overflow: "hidden" }]}>
              <LinearGradient colors={[C.brand, C.brand2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[st.fill, { alignItems: "center", justifyContent: "center" }]}>
                <Text style={st.btnText}>{pt(result.point_value)} 교환</Text>
              </LinearGradient>
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
  meta: { ...NUM, color: C.n500, fontSize: 11.5 },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  stage: { alignItems: "center", justifyContent: "center", width: 280, height: 380 },
  glow: { position: "absolute", width: 320, height: 400, borderRadius: 200 },
  ghost: { position: "absolute", width: 236, height: 300, borderRadius: R.lg, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.track },
  cover: { position: "absolute", left: 20, right: 20, top: 30, bottom: 30, alignItems: "center", justifyContent: "center",
    borderRadius: R.lg, overflow: "hidden" },
  coverText: { ...T, color: "#FFFFFF", fontWeight: "700", fontSize: 15, letterSpacing: 1.5 },
  gradeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, borderWidth: 1, marginBottom: 4 },
  gradeChipText: { ...T, fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
  name: { ...T, color: C.text, fontWeight: "700", fontSize: 24, letterSpacing: -0.5, textAlign: "center" },
  sub: { ...T, color: C.n500, fontSize: 12.5, textAlign: "center" },
  bonus: { marginTop: 14, backgroundColor: C.hitSoft, borderWidth: 1, borderColor: C.hit + "66",
    borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", gap: 3 },
  bonusTitle: { ...T, color: C.hit, fontWeight: "700", fontSize: 10, letterSpacing: 1.4 },
  bonusLast: { backgroundColor: C.brandSoft, borderColor: C.brandLine },
  bonusName: { ...T, color: C.text, fontWeight: "600", fontSize: 13 },
  bonusValue: { ...NUM, color: C.hit, fontWeight: "700", fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 24, width: "100%" },
  btn: { flex: 1, height: 50, borderRadius: R.pill, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: C.lineStrong },
  btnText: { ...T, color: C.onBrand, fontWeight: "700", fontSize: 14 },
  later: { ...T, color: C.n600, fontSize: 12.5 },
});
