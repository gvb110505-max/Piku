// 최근 HIT 기록. 흐르는 티커 대신 조용한 목록으로 둔다 —
// 움직이는 글자는 읽히지 않고, 여기서 중요한 건 "실제로 나왔다"는 사실과 그 값이다.
// 닉네임은 서버에서 마스킹돼서 온다.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, NUM, pt } from "@/lib/theme";
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
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.lineSoft },
  who: { color: C.n500, fontSize: 12, width: 46 },
  name: { color: C.n200, fontSize: 13, flex: 1 },
  value: { ...NUM, color: C.gold, fontSize: 12.5, fontWeight: "600" },
  time: { ...NUM, color: C.n600, fontSize: 10.5, width: 44, textAlign: "right" },
});
