// 마켓 탐색 — 검색 / 정렬 / 목록. Piku는 여기서 통신판매중개자다.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, H1, Sub, Field, Chip, Loading, Empty, ErrorBox, Row } from "@/components/ui";
import { ListingCard } from "@/components/ListingCard";
import { IconPlus } from "@/components/icons";
import { Api, ApiError, Listing } from "@/lib/api";
import { C, R, T, won } from "@/lib/theme";

const SORTS = [
  { key: "", label: "최신순" },
  { key: "price_asc", label: "낮은 가격" },
  { key: "price_desc", label: "높은 가격" },
];

export default function Market() {
  const router = useRouter();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [policy, setPolicy] = useState<any>(null);
  const shipFee = Number(policy?.shipping_fee ?? 3500);

  const load = useCallback(async () => {
    setErr(null);
    try { setItems((await Api.listings({ q: q.trim() || undefined, kind: kind || undefined, sort: sort || undefined })).items); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, [q, kind, sort]);

  useEffect(() => { load(); }, [kind, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { Api.policy().then(setPolicy).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen onRefresh={load}>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <H1>마켓</H1>
        <Pressable onPress={() => router.push("/market/sell")} style={st.sell}>
          <IconPlus size={14} color={C.onBrand} />
          <Text style={st.sellText}>판매하기</Text>
        </Pressable>
      </Row>

      <Field placeholder="카드명 · 세트 검색" value={q} onChangeText={setQ}
        returnKeyType="search" onSubmitEditing={load} />

      <Row style={{ marginTop: 14, flexWrap: "wrap" }}>
        {[{ key: "", label: "전체" }, { key: "single", label: "싱글" }, { key: "box", label: "미개봉 박스" }].map((k) => (
          <Chip key={k.key} text={k.label} on={kind === k.key} onPress={() => setKind(k.key)} />
        ))}
      </Row>

      {/* 정렬은 목록의 성격이라 칩이 아니라 밑줄 탭으로 — 필터와 섞이지 않게 */}
      <Row style={{ marginTop: 14, gap: 18, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
        {SORTS.map((o) => (
          <Pressable key={o.key} onPress={() => setSort(o.key)} style={{ alignItems: "center" }}>
            <Text style={[st.sort, sort === o.key && st.sortOn]}>{o.label}</Text>
            <View style={[st.sortBar, sort === o.key && { backgroundColor: C.brand }]} />
          </Pressable>
        ))}
      </Row>

      {err ? <ErrorBox message={err} onRetry={load} /> : null}
      {!items && !err ? <Loading /> : null}
      {items && !items.length ? <Empty text="등록된 상품이 없어요. 첫 판매를 등록해보세요." /> : null}

      {items?.length ? (
        <View style={st.grid}>
          {items.map((l) => (
            <ListingCard key={l.id} item={l} shippingFee={shipFee}
              onPress={() => router.push(`/market/${l.id}`)} />
          ))}
        </View>
      ) : null}

      {policy ? (
        <View style={st.notice}><Sub style={{ lineHeight: 18 }}>{policy.notice}</Sub></View>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  sell: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.brand,
    paddingHorizontal: 13, height: 34, borderRadius: R.pill },
  sellText: { ...T, color: C.onBrand, fontSize: 12.5, fontWeight: "700" },
  sort: { ...T, color: C.n500, fontSize: 12.5, fontWeight: "500", paddingBottom: 8 },
  sortOn: { color: C.brand, fontWeight: "700" },
  sortBar: { height: 2, alignSelf: "stretch", backgroundColor: "transparent", marginBottom: -1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18 },
  notice: { marginTop: 28, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.lineSoft },
});
