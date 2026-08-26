// 최근 HIT 기록. 흐르는 티커 대신 조용한 목록으로 둔다 —
// 움직이는 글자는 읽히지 않고, 여기서 중요한 건 "실제로 나왔다"는 사실과 그 값이다.
// 닉네임은 서버에서 마스킹돼서 온다.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, T, NUM, pt } from "@/lib/theme";
import { RecentHit } from "@/lib/api";

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(m) || m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

export function HitFeed({ hits, limit = 4 }: { hits: RecentHit[]; limit?: number }) {
  if (!hits.length) return null;
  return (
    <View>
      {hits.slice(0, limit).map((h) => (
        <View key={h.id} style={st.row}>
          <View style={st.dot} />
          <Text style={st.who}>{h.nickname}</Text>
          <Text style={st.name} numberOfLines={1}>{h.name}</Text>
          <Text style={st.value}>{pt(h.point_value)}</Text>
          <Text style={st.time}>{ago(h.created_at)}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.lineSoft },
  dot: { width: 5, height: 5, borderRadius: 5, backgroundColor: C.hit },
  who: { ...T, color: C.n500, fontSize: 11, width: 42 },
  name: { ...T, color: C.n200, fontSize: 12.5, flex: 1 },
  value: { ...NUM, color: C.hit, fontSize: 12, fontWeight: "700" },
  time: { ...NUM, color: C.n600, fontSize: 10, width: 42, textAlign: "right" },
});
