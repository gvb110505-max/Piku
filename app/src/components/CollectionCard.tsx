// 컬렉션 그리드의 카드 한 칸.
// 같은 카드를 여러 장 가지고 있으면 한 칸으로 묶고 우상단에 수량 배지를 단다.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { C, R, gradeLabel } from "@/lib/theme";
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
  // 등급 프레임 — HIT만 금색, 나머지는 무채색 헤어라인
  const frame = hit ? C.gold : C.lineStrong;

  return (
    <Pressable onPress={onPress} style={[st.tile, selected && st.tileOn]}>
      <View style={[st.frame, { borderColor: frame }]}>
        {/* 상단 흰 라벨 스트립 */}
        <View style={st.label}>
          <Text style={st.brand}>PIKU</Text>
          <Text style={st.labelName} numberOfLines={1}>{group.name}</Text>
        </View>

        {/* 카드 아트 */}
        <View style={st.art}>
          {src ? (
            <Image source={{ uri: src }} style={st.artFill} contentFit="cover" transition={160} />
          ) : (
            <View style={st.artPlaceholder}>
              <View style={st.artInner}>
                <Text style={st.artGrade}>{gradeLabel(group.grade)}</Text>
              </View>
              <Text style={st.artFoot}>POKEMON CARD</Text>
            </View>
          )}
        </View>

        {qty > 1 || selected ? (
          <View style={[st.qty, selected && st.qtyOn]}>
            <Text style={[st.qtyText, selected && st.qtyTextOn]}>
              {selected ? "선택됨" : `x${qty}`}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={st.name} numberOfLines={2}>{group.name}</Text>
      <Text style={[st.points, hit && { color: C.gold }]}>
        {Number(group.point_value).toLocaleString("ko-KR")} P
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  tile: { width: "48%", backgroundColor: C.surface, borderRadius: R.md, padding: 10,
    borderWidth: 1, borderColor: "transparent" },
  tileOn: { borderColor: C.accent, backgroundColor: C.accentFill },
  frame: { borderRadius: R.sm + 2, borderWidth: 2, overflow: "hidden", backgroundColor: "#0E0E0E" },
  label: { backgroundColor: "#F2F2F2", paddingVertical: 6, paddingHorizontal: 8, alignItems: "center", gap: 1 },
  brand: { color: "#111", fontSize: 10, fontWeight: "700", fontStyle: "italic", letterSpacing: 0.4 },
  labelName: { color: "#4A4A4A", fontSize: 8, fontWeight: "500" },
  art: { aspectRatio: 3 / 4.1, backgroundColor: "#12141A" },
  artFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  artPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 10 },
  artInner: { flex: 1, alignSelf: "stretch", margin: 6, borderRadius: 4, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  artGrade: { color: C.n200, fontSize: 15, fontWeight: "600", letterSpacing: 1.5 },
  artFoot: { color: "rgba(255,255,255,0.35)", fontSize: 6.5, fontWeight: "500", letterSpacing: 1.2, paddingBottom: 4 },
  qty: { position: "absolute", top: 6, right: 6, minWidth: 26, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: R.sm, backgroundColor: "rgba(10,10,10,0.86)", alignItems: "center" },
  qtyOn: { backgroundColor: C.accent },
  qtyText: { color: C.text, fontSize: 11, fontWeight: "600" },
  qtyTextOn: { color: C.onAccent },
  name: { color: C.text, fontSize: 12.5, fontWeight: "500", marginTop: 10, lineHeight: 17 },
  points: { color: C.n300, fontSize: 13, fontWeight: "600", textAlign: "right", marginTop: 6 },
});
