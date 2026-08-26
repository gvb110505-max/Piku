// 컬렉션 한 칸. 같은 카드를 여러 장 가지고 있으면 한 칸으로 묶고 수량을 붙인다.
//
// 등급이 곧 색이다 — HIT 금색 / 레어 바이올렛 / 언커먼 틸 / 커먼 회색.
// 프레임·칩·교환값이 같은 색을 쓰므로 그리드를 훑기만 해도 무엇이 좋은 카드인지 보인다.
// 이미지가 아직 없는 카드도 등급색으로 칠해서 회색 판이 되지 않게 한다.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { C, R, T, NUM, gradeLabel, gradeColor, gradeSoft } from "@/lib/theme";
import { imageUrl } from "@/lib/api";

export type CardGroup = {
  key: string; name: string; grade: string;
  image: string | null; point_value: number; ids: number[];
};

export function CollectionCard({ group, selected, onPress }: {
  group: CardGroup; selected: boolean; onPress: () => void;
}) {
  const hit = group.grade === "HIT";
  const src = imageUrl(group.image);
  const qty = group.ids.length;
  const g = gradeColor(group.grade);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.tile, pressed && { opacity: 0.75 }]}>
      <View style={[st.frame, { borderColor: selected ? C.brand : g + (hit ? "AA" : "55") },
        selected && { borderWidth: 2 }]}>
        {src ? (
          <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={160} />
        ) : (
          <LinearGradient colors={[g + "3D", g + "0F"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
            style={st.fill} />
        )}

        <View style={[st.tag, { backgroundColor: gradeSoft(group.grade), borderColor: g + "66" }]}>
          <Text style={[st.tagText, { color: g }]}>{gradeLabel(group.grade)}</Text>
        </View>
        {qty > 1 ? <Text style={st.qty}>×{qty}</Text> : null}
        {selected ? (
          <View style={st.check}><Text style={st.checkMark}>✓</Text></View>
        ) : null}
      </View>

      <Text style={[st.name, selected && { color: C.text }]} numberOfLines={2}>{group.name}</Text>
      <Text style={[st.value, { color: g }]}>
        {Number(group.point_value).toLocaleString("ko-KR")} P
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  tile: { width: "48%" },
  frame: { aspectRatio: 3 / 4.1, borderRadius: R.sm, overflow: "hidden",
    backgroundColor: C.panel, borderWidth: 1 },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },

  tag: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: R.sm, borderWidth: 1 },
  tagText: { ...T, fontSize: 8.5, fontWeight: "700", letterSpacing: 0.6 },

  qty: { ...NUM, position: "absolute", bottom: 6, right: 7, color: C.text, fontSize: 12, fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 4 },

  check: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(10,10,10,0.72)", alignItems: "center", justifyContent: "center" },
  checkMark: { color: C.brand, fontSize: 28, fontWeight: "700" },

  name: { ...T, color: C.n300, fontSize: 12, lineHeight: 16, marginTop: 8 },
  value: { ...NUM, fontSize: 11.5, fontWeight: "700", marginTop: 4 },
});
