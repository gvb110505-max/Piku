// 홈 숏컷 줄. 커머스 앱 상단의 아이콘 바로가기 자리다.
// 전부 실제로 가는 곳만 둔다 — "매일보상"처럼 기능 없는 칸은 만들지 않는다.
// 칸마다 색을 달리 줘서 아이콘 모양만으로 구분하지 않아도 되게 한다.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C, R, T } from "@/lib/theme";

export type Quick = { key: string; label: string; icon: React.ReactNode; onPress: () => void;
  badge?: string | null; color: string };

export function QuickRow({ items }: { items: Quick[] }) {
  return (
    <View style={st.row}>
      {items.map((q) => (
        <Pressable key={q.key} onPress={q.onPress}
          style={({ pressed }) => [st.item, pressed && { opacity: 0.6 }]}>
          <View style={[st.circle, { backgroundColor: q.color + "1C", borderColor: q.color + "4D" }]}>
            {q.icon}
            {q.badge ? <View style={st.badge}><Text style={st.badgeText}>{q.badge}</Text></View> : null}
          </View>
          <Text style={st.label} numberOfLines={1}>{q.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  item: { alignItems: "center", flex: 1, gap: 8 },
  circle: { width: 48, height: 48, borderRadius: R.pill, alignItems: "center", justifyContent: "center",
    borderWidth: 1 },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: C.brand },
  badgeText: { ...T, color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  label: { ...T, color: C.n300, fontSize: 10.5 },
});
