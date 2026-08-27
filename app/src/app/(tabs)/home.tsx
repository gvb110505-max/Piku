// 홈 — 상점 화면.
//
// 골격은 커머스 앱 그대로다: 인사말 → 탭 칩 → 프리미엄 배너 → 숏컷 → 일반 상품 슬라이드 → 레일.
// 상단 큰 화면에는 비싼 팩(프리미엄)이 비싼 순으로 들어가고,
// 나머지 일반 상품은 세로 2칸씩 묶어 가로로 민다.
// 각 자리에는 광고 문구 대신 실제 값(이름 · 가격 · 잔여 수량)만 넣는다.
// 확률은 홈에 적지 않는다 — 목록에 %가 박히면 상점이 아니라 통계표로 읽힌다.
// 확률표는 팩 상세에서 전체를 한 번에 본다.
//
// 참고 앱에 있지만 일부러 안 넣은 것:
//   · 알림 벨 — 알림 기능이 없다. 눌러도 아무 일 없는 아이콘은 두지 않는다.
//   · 장바구니 — 팩도 마켓 매물도 한 건씩 즉시 결제라 담아둘 대상이 없다.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Sub, Button, Loading, ErrorBox } from "@/components/ui";
import { PackSlider } from "@/components/PackSlider";
import { HitFeed } from "@/components/HitFeed";
import { HomeHero } from "@/components/HomeHero";
import { QuickRow, Quick } from "@/components/QuickRow";
import { MarketRail } from "@/components/MarketRail";
import {
  IconSearch, IconBag, IconBinder, IconGift, IconPlus, IconChart, IconChevron,
} from "@/components/icons";
import { Api, Odds, RecentHit, Listing, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, R, T, NUM, pt } from "@/lib/theme";

const HITS_POLL_MS = 20000;
const TABS = [
  { key: "all", label: "추천" },
  { key: "pack", label: "랜덤팩" },
  { key: "market", label: "카드거래" },   // 하단 탭의 "마켓"과 라벨이 겹치지 않게 한다
] as const;
type TabKey = (typeof TABS)[number]["key"];

// 섹션 머리. 오른쪽은 "더보기"이거나 보조 수치다.
function Head({ title, note, onMore }: { title: string; note?: string; onMore?: () => void }) {
  return (
    <View style={st.head}>
      <Text style={st.headTitle}>{title}</Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={st.more}>
          <Text style={st.headNote}>더보기</Text>
          <IconChevron size={14} color={C.n500} />
        </Pressable>
      ) : note ? <Text style={st.headNote}>{note}</Text> : null}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { me, refresh } = useAuth();
  const [tab, setTab] = useState<TabKey>("all");
  const [packs, setPacks] = useState<Odds[] | null>(null);
  const [hits, setHits] = useState<RecentHit[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [shipFee, setShipFee] = useState(3500);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setPacks(await Api.packs()); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "불러오지 못했어요."); }
  }, []);

  // 아래 것들은 부가 정보다 — 실패해도 화면을 막지 않는다.
  const loadSide = useCallback(async () => {
    try { setHits(await Api.recentHits(12)); } catch { /* 무시 */ }
    try { setListings((await Api.listings({ sort: "" })).items.slice(0, 10)); } catch { /* 무시 */ }
    try { const p = await Api.policy(); if (p?.shipping_fee != null) setShipFee(Number(p.shipping_fee)); } catch { /* 무시 */ }
  }, []);

  useEffect(() => { load(); loadSide(); }, [load, loadSide]);
  useEffect(() => {
    const t = setInterval(() => { Api.recentHits(12).then(setHits).catch(() => {}); }, HITS_POLL_MS);
    return () => clearInterval(t);
  }, []);
  useFocusEffect(useCallback(() => { refresh(); loadSide(); }, [refresh, loadSide]));

  const welcome = packs?.find((p) => p.pack.is_welcome);
  // 서버가 비싼 순으로 내려주지만, 순서에 기대지 않고 여기서 한 번 더 정렬한다
  const sellable = useMemo(
    () => (packs?.filter((p) => !p.pack.is_welcome) ?? []).sort((a, b) => b.pack.price - a.pack.price),
    [packs]);
  // 상단 큰 화면 = 제일 비싼 팩부터. 나머지는 아래 가로 슬라이드로.
  const HERO_COUNT = 3;
  const premium = sellable.slice(0, HERO_COUNT);
  const normal = sellable.slice(HERO_COUNT);
  const welcomeUsed = !!me?.user.welcome_used;
  const canWelcome = !!welcome && !welcomeUsed && !welcome.pack.sold_out;

  async function openWelcome() {
    setBusy(true);
    try { await Api.welcome(); await refresh(); router.push("/(tabs)/collection"); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  const quicks: Quick[] = [
    { key: "market", label: "마켓", color: C.uncommon, icon: <IconBag size={21} color={C.uncommon} />,
      onPress: () => router.push("/(tabs)/market") },
    { key: "collection", label: "컬렉션", color: C.rare, icon: <IconBinder size={21} color={C.rare} />,
      onPress: () => router.push("/(tabs)/collection") },
    { key: "welcome", label: "웰컴팩", color: C.hit, icon: <IconGift size={21} color={C.hit} />,
      badge: canWelcome ? "1" : null,
      onPress: () => (canWelcome ? openWelcome() : router.push("/(tabs)/collection")) },
    { key: "point", label: "포인트", color: C.up, icon: <IconChart size={21} color={C.up} />,
      onPress: () => router.push("/(tabs)/me") },
    { key: "sell", label: "판매하기", color: C.brand, icon: <IconPlus size={21} color={C.brand} />,
      onPress: () => router.push("/market/sell") },
  ];

  const showPacks = tab !== "market";
  const showMarket = tab !== "pack";

  return (
    <SafeAreaView style={st.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} tintColor={C.n400}
          onRefresh={() => { load(); loadSide(); }} />}
      >
        {/* 인사말 + 검색. 포인트는 늘 보이게 둔다 — 웰컴팩·교환에서 계속 쓰는 값이다. */}
        <View style={st.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={st.hello} numberOfLines={1}>
              안녕하세요, {me?.user.nickname || "트레이너"}님
            </Text>
            <Text style={st.points}>{pt(me?.user.points ?? 0)}</Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/market")} hitSlop={10} style={st.iconBtn}>
            <IconSearch size={19} color={C.n200} />
          </Pressable>
        </View>

        {/* 탭 칩 — 아래 섹션을 실제로 걸러낸다 */}
        <View style={st.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={st.tab}>
              <Text style={[st.tabText, tab === t.key && st.tabTextOn]}>{t.label}</Text>
              <View style={[st.tabBar, tab === t.key && st.tabBarOn]} />
            </Pressable>
          ))}
        </View>

        {err ? <ErrorBox message={err} onRetry={load} /> : null}
        {!packs && !err ? <Loading text="확률 불러오는 중" /> : null}

        {showPacks && premium.length ? (
          <View style={{ marginTop: 18 }}>
            <HomeHero packs={premium} onOpen={(id) => router.push(`/pack/${id}`)} />
          </View>
        ) : null}

        <QuickRow items={quicks} />

        {showPacks && normal.length ? (
          <>
            <Head title="랜덤팩" note={`${sellable.length}종`} />
            <View style={{ marginTop: 14 }}>
              <PackSlider packs={normal} onOpen={(id) => router.push(`/pack/${id}`)} />
            </View>
          </>
        ) : null}

        {showMarket && listings.length ? (
          <>
            <Head title="마켓 새 매물" onMore={() => router.push("/(tabs)/market")} />
            <View style={{ marginTop: 14 }}>
              <MarketRail items={listings} shippingFee={shipFee}
                onOpen={(id) => router.push(`/market/${id}`)} />
            </View>
          </>
        ) : null}

        {hits.length ? (
          <>
            <Head title="최근 HIT" note={`${hits.length}건`} />
            <HitFeed hits={hits} limit={5} />
          </>
        ) : null}

        {canWelcome ? (
          <>
            <Head title="웰컴팩" note="계정당 1회" />
            <View style={st.welcome}>
              <Sub style={{ lineHeight: 20 }}>
                가입 시 드린 {pt(welcome!.pack.point_price)}로 바로 열 수 있어요. 결제 없이 한 번.
              </Sub>
              <Button title={`${pt(welcome!.pack.point_price)}로 개봉`} onPress={openWelcome} loading={busy}
                disabled={(me?.user.points ?? 0) < welcome!.pack.point_price}
                style={{ height: 46, marginTop: 14 }} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  hello: { ...T, color: C.text, fontSize: 16, fontWeight: "600", letterSpacing: -0.4 },
  points: { ...NUM, color: C.hit, fontSize: 11.5, fontWeight: "600", marginTop: 3 },
  iconBtn: { width: 36, height: 36, borderRadius: R.pill, alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },

  tabs: { flexDirection: "row", gap: 20, marginTop: 18, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  tab: { alignItems: "center" },
  tabText: { ...T, color: C.n500, fontSize: 13, fontWeight: "500", paddingBottom: 9 },
  tabTextOn: { color: C.brand, fontWeight: "700" },
  tabBar: { height: 2, alignSelf: "stretch", backgroundColor: "transparent", marginBottom: -1 },
  tabBarOn: { backgroundColor: C.brand },

  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 4 },
  headTitle: { ...T, color: C.text, fontSize: 14, fontWeight: "600", letterSpacing: -0.2 },
  headNote: { ...T, color: C.n500, fontSize: 11 },
  more: { flexDirection: "row", alignItems: "center", gap: 2 },

  welcome: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 14, marginTop: 8 },
});
