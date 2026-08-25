// 팩 상세 — 확률표, 개봉 현황, GUARANTEED 마일스톤, 구매·개봉
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Alert, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, H1, H2, Sub, Card, Pill, Bar, Button, Loading, ErrorBox, Row } from "@/components/ui";
import { Reveal } from "@/components/Reveal";
import { Api, Odds, DrawResult, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, won, pt, pct } from "@/lib/theme";

function confirmBuy(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === "web") { if (confirm(`${title}\n\n${msg}`)) onOk(); return; }
  Alert.alert(title, msg, [{ text: "취소", style: "cancel" }, { text: "결제", onPress: onOk }]);
}

export default function PackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const packId = Number(id);
  const { refresh } = useAuth();
  const [o, setO] = useState<Odds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setO(await Api.pack(packId)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, [packId]);

  useEffect(() => { load(); }, [load]);

  async function buy() {
    if (!o) return;
    setBusy(true); setErr(null);
    try {
      const r = await Api.purchase(o.pack.id, o.pack.price);
      setResult(r.result);
      await refresh();
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "결제에 실패했어요.");
    } finally { setBusy(false); }
  }

  if (result) {
    return (
      <Screen>
        <Reveal result={result} onDone={() => setResult(null)} />
      </Screen>
    );
  }

  if (err && !o) return <Screen><ErrorBox message={err} onRetry={load} /></Screen>;
  if (!o) return <Screen scroll={false}><Loading /></Screen>;

  const p = o.pack;
  const nextG = o.guaranteed.find((g) => g.next);

  return (
    <Screen onRefresh={load}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <H1>{p.name}</H1>
        {p.sold_out ? <Pill text="SOLD OUT" tone="danger" /> : <Pill text={won(p.price)} tone="accent" />}
      </Row>
      {o.viewers ? <Sub style={{ marginTop: 6 }}>{o.viewers}명이 함께 보고 있어요</Sub> : null}

      <Card>
        <H2>개봉 현황</H2>
        <Bar value={p.total_slots ? p.sold_slots / p.total_slots : 0} />
        <Sub style={{ marginTop: 6 }}>{p.sold_slots} / {p.total_slots} 개봉 · 남은 슬롯 {p.remaining_slots}</Sub>
      </Card>

      <Card>
        <H2>확률 · 잔여 수량</H2>
        <Sub style={{ marginTop: 4 }}>남은 수량 ÷ 남은 슬롯 = 실제 추첨 확률</Sub>
        <View style={{ marginTop: 12, gap: 10 }}>
          {o.hits.map((h) => (
            <View key={h.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: "700", flex: 1 }} numberOfLines={1}>{h.name}</Text>
                <Text style={{ color: C.accent200, fontWeight: "900" }}>{pct(h.probability)}</Text>
              </Row>
              <Row style={{ justifyContent: "space-between", marginTop: 2 }}>
                <Sub>교환 {pt(h.point_value)}</Sub>
                <Sub>{h.remaining} / {h.total_qty}개 남음</Sub>
              </Row>
            </View>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: C.n500, fontSize: 14 }}>일반 카드</Text>
              <Text style={{ color: C.n500, fontWeight: "800" }}>{pct(o.point_probability)}</Text>
            </Row>
          </View>
        </View>
      </Card>

      {o.guaranteed.length ? (
        <Card>
          <H2>GUARANTEED</H2>
          <Sub style={{ marginTop: 4 }}>지정된 순번의 개봉자에게 확률과 무관하게 추가 지급됩니다.</Sub>
          <View style={{ marginTop: 12, gap: 8 }}>
            {o.guaranteed.map((g) => (
              <Row key={g.id} style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <Text style={{ color: g.awarded ? C.n500 : C.accent200, fontWeight: "900", width: 52 }}>#{g.slot_no}</Text>
                  <Text style={{ color: g.awarded ? C.n500 : C.text, flex: 1 }} numberOfLines={1}>{g.name}</Text>
                </Row>
                {g.awarded ? <Pill text="지급 완료" />
                  : g.next ? <Pill text="다음 차례" tone="accent" /> : null}
              </Row>
            ))}
          </View>
          {nextG ? (
            <Sub style={{ marginTop: 10 }}>
              다음 보장까지 {nextG.slot_no - p.sold_slots}번 남았어요.
            </Sub>
          ) : null}
        </Card>
      ) : null}

      {err ? <ErrorBox message={err} /> : null}

      <Button
        title={p.sold_out ? "품절" : `${won(p.price)} 결제하고 개봉`}
        onPress={() => confirmBuy(p.name, `${won(p.price)}을 결제합니다.`, buy)}
        loading={busy}
        disabled={p.sold_out || !p.active}
        style={{ marginTop: 20 }}
      />
      <Sub style={{ marginTop: 12 }}>
        랜덤팩은 Piku가 직접 판매하는 상품입니다. 개봉 결과는 포인트로 교환하거나 실물 배송을 신청할 수 있어요.
      </Sub>
    </Screen>
  );
}
