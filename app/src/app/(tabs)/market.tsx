// 마켓 탐색 — 검색 / 정렬 / 목록. Piku는 여기서 통신판매중개자다.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, H1, H2, Sub, Card, Button, Field, Pill, Loading, Empty, ErrorBox, Row } from "@/components/ui";
import { Api, ApiError, Listing } from "@/lib/api";
import { C, won } from "@/lib/theme";

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
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <H1>마켓</H1>
        <Pressable onPress={() => router.push("/market/sell")}>
          <Text style={{ color: C.gold, fontWeight: "800", fontSize: 13 }}>판매하기</Text>
        </Pressable>
      </Row>

      <Field placeholder="카드명 · 세트 검색" value={q} onChangeText={setQ}
        returnKeyType="search" onSubmitEditing={load} />

      <Row style={{ marginTop: 12, flexWrap: "wrap" }}>
        {[{ key: "", label: "전체" }, { key: "single", label: "싱글 카드" }, { key: "box", label: "미개봉 박스" }].map((k) => (
          <Pressable key={k.key} onPress={() => setKind(k.key)}>
            <View style={{ borderWidth: 1, borderColor: kind === k.key ? C.gold : C.line,
              borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: kind === k.key ? C.gold : C.sub, fontSize: 12, fontWeight: "700" }}>{k.label}</Text>
            </View>
          </Pressable>
        ))}
      </Row>
      <Row style={{ marginTop: 8, flexWrap: "wrap" }}>
        {SORTS.map((sOpt) => (
          <Pressable key={sOpt.key} onPress={() => setSort(sOpt.key)}>
            <Text style={{ color: sort === sOpt.key ? C.gold : C.sub, fontSize: 12, fontWeight: "700", marginRight: 14 }}>
              {sOpt.label}
            </Text>
          </Pressable>
        ))}
      </Row>

      {err ? <ErrorBox message={err} onRetry={load} /> : null}
      {!items && !err ? <Loading /> : null}
      {items && !items.length ? <Empty text="등록된 상품이 없어요." /> : null}

      {items?.map((l) => (
        <Pressable key={l.id} onPress={() => router.push(`/market/${l.id}`)}>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <H2>{l.title}</H2>
                <Sub style={{ marginTop: 4 }}>
                  {[l.card_set, l.grade, l.condition].filter(Boolean).join(" · ") || "정보 없음"}
                </Sub>
              </View>
              <Pill text={l.kind === "box" ? "박스" : "싱글"} />
            </Row>
            <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
              <Text style={{ color: C.gold, fontWeight: "900", fontSize: 17 }}>{won(l.ask_price)}</Text>
              <Sub>{l.seller_nickname}</Sub>
            </Row>
          </Card>
        </Pressable>
      ))}

      {policy ? (
        <Sub style={{ marginTop: 24 }}>{policy.notice}</Sub>
      ) : null}
    </Screen>
  );
}
