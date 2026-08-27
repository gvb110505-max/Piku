// 팩 상세 — 확률표, 개봉 현황, GUARANTEED 마일스톤, 결제·개봉
//
// 결제는 링크 결제라 "결제 → 즉시 개봉"이 아니다.
// 결제 링크를 발급받아 시트를 띄우고, 입금이 확인된 뒤에야 개봉 결과가 온다.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Screen, H1, H2, Sub, Card, Pill, Bar, Button, Loading, ErrorBox, Row } from "@/components/ui";
import { Reveal } from "@/components/Reveal";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { PrizeGrid, Prize } from "@/components/PrizeGrid";
import { Api, Odds, DrawResult, Checkout, ApiError, imageUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, R, T, NUM, won, pt, pct, packHue } from "@/lib/theme";

// 보장·라스트원 상품 썸네일. 관리자가 이미지를 안 올렸으면 색 테두리만 남긴다.
function PrizeThumb({ image, size, color }: { image?: string | null; size: number; color: string }) {
  const src = imageUrl(image);
  return (
    <View style={{ width: size, height: size, borderRadius: 8, overflow: "hidden",
      borderWidth: 1, borderColor: color + "55", backgroundColor: color + "14",
      alignItems: "center", justifyContent: "center" }}>
      {src ? <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={140} />
        : <Text style={{ ...T, color: color + "AA", fontSize: size > 50 ? 11 : 9, fontWeight: "700" }}>PRIZE</Text>}
    </View>
  );
}

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

  // HIT을 앞에, 그다음 확률 높은 순. 소진된 HIT도 빼지 않고 뒤로 민다.
  const prizes: Prize[] = ([
    ...o.hits.map((h) => ({
      key: "h" + h.id, name: h.name, grade: "HIT", image: h.image,
      probability: h.probability, point_value: h.point_value,
      remaining: h.remaining, total: h.total_qty,
    })),
    ...o.pool.map((c) => ({
      key: "p" + c.id, name: c.name, grade: c.rarity, image: c.image,
      probability: c.probability, point_value: 100,
    })),
  ] as Prize[]).sort((a, b) => (b.grade === "HIT" ? 1 : 0) - (a.grade === "HIT" ? 1 : 0)
    || (b.remaining ?? 1) - (a.remaining ?? 1)
    || b.probability - a.probability);

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
          <Row style={{ marginTop: 12, alignItems: "flex-start", gap: 12 }}>
            <PrizeThumb image={o.last_one.image} size={64} color={C.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...T, color: C.text, fontSize: 16, fontWeight: "700" }}
                numberOfLines={2}>{o.last_one.name}</Text>
              <Text style={{ ...NUM, color: C.brand, fontWeight: "700", fontSize: 18, marginTop: 4 }}>
                {pt(o.last_one.point_value)}
              </Text>
            </View>
          </Row>
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
              <Row key={g.id} style={{ justifyContent: "space-between", opacity: g.awarded ? 0.45 : 1 }}>
                <PrizeThumb image={g.image} size={38} color={C.hit} />
                <Text style={{ ...NUM, color: g.awarded ? C.n600 : C.hit, fontWeight: "700", width: 48 }}>#{g.slot_no}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...T, color: g.awarded ? C.n500 : C.text, fontSize: 13.5 }} numberOfLines={1}>{g.name}</Text>
                  <Text style={{ ...NUM, color: C.n500, fontSize: 11, marginTop: 2 }}>{pt(g.point_value)}</Text>
                </View>
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

      {/* 구성 상품 — 이 팩에서 나올 수 있는 카드 전부. 위 확률표가 숫자라면 여기는 그림이다. */}
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <H2>구성 상품</H2>
          <Sub>{o.hits.length + o.pool.length}종</Sub>
        </Row>
        <Sub style={{ marginTop: 4 }}>표시된 확률은 지금 이 순간의 실제 추첨 확률입니다.</Sub>
        <PrizeGrid prizes={prizes} />
      </Card>

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
