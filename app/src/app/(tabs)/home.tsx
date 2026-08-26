// 홈 — 풀블리드 히어로 → 가로 HIT 티커 → 팩 레일 → 웰컴팩.
// 확률은 서버가 내려준 값을 그대로 보여준다(표시=실제).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { H2, Sub, Card, Button, Loading, ErrorBox, Row, Pill } from "@/components/ui";
import { HitTicker } from "@/components/HitTicker";
import { PackHero } from "@/components/PackHero";
import { PackRail } from "@/components/PackRail";
import { Api, Odds, RecentHit, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, pt, pct } from "@/lib/theme";

const HITS_POLL_MS = 20000;

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
    try { setHits(await Api.recentHits(20)); } catch { /* 부가 정보 */ }
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
  const open = (id: number) => router.push(`/pack/${id}`);

  async function openWelcome() {
    setBusy(true);
    try { await Api.welcome(); await refresh(); router.push("/(tabs)/collection"); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.screen} edges={[]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} tintColor={C.n400}
          onRefresh={() => { load(); loadHits(); }} />}
      >
        {!packs && !err ? <Loading text="팩 불러오는 중" /> : null}

        <PackHero packs={normal} points={me?.user.points ?? 0} onOpen={open} />
        <HitTicker hits={hits} />

        {err ? <View style={{ padding: 20 }}><ErrorBox message={err} onRetry={load} /></View> : null}

        <Row style={st.sectionHead}>
          <Text style={st.sectionTitle}>랜덤팩</Text>
          <Text style={st.live}>확률 실시간</Text>
        </Row>
        <PackRail packs={normal} onOpen={open} />

        {welcome && !welcomeUsed && !welcome.pack.sold_out ? (
          <View style={{ paddingHorizontal: 20 }}>
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
          </View>
        ) : null}

        <Row style={st.sectionHead}>
          <Text style={st.sectionTitle}>확률 · 잔여</Text>
        </Row>
        <View style={{ paddingHorizontal: 20 }}>
          {normal.map((o) => {
            const sorted = [...o.hits].sort((a, b) => a.probability - b.probability);
            return (
              <Pressable key={o.pack.id} onPress={() => open(o.pack.id)} style={st.oddsRow}>
                <Text style={st.oddsName} numberOfLines={1}>{o.pack.name}</Text>
                <Row style={{ flexWrap: "wrap", marginTop: 7 }}>
                  {sorted.slice(0, 2).map((hb, n) => (
                    <Pill key={hb.id} text={`${hb.name} ${pct(hb.probability)}`}
                      tone={n === 0 ? "accent" : "neutral"} />
                  ))}
                </Row>
              </Pressable>
            );
          })}

          <Card style={{ marginTop: 18 }}>
            <H2 style={{ fontSize: 14 }}>확률은 재고를 따라갑니다</H2>
            <Sub style={{ marginTop: 8, lineHeight: 20 }}>
              표시 확률 = 남은 수량 ÷ 남은 슬롯. 재고가 줄면 확률이 자동으로 올라가고, HIT이 전부 나가면 판매가 멈춥니다.
            </Sub>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  sectionHead: { justifyContent: "space-between", paddingHorizontal: 20, marginTop: 26, marginBottom: 10 },
  sectionTitle: { color: C.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  live: { color: C.n400, fontSize: 11.5 },
  oddsRow: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.lineSoft },
  oddsName: { color: C.text, fontSize: 14.5, fontWeight: "500" },
});
