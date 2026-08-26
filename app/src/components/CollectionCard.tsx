// 컬렉션 한 칸. 같은 카드를 여러 장 가지고 있으면 한 칸으로 묶고 수량을 붙인다.
//
// 카드를 상품 진열처럼 꾸미지 않는다 — 여기 있는 건 내가 실제로 뽑은 기록이고,
// 그 기록에서 중요한 건 이름과 교환 가치다. 그래서 아트는 조용한 프레임에 담고,
// 이름·값은 아래에 표 형식으로 정렬한다. 금색은 HIT(=가치)에만 쓴다.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { C, R, T, NUM, gradeLabel } from "@/lib/theme";
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

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.tile, pressed && { opacity: 0.75 }]}>
      <View style={[st.frame, hit && st.frameHit, selected && st.frameOn]}>
        {src ? (
          <Image source={{ uri: src }} style={st.fill} contentFit="cover" transition={160} />
        ) : selected ? null : (
          <View style={st.blank}><Text style={st.blankText}>{gradeLabel(group.grade)}</Text></View>
        )}

        {hit ? <View style={st.hitTag}><Text style={st.hitTagText}>HIT</Text></View> : null}
        {qty > 1 ? <Text style={st.qty}>×{qty}</Text> : null}
        {selected ? <View style={st.check}><Text style={st.checkMark}>✓</Text></View> : null}
      </View>

      <Text style={[st.name, selected && { color: C.text }]} numberOfLines={2}>{group.name}</Text>
      <Text style={[st.value, hit && { color: C.gold }]}>
        {Number(group.point_value).toLocaleString("ko-KR")} P
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  tile: { width: "48%" },
  frame: { aspectRatio: 3 / 4.1, borderRadius: R.sm, overflow: "hidden",
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  frameHit: { borderColor: C.goldDim },
  frameOn: { borderColor: C.accent, borderWidth: 2 },
  fill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },

  blank: { flex: 1, alignItems: "center", justifyContent: "center" },
  blankText: { ...T, color: C.artLabel, fontSize: 10.5 },

  hitTag: { position: "absolute", top: 0, left: 0, paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: "rgba(10,10,10,0.82)" },
  hitTagText: { ...T, color: C.gold, fontSize: 8.5, fontWeight: "600", letterSpacing: 0.8 },

  qty: { ...NUM, position: "absolute", bottom: 6, right: 7, color: C.text, fontSize: 12, fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 4 },

  check: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(10,10,10,0.72)", alignItems: "center", justifyContent: "center" },
  checkMark: { color: C.text, fontSize: 26, fontWeight: "600" },

  name: { ...T, color: C.n300, fontSize: 12, lineHeight: 16, marginTop: 8 },
  value: { ...NUM, color: C.n500, fontSize: 11.5, fontWeight: "600", marginTop: 4 },
});
