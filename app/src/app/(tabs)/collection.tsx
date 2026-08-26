// 컬렉션 — 보유 카드. 포인트 교환 / 실물 배송 신청(합배송)
import React, { useCallback, useState } from "react";
import { View, Text, Pressable, Alert, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen, H1, H2, Sub, Card, Button, Field, Pill, Empty, ErrorBox, Row } from "@/components/ui";
import { SlabCard } from "@/components/SlabCard";
import { Api, ApiError, OwnedCard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, won, pt } from "@/lib/theme";

const SHIP_FEE = 3500;
const STATUS: Record<string, string> = {
  owned: "보유", exchanged: "교환됨", ship_requested: "배송 신청", shipped: "발송 완료",
};

function confirm2(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === "web") { if (confirm(`${title}\n\n${msg}`)) onOk(); return; }
  Alert.alert(title, msg, [{ text: "취소", style: "cancel" }, { text: "확인", onPress: onOk }]);
}

export default function Collection() {
  const { me, refresh } = useAuth();
  const [sel, setSel] = useState<number[]>([]);
  const [address, setAddress] = useState("");
  const [shipMode, setShipMode] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const cards: OwnedCard[] = me?.cards ?? [];
  const owned = cards.filter((c) => c.status === "owned");
  const others = cards.filter((c) => c.status !== "owned");

  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function exchange(c: OwnedCard) {
    setBusy(true); setErr(null);
    try { await Api.exchange(c.id); await refresh(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "교환에 실패했어요."); }
    finally { setBusy(false); }
  }

  async function requestShip() {
    if (!sel.length || !address.trim()) return;
    setBusy(true); setErr(null);
    try {
      await Api.ship(sel, address.trim());
      setSel([]); setAddress(""); setShipMode(false);
      await refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "배송 신청에 실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <Screen onRefresh={refresh}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <H1>컬렉션</H1>
        <Text style={{ color: C.accent200, fontWeight: "900" }}>{pt(me?.user.points ?? 0)}</Text>
      </Row>

      {err ? <ErrorBox message={err} /> : null}

      {!owned.length ? <Empty text="아직 보유한 카드가 없어요. 팩을 열어보세요." /> : null}

      {owned.length ? (
        <>
          <Row style={{ justifyContent: "space-between", marginTop: 16 }}>
            <H2>보유 카드 {owned.length}장</H2>
            <Pressable onPress={() => { setShipMode((v) => !v); setSel([]); }}>
              <Text style={{ color: C.accent200, fontWeight: "800", fontSize: 13 }}>
                {shipMode ? "취소" : "배송 신청"}
              </Text>
            </Pressable>
          </Row>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            {owned.map((c) => {
              const on = sel.includes(c.id);
              return (
                <Pressable key={c.id} onPress={() => (shipMode ? toggle(c.id) : undefined)}>
                  <View style={{ opacity: shipMode && !on ? 0.45 : 1 }}>
                    <SlabCard name={c.name} grade={c.grade} points={c.point_value} image={c.image} size="sm" />
                  </View>
                  {shipMode ? (
                    <View style={{ position: "absolute", top: 6, right: 6 }}>
                      <Pill text={on ? "선택됨" : "선택"} tone={on ? "accent" : "neutral"} />
                    </View>
                  ) : (
                    <Button title={`${pt(c.point_value)} 교환`} kind="ghost"
                      onPress={() => confirm2("포인트 교환", `${c.name}을(를) ${pt(c.point_value)}로 교환합니다. 되돌릴 수 없어요.`, () => exchange(c))}
                      style={{ marginTop: 6, paddingVertical: 8, width: 104 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {shipMode ? (
        <Card>
          <H2>실물 배송 신청</H2>
          <Sub style={{ marginTop: 4 }}>
            선택한 카드를 함께 보내드립니다(합배송). 배송비 {won(SHIP_FEE)}은 신청자 부담입니다.
          </Sub>
          <Field label="받는 주소" placeholder="도로명 주소, 상세주소" value={address} onChangeText={setAddress} multiline />
          <Row style={{ justifyContent: "space-between", marginTop: 12 }}>
            <Sub>선택 {sel.length}장</Sub>
            <Sub>배송비 {won(SHIP_FEE)}</Sub>
          </Row>
          <Button title="배송 신청" onPress={requestShip} loading={busy}
            disabled={!sel.length || !address.trim()} style={{ marginTop: 12 }} />
        </Card>
      ) : null}

      {others.length ? (
        <Card>
          <H2>지난 카드</H2>
          <View style={{ marginTop: 10, gap: 8 }}>
            {others.map((c) => (
              <Row key={c.id} style={{ justifyContent: "space-between" }}>
                <Text style={{ color: C.n500, flex: 1 }} numberOfLines={1}>{c.name}</Text>
                <Pill text={STATUS[c.status] || c.status} />
              </Row>
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
