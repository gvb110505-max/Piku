// 마이 — 포인트, 본인확인, 결제 한도, 배송/주문 내역
import React, { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, H1, H2, Sub, Card, Button, Field, Pill, ErrorBox, Row, Empty } from "@/components/ui";
import { Api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, won, pt } from "@/lib/theme";

export default function Me() {
  const router = useRouter();
  const { me, refresh, signOut } = useAuth();
  const [ident, setIdent] = useState<any>(null);
  const [birth, setBirth] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadIdent = useCallback(async () => {
    try { setIdent(await Api.identity()); } catch { setIdent(null); }
  }, []);
  useEffect(() => { loadIdent(); }, [loadIdent]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function devVerify() {
    setBusy(true); setErr(null);
    try {
      await Api.devVerify(birth.trim());
      await loadIdent(); await refresh();
      setBirth("");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  const limit = me?.limit;

  return (
    <Screen onRefresh={() => { refresh(); loadIdent(); }}>
      <H1>마이</H1>

      <Card tone="panel">
        <Row style={{ justifyContent: "space-between" }}>
          <H2>{me?.user.nickname ?? "-"}</H2>
        </Row>
        <Sub style={{ marginTop: 14 }}>보유 포인트</Sub>
        <Text style={{ color: C.text, fontSize: 32, fontWeight: "500", letterSpacing: -0.6, marginTop: 6 }}>
          {pt(me?.user.points ?? 0)}
        </Text>
      </Card>

      <Card tone={ident?.verified ? "surface" : "accent"}>
        <Row style={{ justifyContent: "space-between" }}>
          <H2>본인확인</H2>
          <Pill text={ident?.verified ? "완료" : "미완료"} tone={ident?.verified ? "accent" : "danger"} />
        </Row>
        {ident?.verified ? (
          <Sub style={{ marginTop: 6 }}>
            {ident.is_minor ? "만 19세 미만으로 확인되어 결제 한도가 적용됩니다." : "성인 확인 완료 · 결제 한도 없음"}
          </Sub>
        ) : (
          <>
            <Sub style={{ marginTop: 6 }}>
              본인확인 전에는 미성년자 기준(1일 10만원)이 적용됩니다. PASS 인증은 준비 중입니다.
            </Sub>
            {ident?.dev_mode ? (
              <>
                <Field label="생년월일 (개발 모드)" placeholder="19900101" value={birth}
                  onChangeText={setBirth} keyboardType="number-pad" maxLength={8} />
                <Button title="확인" onPress={devVerify} loading={busy}
                  disabled={!/^(19|20)\d{6}$/.test(birth.trim())} style={{ marginTop: 12 }} />
              </>
            ) : null}
          </>
        )}
        {limit?.is_minor ? (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Sub>오늘 결제</Sub>
              <Sub>{won(limit.today_spent)} / {won(limit.daily_limit ?? 0)}</Sub>
            </Row>
            <Sub style={{ marginTop: 4 }}>남은 한도 {won(limit.remaining ?? 0)}</Sub>
          </View>
        ) : null}
      </Card>

      {err ? <ErrorBox message={err} /> : null}

      <Card>
        <H2>마켓</H2>
        <Button title="내 거래 보기" kind="ghost" onPress={() => router.push("/market/orders")} style={{ marginTop: 12 }} />
        <Button title="판매 등록" kind="ghost" onPress={() => router.push("/market/sell")} style={{ marginTop: 8 }} />
      </Card>

      <Card>
        <H2>배송 신청</H2>
        {!me?.shipments?.length ? <Empty text="배송 신청 내역이 없어요." /> : (
          <View style={{ marginTop: 10, gap: 10 }}>
            {me.shipments.map((s: any) => (
              <View key={s.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ color: C.text, fontWeight: "700" }}>#{s.id}</Text>
                  <Pill text={{ requested: "접수", preparing: "준비 중", shipped: "발송 완료" }[s.status as string] || s.status}
                    tone={s.status === "shipped" ? "accent" : "neutral"} />
                </Row>
                <Sub style={{ marginTop: 2 }}>{s.address}</Sub>
                {s.tracking ? <Sub>운송장 {s.tracking}</Sub> : null}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <H2>포인트 내역</H2>
        {!me?.point_logs?.length ? <Empty text="내역이 없어요." /> : (
          <View style={{ marginTop: 10, gap: 8 }}>
            {me.point_logs.slice(0, 20).map((l: any) => (
              <Row key={l.id} style={{ justifyContent: "space-between" }}>
                <Text style={{ color: C.n500, fontSize: 13, flex: 1 }} numberOfLines={1}>{l.reason}</Text>
                <Text style={{ color: l.delta > 0 ? C.up : C.danger, fontWeight: "800", fontSize: 13 }}>
                  {l.delta > 0 ? "+" : ""}{Number(l.delta).toLocaleString("ko-KR")}P
                </Text>
              </Row>
            ))}
          </View>
        )}
      </Card>

      <Button title="로그아웃" kind="ghost" onPress={signOut} style={{ marginTop: 20 }} />
    </Screen>
  );
}
