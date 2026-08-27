// 일반 상품 가로 슬라이드.
//
// 세로로는 최대 두 칸까지만 쌓고, 그 이상은 옆으로 민다. 상품이 10종이 넘어가면
// 세로 그리드는 스크롤이 끝없이 길어져서 아래 섹션(마켓·최근 HIT)까지 못 내려간다.
// 2행 × N열로 묶으면 한 화면에서 네 개가 보이고, 나머지는 옆으로 밀어서 본다.
import React from "react";
import { View, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { PackCard } from "@/components/PackCard";
import { Odds } from "@/lib/api";

const PAD = 20;
const GAP = 12;
const ROWS = 2;

export function PackSlider({ packs, onOpen }: { packs: Odds[]; onOpen: (id: number) => void }) {
  const { width } = useWindowDimensions();
  // 한 화면에 두 열이 보이고 세 번째가 살짝 걸치게 — 더 있다는 게 눈에 보여야 민다
  const colW = Math.round((width - PAD * 2 - GAP * 2) / 2.25);

  // 세로 2칸씩 열로 묶는다
  const columns: Odds[][] = [];
  for (let i = 0; i < packs.length; i += ROWS) columns.push(packs.slice(i, i + ROWS));
  if (!columns.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={colW + GAP}
      snapToAlignment="start"
      style={{ marginHorizontal: -PAD }}
      contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP }}
    >
      {columns.map((col, i) => (
        <View key={i} style={[st.col, { width: colW }]}>
          {col.map((o) => (
            <PackCard key={o.pack.id} o={o} width={colW} onPress={() => onOpen(o.pack.id)} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  col: { gap: 18 },
});
