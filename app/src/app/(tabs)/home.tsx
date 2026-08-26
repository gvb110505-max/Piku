// 홈 — 실시간 HIT 티커 + 회전 캐러셀 + 팩 목록.
// 확률은 서버가 내려준 값을 그대로 보여준다(표시=실제).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, H1, H2, Sub, Card, Bar, Loading, ErrorBox, Row, Button, Pill } from "@/components/ui";
import { SlabCard } from "@/components/SlabCard";
import { HitTicker } from "@/components/HitTicker";
import { PackCarousel } from "@/components/PackCarousel";
import { Api, Odds, RecentHit, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, R, won, pt, pct } from "@/lib/theme";

const HITS_POLL_MS = 20000; // 티커 갱신 주기

export default function Home() {
  const router = useRouter();
  const { me, refresh } = useAuth();
  const [packs, setPacks] = useState<Odds[] | null>(null);
  const [hits, setHits] = useState<RecentHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setPacks(await Api.packs()); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, []);

  // 티커는 실패해도 화면을 막지 않는다 — 조용히 비운다.
  const loadHits = useCallback(async () => {
    try { setHits(await Api.recentHits(20)); } catch { /* 티커는 부가 정보 */ }
  }, []);

  useEffect(() => { load(); loadHits(); }, [load, loadHits]);
  useEffect(() => {
    const t = setInterval(loadHits, HITS_POLL_MS);
    return () => clearInterval(t);
  }, [loadHits]);
  useFocusEffect(useCallback(() => { refresh(); loadHits(); }, [refresh, loadHits]));

  const welcome = packs?.find((p) => p.pack.is_welcome);
  const normal = packs?.filter((p) => !p.pack.is_welcome) ?? [];
  const welcomeUsed = !!me?.user.welcome_used;

  async function openWelcome() {
    setBusy(true);
    try { await Api.welcome(); await refresh(); router.push("/(tabs)/collection"); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <Screen onRefresh={() => { load(); loadHits(); }}>
      <Row style={{ justifyContent: "space-between" }}>
        <H1>PIKU</H1>
        <View style={s.balance}>
          <View style={s.dot} />
          <Text style={s.balanceText}>{pt(me?.user.points ?? 0)}</Text>
        </View>
      </Row>

      {hits.length ? (
        <View style={{ marginTop: 14 }}><HitTicker hits={hits} /></View>
      ) : null}

      {err ? <ErrorBox message={err} onRetry={load} /> : null}
      {!packs && !err ? <Loading text="팩 불러오는 중" /> : null}

      {normal.length ? (
        <View style={{ marginTop: 18 }}>
          <PackCarousel packs={normal} onOpen={(id) => router.push(`/pack/${id}`)} />
        </View>
      ) : null}

      {welcome && !welcomeUsed && !welcome.pack.sold_out ? (
        <Card tone="accent" style={{ marginTop: 22 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <H2>웰컴 팩</H2>
            <Pill text="계정당 1회" tone="accent" />
          </Row>
          <Sub style={{ marginTop: 8, lineHeight: 20 }}>
            가입 시 드린 {pt(welcome.pack.point_price)}로 바로 열 수 있어요.
          </Sub>
          <Button title={`${pt(welcome.pack.point_price)}로 개봉`} onPress={openWelcome} loading={busy}
            disabled={(me?.user.points ?? 0) < welcome.pack.point_price} style={{ height: 44, marginTop: 14 }} />
        </Card>
      ) : null}

      <Row style={{ justifyContent: "space-between", marginTop: 26, marginBottom: 4 }}>
        <H2>판매 중인 팩</H2>
        <Text style={s.live}>확률 실시간</Text>
      </Row>

      {normal.map((o) => {
        const top = [...o.hits].sort((a, b) => a.probability - b.probability)[0];
        const second = [...o.hits].sort((a, b) => a.probability - b.probability)[1];
        return (
          <Pressable key={o.pack.id} onPress={() => router.push(`/pack/${o.pack.id}`)} style={s.row}>
            <SlabCard grade={o.pack.sold_out ? "common" : "HIT"} image={o.pack.image} size="sm" />
            <View style={{ flex: 1, gap: 7 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={s.packName} numberOfLines={1}>{o.pack.name}</Text>
                <Text style={[s.price, o.pack.sold_out && { color: C.danger }]}>
                  {o.pack.sold_out ? "SOLD OUT" : won(o.pack.price)}
                </Text>
              </Row>
              <Sub>개봉 {o.pack.sold_slots} / {o.pack.total_slots} · 남은 슬롯 {o.pack.remaining_slots}</Sub>
              <Bar value={o.pack.total_slots ? o.pack.sold_slots / o.pack.total_slots : 0} />
              <Row style={{ flexWrap: "wrap", marginTop: 3 }}>
                {top ? <Pill text={`${top.name} ${pct(top.probability)}`} tone="accent" /> : null}
                {second ? <Pill text={`${second.name} ${pct(second.probability)}`} /> : null}
              </Row>
            </View>
          </Pressable>
        );
      })}

      <Card style={{ marginTop: 22 }}>
        <H2 style={{ fontSize: 14 }}>확률은 재고를 따라갑니다</H2>
        <Sub style={{ marginTop: 8, lineHeight: 20 }}>
          표시 확률 = 남은 수량 ÷ 남은 슬롯. 재고가 줄면 확률이 자동으로 올라가고, HIT이 전부 나가면 판매가 멈춥니다.
        </Sub>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  balance: { flexDirection: "row", alignItems: "center", gap: 7, height: 40, paddingHorizontal: 15,
    borderRadius: R.pill, backgroundColor: C.surface },
  dot: { width: 5, height: 5, borderRadius: 5, backgroundColor: C.accent },
  balanceText: { color: C.accent200, fontSize: 13, fontWeight: "500" },
  live: { color: C.accent300, fontSize: 11.5 },
  row: { flexDirection: "row", gap: 13, paddingVertical: 15, borderTopWidth: 1, borderTopColor: C.lineSoft },
  packName: { color: C.text, fontSize: 14.5, fontWeight: "500", flex: 1 },
  price: { color: C.text, fontSize: 14.5, fontWeight: "500" },
});
