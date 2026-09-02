// 팩 상세 — 확률표, 개봉 현황, GUARANTEED 마일스톤, 결제·개봉
//
// 결제는 링크 결제라 "결제 → 즉시 개봉"이 아니다.
// 결제 링크를 발급받아 시트를 띄우고, 입금이 확인된 뒤에야 개봉 결과가 온다.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Screen, H1, H2, Sub, Card, Pill, Bar, Button, Loading, ErrorBox, Row } from "@/components/ui";
import { Reveal } from "@/components/Reveal";
import { CheckoutSheet } from "@/components/CheckoutSheet";
import { PrizeList, PrizeSection } from "@/components/PrizeList";
import { Api, Odds, DrawResult, Checkout, ApiError, imageUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, R, T, NUM, won, pt, shortWon, packHue } from "@/lib/theme";

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
  const hue = packHue(p.id) as [string, string];
  const heroSrc = imageUrl(p.image);

  // 이름이 같은 보장은 한 묶음으로 접는다 (상품 1개 + 순번 칩 N개)
  const guarGroups = Object.values(
    o.guaranteed.reduce((m, g) => {
      (m[g.name] = m[g.name] || { name: g.name, image: g.image, point_value: g.point_value, slots: [] })
        .slots.push(g);
      return m;
    }, {} as Record<string, { name: string; image: string; point_value: number; slots: typeof o.guaranteed }>));

  // 상품 구성표 — 확률 대신 남은 재고 수량만 보여준다.
  // HIT 잔여 합 + N LINE = 남은 슬롯이라, 보는 사람이 직접 계산할 수 있다.
  const heavy = o.hits.filter((h) => h.tier === "heavy");
  const plain = o.hits.filter((h) => h.tier !== "heavy");
  const hitLeft = o.hits.reduce((s, h) => s + h.remaining, 0);
  const toItem = (h: (typeof o.hits)[number], color: string) => ({
    key: "h" + h.id, name: h.name, qty: h.remaining, image: h.image,
    color, gone: h.remaining <= 0,
  });
  const sections: PrizeSection[] = [
    { title: "HEAVY HITS", color: C.brand, items: heavy.map((h) => toItem(h, C.brand)) },
    { title: "HITS", color: C.hit, items: plain.map((h) => toItem(h, C.hit)) },
    {
      title: "N LINE", color: C.common,
      // 꽝은 종류를 나열하지 않고 한 칸으로 묶는다 — 몇 장 남았는지가 전부다
      items: o.point_remaining > 0 ? [{
        key: "n", name: "일반 카드 (C / U / R)", qty: o.point_remaining,
        image: o.pool[0]?.image ?? null, color: C.common, label: "C/U/R",
      }] : [],
    },
  ];

  return (
    <Screen onRefresh={load}>
      {/* 히어로 — 홈 배너와 같은 색을 쓴다. 같은 팩이 화면마다 다른 색이면 정체성이 깨진다. */}
      <View style={st.hero}>
        {heroSrc ? (
          <>
            <Image source={{ uri: heroSrc }} style={st.heroFill} contentFit="cover" transition={180} />
            <LinearGradient colors={["transparent", "rgba(8,8,10,0.85)"]}
              start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} style={st.heroFill} />
          </>
        ) : (
          <>
            <LinearGradient colors={hue} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.heroFill} />
            <LinearGradient colors={["transparent", "rgba(8,8,10,0.82)"]}
              start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} style={st.heroFill} />
            <Text style={st.heroTier}>{shortWon(p.price)}</Text>
          </>
        )}
        <View style={st.heroBody}>
          <Row style={{ gap: 6 }}>
            {p.sold_out ? <Pill text="SOLD OUT" tone="danger" />
              : <Pill text="판매 중" color={C.up} />}
            {o.viewers && o.viewers > 1 ? <Pill text={`${o.viewers}명이 보는 중`} /> : null}
          </Row>
          <Text style={st.heroName} numberOfLines={2}>{p.name}</Text>
          <Text style={st.heroPrice}>{won(p.price)}</Text>
        </View>
      </View>

      <Card>
        <Row style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <H2>개봉 현황</H2>
          <Text style={st.openNum}>
            <Text style={{ color: C.text, fontWeight: "700" }}>{p.sold_slots.toLocaleString("ko-KR")}</Text>
            {" / "}{p.total_slots.toLocaleString("ko-KR")}
          </Text>
        </Row>
        <Bar value={p.total_slots ? p.sold_slots / p.total_slots : 0} colors={hue} />
        <Sub style={{ marginTop: 8 }}>남은 슬롯 {p.remaining_slots.toLocaleString("ko-KR")}구</Sub>
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
          <Row style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <H2>GUARANTEED</H2>
            <Sub>{o.guaranteed.filter((g) => !g.awarded).length} / {o.guaranteed.length} 남음</Sub>
          </Row>
          <Sub style={{ marginTop: 4 }}>지정된 순번의 개봉자에게 확률과 무관하게 추가 지급됩니다.</Sub>

          {/* 같은 상품이 순번만 달리해 반복되는 경우가 대부분이라, 상품은 한 번만 보여주고
              순번은 칩으로 늘어놓는다. 10줄 반복은 읽히지 않는다. */}
          {guarGroups.map((g) => (
            <View key={g.name} style={st.guarGroup}>
              <Row style={{ alignItems: "flex-start", gap: 12 }}>
                <PrizeThumb image={g.image} size={52} color={C.hit} />
                <View style={{ flex: 1 }}>
                  <Text style={st.guarName} numberOfLines={2}>{g.name}</Text>
                  <Text style={st.guarValue}>{pt(g.point_value)} · {g.slots.length}회</Text>
                </View>
              </Row>
              <View style={st.slotWrap}>
                {g.slots.map((x) => (
                  <View key={x.id} style={[st.slot, x.next && st.slotNext, x.awarded && st.slotDone]}>
                    <Text style={[st.slotText, x.next && { color: C.onBrand },
                      x.awarded && { color: C.n600 }]}>#{x.slot_no}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {nextG ? (
            <Sub style={{ marginTop: 12 }}>
              다음 보장 #{nextG.slot_no}까지 {nextG.slot_no - p.sold_slots}번 남았어요.
            </Sub>
          ) : null}
        </Card>
      ) : null}

      {/* 상품 구성 — 확률(%)은 쓰지 않는다. 남은 재고 수량만 두고 계산은 보는 사람 몫으로. */}
      <Card>
        <Row style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <H2>상품 구성</H2>
          <Text style={{ ...NUM, color: C.n400, fontSize: 12 }}>
            남은 슬롯 {p.remaining_slots.toLocaleString("ko-KR")}
          </Text>
        </Row>
        <Sub style={{ marginTop: 6, lineHeight: 18 }}>
          숫자는 지금 남아 있는 재고 수량입니다. HIT {hitLeft.toLocaleString("ko-KR")}장 +
          일반 {o.point_remaining.toLocaleString("ko-KR")}장 = 남은 슬롯 {p.remaining_slots.toLocaleString("ko-KR")}.
        </Sub>
        <PrizeList sections={sections} />
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

const st = StyleSheet.create({
  hero: { height: 210, borderRadius: R.md, overflow: "hidden", marginTop: 4,
    backgroundColor: C.panel, justifyContent: "flex-end" },
  heroFill: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  heroTier: { ...NUM, position: "absolute", right: 16, top: 18, fontSize: 76, fontWeight: "700",
    color: "rgba(255,255,255,0.16)" },
  heroBody: { padding: 16, gap: 8 },
  heroName: { ...T, color: C.text, fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  heroPrice: { ...NUM, color: C.text, fontSize: 16, fontWeight: "700" },

  openNum: { ...NUM, color: C.n500, fontSize: 13 },

  guarGroup: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.lineSoft },
  guarName: { ...T, color: C.text, fontSize: 14, fontWeight: "600", lineHeight: 19 },
  guarValue: { ...NUM, color: C.hit, fontSize: 12, fontWeight: "600", marginTop: 3 },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  slot: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.hit + "55", backgroundColor: C.hitSoft },
  slotNext: { backgroundColor: C.brand, borderColor: C.brand },
  slotDone: { backgroundColor: "transparent", borderColor: C.lineSoft },
  slotText: { ...NUM, color: C.hit, fontSize: 11.5, fontWeight: "700" },
});
