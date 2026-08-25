// 홈 — 팩 목록. 확률은 서버가 내려준 값을 그대로 보여준다(표시=실제).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, H1, H2, Sub, Card, Pill, Bar, Loading, ErrorBox, Row, Button } from "@/components/ui";
import { Api, Odds, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, won, pt, pct } from "@/lib/theme";

export default function Home() {
  const router = useRouter();
  const { me, refresh } = useAuth();
  const [packs, setPacks] = useState<Odds[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setPacks(await Api.packs()); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const welcome = packs?.find((p) => p.pack.is_welcome);
  const normal = packs?.filter((p) => !p.pack.is_welcome) ?? [];
  const welcomeUsed = !!me?.user.welcome_used;

  async function openWelcome() {
    setBusy(true);
    try {
      await Api.welcome();
      await refresh();
      router.push("/(tabs)/collection");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <Screen onRefresh={load} refreshing={false}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <H1>PIKU</H1>
        <Text style={{ color: C.gold, fontWeight: "900", fontSize: 15 }}>{pt(me?.user.points ?? 0)}</Text>
      </Row>

      {err ? <ErrorBox message={err} onRetry={load} /> : null}
      {!packs && !err ? <Loading text="팩 불러오는 중" /> : null}

      {welcome && !welcomeUsed && !welcome.pack.sold_out ? (
        <Card style={{ borderColor: C.goldDim }}>
          <Row style={{ justifyContent: "space-between" }}>
            <H2>웰컴 팩</H2>
            <Pill text="계정당 1회" tone="gold" />
          </Row>
          <Sub style={{ marginTop: 6 }}>{pt(welcome.pack.point_price)}로 열 수 있어요. 가입 시 드린 포인트로 바로 가능합니다.</Sub>
          <Button title={`${pt(welcome.pack.point_price)}로 개봉하기`} onPress={openWelcome} loading={busy}
            disabled={(me?.user.points ?? 0) < welcome.pack.point_price} style={{ marginTop: 14 }} />
        </Card>
      ) : null}

      {normal.map((o) => (
        <Pressable key={o.pack.id} onPress={() => router.push(`/pack/${o.pack.id}`)}>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <H2>{o.pack.name}</H2>
              {o.pack.sold_out ? <Pill text="SOLD OUT" tone="off" /> : <Pill text={won(o.pack.price)} tone="gold" />}
            </Row>

            <Bar value={o.pack.total_slots ? o.pack.sold_slots / o.pack.total_slots : 0} />
            <Sub style={{ marginTop: 6 }}>
              {o.pack.sold_slots} / {o.pack.total_slots} 개봉 · 남은 슬롯 {o.pack.remaining_slots}
            </Sub>

            <View style={{ marginTop: 12, gap: 6 }}>
              {o.hits.slice(0, 3).map((h) => (
                <Row key={h.id} style={{ justifyContent: "space-between" }}>
                  <Text style={{ color: C.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{h.name}</Text>
                  <Text style={{ color: C.gold, fontSize: 13, fontWeight: "800" }}>{pct(h.probability)}</Text>
                  <Text style={{ color: C.sub, fontSize: 11, width: 62, textAlign: "right" }}>{h.remaining}/{h.total_qty}개</Text>
                </Row>
              ))}
            </View>
          </Card>
        </Pressable>
      ))}

      <Sub style={{ marginTop: 20 }}>
        표시된 확률은 남은 수량 ÷ 남은 슬롯으로 계산된 실제 추첨 확률입니다. 재고가 줄면 확률이 자동으로 올라갑니다.
      </Sub>
    </Screen>
  );
}
