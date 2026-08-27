// 팩 상세 — 확률표, 개봉 현황, GUARANTEED 마일스톤, 결제·개봉
//
// 결제는 링크 결제라 "결제 → 즉시 개봉"이 아니다.
// 결제 링크를 발급받아 시트를 띄우고, 입금이 확인된 뒤에야 개봉 결과가 온다.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, H1, H2, Sub, Card, Pill, Bar, Button, Loading, ErrorBox, Row } from "@/components/ui";
import { Reveal } from "@/components/Reveal";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { Api, Odds, DrawResult, Checkout, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, R, T, NUM, won, pt, pct, packHue } from "@/lib/theme";

export default function PackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const packId = Number(id);
  const { refresh } = useAuth();
  const [o, setO] = useState<Odds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setO(await Api.pack(packId)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, [packId]);

  useEffect(() => { load(); }, [load]);

  // 1단계 — 결제 링크만 받아온다. 이 시점에는 아무것도 뽑히지 않는다.
  async function startCheckout() {
    if (!o) return;
    setBusy(true); setErr(null);
    try { setCheckout(await Api.checkout(o.pack.id, o.pack.price)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "결제를 시작하지 못했어요."); }
    finally { setBusy(false); }
  }

  // 2단계 — 입금이 확인되면 그때 개봉 결과가 도착한다.
  async function onPaid(r: NonNullable<Checkout["result"]>) {
    setCheckout(null);
    if (r.result) setResult(r.result);
    await refresh();
    await load();
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
        {p.sold_out ? <Pill text="SOLD OUT" tone="danger" /> : <Pill text={won(p.price)} color={packHue(p.id)[0]} />}
      </Row>
      {o.viewers ? <Sub style={{ marginTop: 6 }}>{o.viewers}명이 함께 보고 있어요</Sub> : null}

      <Card>
        <H2>개봉 현황</H2>
        <Bar value={p.total_slots ? p.sold_slots / p.total_slots : 0} colors={packHue(p.id) as [string, string]} />
        <Sub style={{ marginTop: 6 }}>{p.sold_slots} / {p.total_slots} 개봉 · 남은 슬롯 {p.remaining_slots}</Sub>
      </Card>

      <Card>
        <H2>확률 · 잔여 수량</H2>
        <Sub style={{ marginTop: 4 }}>남은 수량 ÷ 남은 슬롯 = 실제 추첨 확률</Sub>
        <View style={{ marginTop: 12, gap: 10 }}>
          {/* 다 나간 HIT은 목록에 남기되 눌러둔다 — 지운 것처럼 보이면 확률표를 믿기 어렵다 */}
          {o.hits.map((h) => {
            const gone = h.remaining <= 0;
            return (
              <View key={h.id} style={gone ? { opacity: 0.42 } : undefined}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ width: 4, height: 14, borderRadius: 4, backgroundColor: gone ? C.n600 : C.hit }} />
                  <Text style={{ ...T, color: gone ? C.n400 : C.text, fontSize: 14, fontWeight: "500", flex: 1 }}
                    numberOfLines={1}>{h.name}</Text>
                  <Text style={{ ...NUM, color: gone ? C.n500 : C.hit, fontSize: 15, fontWeight: "700" }}>
                    {gone ? "소진" : pct(h.probability)}
                  </Text>
                </Row>
                <Row style={{ justifyContent: "space-between", marginTop: 3, paddingLeft: 12 }}>
                  <Sub>교환 {pt(h.point_value)}</Sub>
                  <Sub>{h.remaining} / {h.total_qty}개 남음</Sub>
                </Row>
              </View>
            );
          })}
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ width: 4, height: 14, borderRadius: 4, backgroundColor: C.common }} />
              <Text style={{ ...T, color: C.n400, fontSize: 14, flex: 1 }}>일반 카드</Text>
              <Text style={{ ...NUM, color: C.n400, fontSize: 14, fontWeight: "600" }}>{pct(o.point_probability)}</Text>
            </Row>
          </View>
        </View>
      </Card>

      {/* 라스트원 — 마지막 1구를 여는 사람 몫. 보장과 성격이 달라 따로 크게 둔다. */}
      {o.last_one ? (
        <Card style={{ borderColor: C.brandLine, backgroundColor: C.brandSoft }}>
          <Row style={{ justifyContent: "space-between" }}>
            <H2 style={{ color: C.brand }}>LAST ONE</H2>
            <Pill text={o.last_one.awarded ? "지급 완료" : `마지막 1구 · #${o.last_one.slot_no}`}
              color={o.last_one.awarded ? undefined : C.brand} />
          </Row>
          <Text style={{ ...T, color: C.text, fontSize: 16, fontWeight: "700", marginTop: 10 }}
            numberOfLines={2}>{o.last_one.name}</Text>
          <Text style={{ ...NUM, color: C.brand, fontWeight: "700", fontSize: 18, marginTop: 4 }}>
            {pt(o.last_one.point_value)}
          </Text>
          <Sub style={{ marginTop: 10, lineHeight: 18 }}>
            마지막 슬롯을 여는 분께 확률과 무관하게 지급됩니다.
            {o.last_one.awarded ? "" : ` 남은 ${p.remaining_slots}구가 모두 팔리면 확정됩니다.`}
          </Sub>
        </Card>
      ) : null}

      {o.guaranteed.length ? (
        <Card>
          <H2>GUARANTEED</H2>
          <Sub style={{ marginTop: 4 }}>지정된 순번의 개봉자에게 확률과 무관하게 추가 지급됩니다.</Sub>
          <View style={{ marginTop: 12, gap: 8 }}>
            {o.guaranteed.map((g) => (
              <Row key={g.id} style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <Text style={{ ...NUM, color: g.awarded ? C.n600 : C.hit, fontWeight: "700", width: 46 }}>#{g.slot_no}</Text>
                  <Text style={{ color: g.awarded ? C.n500 : C.text, flex: 1 }} numberOfLines={1}>{g.name}</Text>
                </Row>
                {g.awarded ? <Pill text="지급 완료" />
                  : g.next ? <Pill text="다음 차례" color={C.hit} /> : null}
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
        title={p.sold_out ? "품절" : `${won(p.price)} 결제하기`}
        onPress={startCheckout}
        loading={busy}
        disabled={p.sold_out || !p.active}
        style={{ marginTop: 20 }}
      />
      <Sub style={{ marginTop: 12, lineHeight: 19 }}>
        결제 링크로 결제하면 입금 확인 뒤 바로 개봉됩니다. 랜덤팩은 Piku가 직접 판매하며,
        개봉 결과는 포인트로 교환하거나 실물 배송을 신청할 수 있어요.
      </Sub>

      {checkout ? (
        <CheckoutSheet checkout={checkout} onPaid={onPaid}
          onClose={() => { setCheckout(null); load(); }} />
      ) : null}
    </Screen>
  );
}
