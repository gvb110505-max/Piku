// 홈 — 확률판.
//
// 다른 랜덤팩 앱은 큰 배너와 흐르는 티커로 화면을 채운다. Piku가 팔 수 있는 건 그게 아니라
// "지금 이 팩의 실제 확률"이라서, 화면을 그 숫자 위주로 짰다.
//   상단 요약(오늘 개봉 / 남은 HIT) → 팩별 확률 행 → 최근 HIT 기록 → 웰컴팩 → 규칙
// 가짜 할인, 이벤트 라벨, 동작하지 않는 알림 아이콘은 두지 않는다.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Sub, Button, Loading, ErrorBox } from "@/components/ui";
import { OddsRow } from "@/components/OddsRow";
import { HitFeed } from "@/components/HitFeed";
import { Api, Odds, RecentHit, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, NUM, pt } from "@/lib/theme";

const HITS_POLL_MS = 20000;

// 섹션 머리. 왼쪽 제목 + 오른쪽 보조값 한 줄로 통일한다.
function Head({ title, note }: { title: string; note?: string }) {
  return (
    <View style={st.head}>
      <Text style={st.headTitle}>{title}</Text>
      {note ? <Text style={st.headNote}>{note}</Text> : null}
    </View>
  );
}

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

  // HIT 기록은 부가 정보다 — 실패해도 화면을 막지 않는다.
  const loadHits = useCallback(async () => {
    try { setHits(await Api.recentHits(12)); } catch { /* 무시 */ }
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

  // 상단 요약 — 전 팩 합산. 재고가 실제로 얼마나 남았는지 한 줄로 보여준다.
  const opened = normal.reduce((s, o) => s + o.pack.sold_slots, 0);
  const hitLeft = normal.reduce((s, o) => s + o.hits.reduce((a, h) => a + h.remaining, 0), 0);
  const slotsLeft = normal.reduce((s, o) => s + o.pack.remaining_slots, 0);

  async function openWelcome() {
    setBusy(true);
    try { await Api.welcome(); await refresh(); router.push("/(tabs)/collection"); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} tintColor={C.n400}
          onRefresh={() => { load(); loadHits(); }} />}
      >
        <View style={st.topBar}>
          <Text style={st.brand}>PIKU</Text>
          <Text style={st.points}>{pt(me?.user.points ?? 0)}</Text>
        </View>

        {/* 이 앱의 한 줄 요약 — 배너 대신 이 문장을 둔다 */}
        <Text style={st.claim}>확률을 숨기지 않습니다.</Text>
        <Text style={st.claimSub}>
          표시 확률 = 남은 수량 ÷ 남은 슬롯. 재고가 줄면 확률이 오르고, HIT이 전부 나가면 판매가 멈춥니다.
        </Text>

        <View style={st.stats}>
          <Stat label="누적 개봉" value={opened} />
          <Stat label="남은 HIT" value={hitLeft} />
          <Stat label="남은 슬롯" value={slotsLeft} />
        </View>

        {err ? <ErrorBox message={err} onRetry={load} /> : null}
        {!packs && !err ? <Loading text="확률 불러오는 중" /> : null}

        {normal.length ? (
          <>
            <Head title="랜덤팩" note="실시간" />
            {normal.map((o) => (
              <OddsRow key={o.pack.id} o={o} onPress={() => router.push(`/pack/${o.pack.id}`)} />
            ))}
          </>
        ) : null}

        {hits.length ? (
          <>
            <Head title="최근 HIT" note={`${hits.length}건`} />
            <HitFeed hits={hits} limit={5} />
          </>
        ) : null}

        {welcome && !welcomeUsed && !welcome.pack.sold_out ? (
          <>
            <Head title="웰컴팩" note="계정당 1회" />
            <View style={st.welcome}>
              <Sub style={{ lineHeight: 20 }}>
                가입 시 드린 {pt(welcome.pack.point_price)}로 바로 열 수 있어요. 결제 없이 한 번.
              </Sub>
              <Button title={`${pt(welcome.pack.point_price)}로 개봉`} onPress={openWelcome} loading={busy}
                disabled={(me?.user.points ?? 0) < welcome.pack.point_price}
                style={{ height: 46, marginTop: 14 }} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value.toLocaleString("ko-KR")}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: C.text, fontSize: 15, fontWeight: "700", letterSpacing: 3 },
  points: { ...NUM, color: C.n300, fontSize: 13, fontWeight: "500" },

  claim: { color: C.text, fontSize: 25, fontWeight: "600", letterSpacing: -0.6, marginTop: 26 },
  claimSub: { color: C.n500, fontSize: 12.5, lineHeight: 19, marginTop: 10 },

  stats: { flexDirection: "row", marginTop: 22, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: C.lineSoft, paddingVertical: 14 },
  stat: { flex: 1 },
  statValue: { ...NUM, color: C.text, fontSize: 19, fontWeight: "600", letterSpacing: -0.3 },
  statLabel: { color: C.n600, fontSize: 10.5, marginTop: 4, letterSpacing: 0.6 },

  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 34, marginBottom: 4 },
  headTitle: { color: C.text, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  headNote: { color: C.n600, fontSize: 10.5, letterSpacing: 0.8 },

  welcome: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 16 },
});
