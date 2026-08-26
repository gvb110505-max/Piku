// 카드 아트. 관리자가 이미지를 올린 슬롯은 그 이미지를, 아직 없으면 자리표시 그라디언트를 쓴다.
import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { C, ART, R, gradeLabel, gradeColor } from "@/lib/theme";
import { imageUrl } from "@/lib/api";

const SIZES = {
  sm: { w: 60, h: 82, label: 0 },
  md: { w: 104, h: 142, label: 8 },
  lg: { w: 220, h: 300, label: 8.5 },
} as const;

export function SlabCard({ name, grade, points, image, size = "md", style }: {
  name?: string; grade: string; points?: number; image?: string | null;
  size?: "sm" | "md" | "lg"; style?: ViewStyle;
}) {
  const d = SIZES[size];
  const hit = grade === "HIT";
  const [a, b, c] = hit ? ART.hero : ART.base;
  const src = imageUrl(image);

  return (
    <View style={[st.wrap, { width: d.w, height: d.h, backgroundColor: b,
      borderColor: hit ? C.lineStrong : C.line }, style]}>

      {src ? (
        <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={160} />
      ) : (
        <>
          {/* 3단 그라디언트를 겹친 뷰로 근사 — RN에 CSS 그라디언트가 없다 */}
          <View style={[st.fill, { backgroundColor: a, opacity: 0.85 }]} />
          <View style={[st.fill, { backgroundColor: c, opacity: 0.45, top: "45%" }]} />
          <View style={st.foil} />
        </>
      )}

      {size !== "sm" ? (
        <View style={st.tag}>
          <Text style={{ color: gradeColor(grade), fontSize: 9, fontWeight: "500", letterSpacing: 0.6 }}>
            {gradeLabel(grade)}
          </Text>
        </View>
      ) : null}

      {/* 이미지가 있으면 이름/자리표시 글자는 덮지 않는다 */}
      {!src && size === "lg" && name ? (
        <Text style={st.name} numberOfLines={3}>{name}</Text>
      ) : !src && d.label ? (
        <Text style={[st.art, { fontSize: d.label }]}>CARD ART</Text>
      ) : null}

      {size !== "sm" && points != null ? (
        <View style={st.ptsWrap}><Text style={st.pts}>{Number(points).toLocaleString("ko-KR")}P</Text></View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: R.md, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", padding: 10 },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  foil: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: C.wash, transform: [{ rotate: "26deg" }, { scaleX: 0.4 }] },
  tag: { position: "absolute", top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: R.sm, backgroundColor: "rgba(10,10,10,0.72)" },
  // 사진 위에서도 읽히도록 값에 어두운 판을 깐다
  ptsWrap: { position: "absolute", bottom: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: R.sm, backgroundColor: "rgba(10,10,10,0.72)" },
  pts: { color: C.n300, fontSize: 10, fontWeight: "500" },
  art: { color: C.artLabel, fontWeight: "500", letterSpacing: 1.4 },
  name: { color: C.text, fontSize: 17, fontWeight: "500", textAlign: "center", lineHeight: 24 },
});
