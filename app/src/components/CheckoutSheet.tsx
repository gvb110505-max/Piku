// 결제 시트 — 링크 결제(블로그페이 방식)의 앱 쪽 절반.
//
// 앱은 결제를 처리하지 않는다. 서버가 만든 주문번호와 결제 링크를 보여주고,
// 결제가 앱 밖에서 끝나기를 기다렸다가 확인되면 결과를 넘긴다.
// 그래서 이 화면의 주인공은 "주문번호"다 — 입금자명·메모에 이 코드가 들어가야
// 사람이 대사할 수 있다. 크게, 복사하기 쉽게 둔다.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Modal, Pressable, Linking, ActivityIndicator, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Sub, ErrorBox } from "@/components/ui";
import { Api, Checkout, ApiError } from "@/lib/api";
import { C, R, T, won, NUM, MONO } from "@/lib/theme";

const POLL_MS = 3000;

function remain(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function CheckoutSheet({ checkout, onPaid, onClose }: {
  checkout: Checkout;
  onPaid: (result: NonNullable<Checkout["result"]>) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<Checkout>(checkout);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(() => remain(checkout.expires_at));
  const done = useRef(false);

  // 입금 확인은 앱 밖에서 일어난다 — 상태를 지켜보는 것 말고 할 수 있는 게 없다.
  useEffect(() => {
    if (state.status !== "pending") return;
    const t = setInterval(async () => {
      try {
        const next = await Api.checkoutStatus(state.uid);
        setState(next);
        if (next.status === "paid" && next.result && !done.current) {
          done.current = true;
          onPaid(next.result);
        }
      } catch { /* 폴링 실패는 조용히 넘긴다 — 다음 주기에 다시 본다 */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [state.status, state.uid, onPaid]);

  useEffect(() => {
    const t = setInterval(() => setLeft(remain(state.expires_at)), 1000);
    return () => clearInterval(t);
  }, [state.expires_at]);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(state.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [state.uid]);

  async function openLink() {
    if (!state.pay_url) return;
    try { await Linking.openURL(state.pay_url); }
    catch { setErr("결제 링크를 열지 못했어요. 링크를 복사해 브라우저에서 열어주세요."); }
  }

  async function cancel() {
    setBusy(true);
    try { await Api.cancelCheckout(state.uid); onClose(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "취소하지 못했어요."); }
    finally { setBusy(false); }
  }

  // 개발 빌드에서만 뜨는 버튼. 운영에서는 서버가 막는다.
  async function devPay() {
    setBusy(true); setErr(null);
    try {
      const r = await Api.confirmDev(state.uid);
      setState(r);
      if (r.result && !done.current) { done.current = true; onPaid(r.result); }
    } catch (e) { setErr(e instanceof ApiError ? e.message : "실패했어요."); }
    finally { setBusy(false); }
  }

  const closed = state.status !== "pending" && state.status !== "paid";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.handle} />

        <Text style={st.eyebrow}>결제</Text>
        <Text style={st.title} numberOfLines={1}>{state.title || "주문"}</Text>
        <Text style={st.amount}>{won(state.amount)}</Text>

        {/* 주문번호 — 이 코드가 입금자명·메모로 들어가야 대사가 된다 */}
        <Pressable onPress={copy} style={st.uidBox}>
          <View style={{ flex: 1 }}>
            <Text style={st.uidLabel}>주문번호</Text>
            <Text style={st.uid}>{state.uid}</Text>
          </View>
          <Text style={st.copy}>{copied ? "복사됨" : "복사"}</Text>
        </Pressable>

        {state.status === "pending" ? (
          <>
            {state.provider === "manual" && state.bank ? (
              <View style={st.info}>
                <Text style={st.infoLabel}>입금 계좌</Text>
                <Text style={st.infoValue}>{state.bank}</Text>
                <Sub style={{ marginTop: 8, lineHeight: 19 }}>
                  입금자명을 <Text style={{ color: C.text }}>{state.uid}</Text> 로 넣어주세요.
                  이름이 다르면 확인이 늦어질 수 있어요.
                </Sub>
              </View>
            ) : null}

            {state.pay_url ? (
              <Button title="결제 링크 열기" onPress={openLink} style={{ marginTop: 16 }} />
            ) : null}

            {/* 링크도 계좌도 없으면 관리자가 결제 수단을 아직 등록하지 않은 것이다.
                화면이 고장난 것처럼 보이지 않게 그 사실을 그대로 알린다. */}
            {!state.pay_url && !state.bank ? (
              <View style={st.info}>
                <Sub style={{ lineHeight: 19 }}>
                  결제 수단이 아직 등록되지 않았어요. 주문번호 {state.uid} 를 알려주시면 안내해드립니다.
                </Sub>
              </View>
            ) : null}

            <View style={st.waiting}>
              <ActivityIndicator color={C.n400} size="small" />
              <Text style={st.waitText}>입금 확인을 기다리는 중</Text>
              {left ? <Text style={st.timer}>{left}</Text> : null}
            </View>
            <Sub style={{ lineHeight: 19 }}>
              결제가 확인되면 이 화면에서 바로 열립니다. 앱을 닫아도 결제는 유지되고,
              {left ? " 남은 시간이 지나면" : " 시간이 지나면"} 잡아둔 수량이 풀립니다.
            </Sub>

            {state.dev_mode ? (
              <Button title="[테스트] 입금 확인 처리" kind="ghost" onPress={devPay} loading={busy}
                style={{ marginTop: 14 }} />
            ) : null}
            <Button title="결제 취소" kind="ghost" onPress={cancel} loading={busy} style={{ marginTop: 8 }} />
          </>
        ) : state.status === "paid" ? (
          <View style={st.waiting}>
            <ActivityIndicator color={C.accent} size="small" />
            <Text style={st.waitText}>결제 확인 완료 · 준비 중</Text>
          </View>
        ) : (
          <>
            <ErrorBox message={
              state.status === "expired" ? "결제 시간이 지나 주문이 취소됐어요. 다시 시도해주세요."
                : state.status === "cancelled" ? "취소된 주문이에요."
                : state.fail_reason
                  ? "결제는 확인됐지만 상품 확정에 실패했어요. 환불 요청이 접수됐습니다."
                  : "처리할 수 없는 주문이에요."} />
            <Button title="닫기" onPress={onClose} style={{ marginTop: 14 }} />
          </>
        )}

        {err && !closed ? <ErrorBox message={err} /> : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.surface,
    borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: 20, paddingBottom: 34,
    borderTopWidth: 1, borderTopColor: C.line },
  handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: C.n600, alignSelf: "center", marginBottom: 18 },
  eyebrow: { ...T, color: C.n600, fontSize: 9.5, fontWeight: "500", letterSpacing: 1.4 },
  title: { ...T, color: C.n300, fontSize: 13, marginTop: 7 },
  amount: { ...NUM, color: C.text, fontSize: 26, fontWeight: "600", marginTop: 2, letterSpacing: -0.5 },

  uidBox: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18, padding: 14,
    borderRadius: R.md, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.panelDeep },
  uidLabel: { ...T, color: C.n600, fontSize: 9.5, letterSpacing: 1.2 },
  uid: { ...MONO, color: C.text, fontSize: 20, fontWeight: "600", letterSpacing: 2.5, marginTop: 4 },
  copy: { ...T, color: C.n300, fontSize: 12, fontWeight: "500" },

  info: { marginTop: 14, padding: 14, borderRadius: R.md, backgroundColor: C.panelDeep },
  infoLabel: { ...T, color: C.n600, fontSize: 9.5, letterSpacing: 1.2 },
  infoValue: { ...MONO, color: C.text, fontSize: 14, marginTop: 5 },

  waiting: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20, marginBottom: 10 },
  waitText: { ...T, color: C.n300, fontSize: 12.5, flex: 1 },
  timer: { ...NUM, color: C.n400, fontSize: 12.5 },
});
