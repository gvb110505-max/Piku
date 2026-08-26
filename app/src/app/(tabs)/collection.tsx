// 컬렉션 — 같은 카드는 묶어서 수량 배지로 보여주고, 선택한 묶음에 대해
// 포인트 변환 / 배송 신청을 플로팅 버튼으로 처리한다.
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { H1, H2, Sub, Card, Button, Field, Pill, Empty, ErrorBox, Row } from "@/components/ui";
import { CollectionCard, CardGroup } from "@/components/CollectionCard";
import { IconTruck } from "@/components/icons";
import { Api, ApiError, OwnedCard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, R, won, pt } from "@/lib/theme";

const SHIP_FEE = 3500;
const STATUS: Record<string, string> = {
  exchanged: "교환됨", ship_requested: "배송 신청", shipped: "발송 완료",
};

export default function Collection() {
  const { me, refresh } = useAuth();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [shipOpen, setShipOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const cards: OwnedCard[] = me?.cards ?? [];
  const owned = useMemo(() => cards.filter((c) => c.status === "owned"), [cards]);
  const others = useMemo(() => cards.filter((c) => c.status !== "owned"), [cards]);

  // 같은 카드(이름+등급)를 한 칸으로 묶는다
  const groups: CardGroup[] = useMemo(() => {
    const m = new Map<string, CardGroup>();
    for (const c of owned) {
      const key = `${c.name}|${c.grade}`;
      const g = m.get(key);
      if (g) g.ids.push(c.id);
      else m.set(key, { key, name: c.name, grade: c.grade, image: c.image,
        point_value: c.point_value, ids: [c.id] });
    }
    // HIT을 앞으로, 그다음 교환가 높은 순
    return [...m.values()].sort((a, b) =>
      (b.grade === "HIT" ? 1 : 0) - (a.grade === "HIT" ? 1 : 0) || b.point_value - a.point_value);
  }, [owned]);

  const selectedIds = useMemo(() => [...sel], [sel]);
  const selectedValue = useMemo(
    () => owned.filter((c) => sel.has(c.id)).reduce((a, c) => a + c.point_value, 0),
    [owned, sel]);

  // 묶음을 누르면 그 묶음의 카드 전부를 선택/해제한다
  function toggle(g: CardGroup) {
    setSel((prev) => {
      const next = new Set(prev);
      const on = g.ids.every((id) => next.has(id));
      for (const id of g.ids) on ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function exchange() {
    if (!selectedIds.length) return;
    setBusy(true); setErr(null);
    try {
      // 서버는 한 장씩 교환한다 — 실패한 장이 있어도 나머지는 그대로 진행
      for (const id of selectedIds) await Api.exchange(id);
      setSel(new Set());
      await refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "교환에 실패했어요."); }
    finally { setBusy(false); }
  }

  async function requestShip() {
    if (!selectedIds.length || !address.trim()) return;
    setBusy(true); setErr(null);
    try {
      await Api.ship(selectedIds, address.trim());
      setSel(new Set()); setAddress(""); setShipOpen(false);
      await refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "배송 신청에 실패했어요."); }
    finally { setBusy(false); }
  }

  const hasSel = selectedIds.length > 0;

  return (
    <SafeAreaView style={st.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 150 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <H1>컬렉션</H1>
          <View style={st.balance}>
            <View style={st.dot} />
            <Text style={st.balanceText}>{pt(me?.user.points ?? 0)}</Text>
          </View>
        </Row>

        <Text style={st.count}>
          {owned.length}장 · {groups.length}종
          {hasSel ? <Text style={{ color: C.accent200 }}>{`   선택 ${selectedIds.length}장 · ${pt(selectedValue)}`}</Text> : null}
        </Text>

        {err ? <ErrorBox message={err} /> : null}

        {!groups.length ? <Empty text="아직 보유한 카드가 없어요. 팩을 열어보세요." /> : (
          <View style={st.grid}>
            {groups.map((g) => (
              <CollectionCard key={g.key} group={g}
                selected={g.ids.every((id) => sel.has(id))}
                onPress={() => toggle(g)} />
            ))}
          </View>
        )}

        {others.length ? (
          <Card style={{ marginTop: 24 }}>
            <H2 style={{ fontSize: 14 }}>지난 카드</H2>
            <View style={{ marginTop: 12, gap: 10 }}>
              {others.map((c) => (
                <Row key={c.id} style={{ justifyContent: "space-between" }}>
                  <Text style={st.pastName} numberOfLines={1}>{c.name}</Text>
                  <Pill text={STATUS[c.status] || c.status} />
                </Row>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>

      {/* 플로팅 액션 — 선택이 있어야 눌린다 */}
      <View style={st.fab} pointerEvents="box-none">
        <Pressable onPress={hasSel ? exchange : undefined}
          style={[st.fabBtn, !hasSel && st.fabOff]}>
          <View style={st.coin} />
          <Text style={[st.fabText, !hasSel && st.fabTextOff]}>
            {hasSel ? `${pt(selectedValue)} 변환` : "포인트 변환"}
          </Text>
        </Pressable>
        <Pressable onPress={hasSel ? () => setShipOpen(true) : undefined}
          style={[st.fabBtn, !hasSel && st.fabOff]}>
          <IconTruck size={17} color={hasSel ? C.onAccent : C.n500} />
          <Text style={[st.fabText, !hasSel && st.fabTextOff]}>배송 신청</Text>
        </Pressable>
      </View>

      <Modal visible={shipOpen} transparent animationType="slide" onRequestClose={() => setShipOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setShipOpen(false)} />
        <View style={st.sheet}>
          <View style={st.handle} />
          <H2>실물 배송 신청</H2>
          <Sub style={{ marginTop: 6, lineHeight: 19 }}>
            선택한 {selectedIds.length}장을 함께 보내드립니다(합배송). 배송비 {won(SHIP_FEE)}은 신청자 부담입니다.
          </Sub>
          <Field label="받는 주소" placeholder="도로명 주소, 상세주소"
            value={address} onChangeText={setAddress} multiline />
          <Button title={`${selectedIds.length}장 배송 신청`} onPress={requestShip} loading={busy}
            disabled={!address.trim()} style={{ marginTop: 18 }} />
          <Button title="취소" kind="ghost" onPress={() => setShipOpen(false)} style={{ marginTop: 8 }} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  balance: { flexDirection: "row", alignItems: "center", gap: 7, height: 40, paddingHorizontal: 15,
    borderRadius: R.pill, backgroundColor: C.surface },
  dot: { width: 5, height: 5, borderRadius: 5, backgroundColor: C.gold },
  balanceText: { color: C.text, fontSize: 13, fontWeight: "500" },
  count: { color: C.n500, fontSize: 12.5, marginTop: 12, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  pastName: { color: C.n400, fontSize: 13, flex: 1 },

  fab: { position: "absolute", right: 20, bottom: 24, gap: 10, alignItems: "flex-end" },
  fabBtn: { flexDirection: "row", alignItems: "center", gap: 9, height: 48, paddingHorizontal: 20,
    borderRadius: R.pill, backgroundColor: C.accent },
  fabOff: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  fabText: { color: C.onAccent, fontSize: 14.5, fontWeight: "600" },
  fabTextOff: { color: C.n500 },
  coin: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: C.onAccent },

  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.66)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.surface,
    borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: 20, paddingBottom: 34,
    borderTopWidth: 1, borderTopColor: C.line },
  handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: C.n600, alignSelf: "center", marginBottom: 16 },
});
