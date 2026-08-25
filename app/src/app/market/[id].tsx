// 상품 상세 — 시세, 수수료 안내, 구매(에스크로)
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, H1, H2, Sub, Card, Button, Field, Pill, Loading, ErrorBox, Row } from "@/components/ui";
import { Api, ApiError, Listing, Quote } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, won } from "@/lib/theme";

function ask(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === "web") { if (confirm(`${title}\n\n${msg}`)) onOk(); return; }
  Alert.alert(title, msg, [{ text: "취소", style: "cancel" }, { text: "결제", onPress: onOk }]);
}

export default function MarketItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, refresh } = useAuth();
  const [data, setData] = useState<{ listing: Listing; quote: Quote } | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [address, setAddress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await Api.listing(Number(id));
      setData(d);
      Api.quotes(d.listing.product_key).then(setQuote).catch(() => {});
    } catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function buy() {
    if (!data) return;
    setBusy(true); setErr(null);
    try {
      const r = await Api.buy(data.listing.id, address.trim(), data.quote.buyer_total);
      setDone(r.order_uid);
      await refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "결제에 실패했어요."); }
    finally { setBusy(false); }
  }

  if (err && !data) return <Screen><ErrorBox message={err} onRetry={load} /></Screen>;
  if (!data) return <Screen scroll={false}><Loading /></Screen>;

  const { listing: l, quote: q } = data;
  const mine = me?.user.id === l.seller_id;

  if (done) {
    return (
      <Screen>
        <H1>결제 완료</H1>
        <Card>
          <H2>{l.title}</H2>
          <Sub style={{ marginTop: 6 }}>주문번호 {done}</Sub>
          <Sub style={{ marginTop: 12 }}>
            결제 대금은 검수 통과 시까지 Piku가 보관합니다. 판매자가 상품을 보내면 검수 후 발송해드려요.
            검수에 통과하지 못하면 전액 환불됩니다.
          </Sub>
          <Button title="내 거래 보기" onPress={() => router.replace("/market/orders")} style={{ marginTop: 16 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <H1>{l.title}</H1>
          <Sub style={{ marginTop: 6 }}>
            {[l.card_set, l.grade, l.condition].filter(Boolean).join(" · ") || "정보 없음"}
          </Sub>
        </View>
        <Pill text={l.kind === "box" ? "박스" : "싱글"} />
      </Row>

      {l.description ? <Card><Sub>{l.description}</Sub></Card> : null}

      <Card>
        <H2>시세</H2>
        {quote && quote.trade_count ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Sub>최근 체결가</Sub><Text style={{ color: C.gold, fontWeight: "900" }}>{won(quote.last_price)}</Text>
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Sub>평균 체결가</Sub><Text style={{ color: C.text }}>{won(quote.avg_price)}</Text>
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Sub>체결 범위</Sub><Text style={{ color: C.text }}>{won(quote.min_price)} ~ {won(quote.max_price)}</Text>
            </Row>
            <Sub style={{ marginTop: 4 }}>체결 {quote.trade_count}건 · 판매중 {quote.active_listings}건</Sub>
          </View>
        ) : (
          <Sub style={{ marginTop: 8 }}>아직 체결 기록이 없어요. 첫 거래가 시세의 기준이 됩니다.</Sub>
        )}
      </Card>

      <Card>
        <H2>결제 금액</H2>
        <View style={{ marginTop: 10, gap: 6 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Sub>상품 가격</Sub><Text style={{ color: C.text }}>{won(q.item_price)}</Text>
          </Row>
          <Row style={{ justifyContent: "space-between" }}>
            <Sub>배송비</Sub><Text style={{ color: C.text }}>{won(q.shipping_fee)}</Text>
          </Row>
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, marginTop: 4 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={{ color: C.text, fontWeight: "800" }}>총 결제</Text>
              <Text style={{ color: C.gold, fontWeight: "900", fontSize: 17 }}>{won(q.buyer_total)}</Text>
            </Row>
          </View>
        </View>
      </Card>

      {mine ? (
        <Card><Sub>본인이 등록한 상품입니다.</Sub></Card>
      ) : l.status !== "active" ? (
        <Card><Sub>판매가 완료된 상품입니다.</Sub></Card>
      ) : (
        <>
          <Field label="받는 주소" placeholder="도로명 주소, 상세주소" value={address} onChangeText={setAddress} multiline />
          {err ? <ErrorBox message={err} /> : null}
          <Button title={`${won(q.buyer_total)} 결제`} loading={busy} disabled={!address.trim()}
            onPress={() => ask("구매", `${won(q.buyer_total)}을 결제합니다.\n대금은 검수 통과 시까지 Piku가 보관합니다.`, buy)}
            style={{ marginTop: 16 }} />
        </>
      )}

      <Sub style={{ marginTop: 20 }}>
        Piku는 통신판매중개자로서 이 상품의 거래 당사자가 아니며, 상품·거래 정보 및 거래에 대한 책임은 판매 회원에게 있습니다.
      </Sub>
    </Screen>
  );
}
