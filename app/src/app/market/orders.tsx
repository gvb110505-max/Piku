// 내 거래 — 구매 / 판매 / 등록 상품. 판매 건에서 수거 신청 → 접수번호 발급.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, H2, Sub, Card, Button, Field, Pill, Loading, Empty, ErrorBox, Row } from "@/components/ui";
import { Api, ApiError, MarketOrder, Listing } from "@/lib/api";
import { C, won } from "@/lib/theme";

const STATUS: Record<string, { label: string; tone: "accent" | "danger" | "neutral" }> = {
  paid: { label: "결제 완료 · 보관 중", tone: "accent" },
  awaiting_inbound: { label: "발송 대기", tone: "accent" },
  inbound: { label: "입고됨", tone: "neutral" },
  inspecting: { label: "검수 중", tone: "neutral" },
  passed: { label: "검수 합격", tone: "accent" },
  failed: { label: "검수 불합격", tone: "danger" },
  shipped: { label: "발송 완료", tone: "accent" },
  completed: { label: "거래 완료", tone: "accent" },
  refunded: { label: "환불 완료", tone: "danger" },
};

export default function MyTrades() {
  const router = useRouter();
  const [tab, setTab] = useState<"bought" | "sold" | "listings">("bought");
  const [data, setData] = useState<{ bought: MarketOrder[]; sold: MarketOrder[]; listings: Listing[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickupFor, setPickupFor] = useState<number | null>(null);
  const [addr, setAddr] = useState("");
  const [tel, setTel] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<{ code: string; steps: string[]; warning: string } | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await Api.myTrades()); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function requestPickup(orderId: number) {
    setBusy(true); setErr(null);
    try {
      const r = await Api.pickup(orderId, { pickup_address: addr.trim(), pickup_phone: tel.replace(/[^0-9]/g, "") });
      setGuide({ code: r.inbound_code, steps: r.steps, warning: r.warning });
      setPickupFor(null); setAddr(""); setTel("");
      await load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "신청에 실패했어요."); }
    finally { setBusy(false); }
  }

  if (guide) {
    return (
      <Screen>
        <H2 style={{ fontSize: 22 }}>수거 신청 완료</H2>
        <Card style={{ borderColor: C.accent200, alignItems: "center" }}>
          <Sub>박스에 적을 접수번호</Sub>
          <Text style={{ color: C.accent200, fontSize: 40, fontWeight: "900", letterSpacing: 4, marginTop: 8 }}>
            {guide.code}
          </Text>
        </Card>
        <Card>
          {guide.steps.map((s, i) => (
            <Sub key={i} style={{ marginTop: i ? 10 : 0, lineHeight: 20 }}>{i + 1}. {s}</Sub>
          ))}
        </Card>
        <Card style={{ borderColor: "#4A2A33" }}>
          <Text style={{ color: C.danger, fontSize: 12, lineHeight: 18 }}>{guide.warning}</Text>
        </Card>
        <Button title="확인" onPress={() => setGuide(null)} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load}>
      <Row style={{ marginTop: 4 }}>
        {([["bought", "구매"], ["sold", "판매"], ["listings", "등록 상품"]] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setTab(k)}>
            <Text style={{ color: tab === k ? C.accent200 : C.n500, fontWeight: "800", fontSize: 14, marginRight: 18 }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </Row>

      {err ? <ErrorBox message={err} onRetry={load} /> : null}
      {!data && !err ? <Loading /> : null}

      {tab === "bought" && data ? (
        !data.bought.length ? <Empty text="구매 내역이 없어요." /> :
        data.bought.map((o) => (
          <Card key={o.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <H2>{o.title}</H2>
              <Pill text={STATUS[o.status]?.label ?? o.status} tone={STATUS[o.status]?.tone ?? "neutral"} />
            </Row>
            <Sub style={{ marginTop: 6 }}>{o.order_uid} · {won(o.buyer_total)}</Sub>
            {o.out_tracking ? <Sub style={{ marginTop: 4 }}>운송장 {o.out_tracking}</Sub> : null}
            {o.status === "failed" ? (
              <Sub style={{ marginTop: 6, color: C.danger }}>검수 불합격: {o.fail_reason} · 전액 환불 처리됩니다.</Sub>
            ) : null}
          </Card>
        ))
      ) : null}

      {tab === "sold" && data ? (
        !data.sold.length ? <Empty text="판매 내역이 없어요." /> :
        data.sold.map((o) => (
          <Card key={o.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <H2>{o.title}</H2>
              <Pill text={STATUS[o.status]?.label ?? o.status} tone={STATUS[o.status]?.tone ?? "neutral"} />
            </Row>
            <Sub style={{ marginTop: 6 }}>정산 예정 {won(o.payout_amount)}</Sub>

            {o.inbound ? (
              <View style={{ marginTop: 10, backgroundColor: C.surface, borderRadius: 10, padding: 12 }}>
                <Sub>접수번호</Sub>
                <Text style={{ color: C.accent200, fontSize: 22, fontWeight: "900", letterSpacing: 2, marginTop: 2 }}>
                  {o.inbound.inbound_code}
                </Text>
                <Sub style={{ marginTop: 6 }}>박스 윗면에 이 번호를 크게 적어주세요.</Sub>
              </View>
            ) : o.status === "paid" ? (
              pickupFor === o.id ? (
                <View>
                  <Field label="수거 주소" placeholder="박스를 둘 주소" value={addr} onChangeText={setAddr} multiline />
                  <Field label="연락처" placeholder="01012345678" value={tel} onChangeText={setTel} keyboardType="number-pad" />
                  <Button title="수거 신청" onPress={() => requestPickup(o.id)} loading={busy}
                    disabled={!addr.trim() || tel.replace(/[^0-9]/g, "").length < 10} style={{ marginTop: 12 }} />
                  <Button title="취소" kind="ghost" onPress={() => setPickupFor(null)} style={{ marginTop: 8 }} />
                </View>
              ) : (
                <Button title="수거 신청하기" onPress={() => setPickupFor(o.id)} style={{ marginTop: 12 }} />
              )
            ) : null}
          </Card>
        ))
      ) : null}

      {tab === "listings" && data ? (
        !data.listings.length ? <Empty text="등록한 상품이 없어요." /> :
        data.listings.map((l) => (
          <Pressable key={l.id} onPress={() => router.push(`/market/${l.id}`)}>
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <H2>{l.title}</H2>
                <Pill text={{ active: "판매중", sold: "판매 완료", cancelled: "취소됨" }[l.status] ?? l.status}
                  tone={l.status === "active" ? "accent" : "neutral"} />
              </Row>
              <Text style={{ color: C.accent200, fontWeight: "900", marginTop: 8 }}>{won(l.ask_price)}</Text>
            </Card>
          </Pressable>
        ))
      ) : null}
    </Screen>
  );
}
