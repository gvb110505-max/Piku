// 전화번호 인증 로그인. 생년월일은 받지 않는다 — 본인확인(PASS)에서만 들어간다.
import React, { useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen, H1, Sub, Card, Button, Field, ErrorBox, Row } from "@/components/ui";
import { Api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const digits = phone.replace(/[^0-9]/g, "");

  async function send() {
    setErr(null); setBusy(true);
    try {
      const r = await Api.requestCode(digits);
      setSent(true);
      setDevCode(r.dev_code ?? null);   // 개발 모드에서만 내려온다
    } catch (e) { setErr(e instanceof ApiError ? e.message : "요청에 실패했어요."); }
    finally { setBusy(false); }
  }

  async function verify() {
    setErr(null); setBusy(true);
    try {
      const r = await Api.verify(digits, code.trim(), nickname.trim() || undefined);
      await signIn(r.token);
      router.replace("/(tabs)/home");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "인증에 실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <View style={{ marginTop: 60, marginBottom: 8 }}>
        <H1>PIKU</H1>
        <Sub style={{ marginTop: 8 }}>포켓몬 카드 랜덤팩 · 카드 거래</Sub>
      </View>

      <Card>
        <Field
          label="휴대폰 번호"
          placeholder="01012345678"
          value={phone}
          onChangeText={setPhone}
          keyboardType="number-pad"
          maxLength={13}
          editable={!sent}
        />
        {!sent ? (
          <Button title="인증번호 받기" onPress={send} loading={busy}
            disabled={!/^01[0-9]{8,9}$/.test(digits)} style={{ marginTop: 16 }} />
        ) : (
          <>
            <Field label="인증번호" placeholder="6자리" value={code} onChangeText={setCode}
              keyboardType="number-pad" maxLength={6} />
            <Field label="닉네임 (선택)" placeholder="트레이너" value={nickname} onChangeText={setNickname} />
            {devCode ? (
              <Row style={{ marginTop: 10 }}>
                <Text style={{ color: C.accent200, fontSize: 12, fontWeight: "800" }}>개발 모드 인증번호: {devCode}</Text>
              </Row>
            ) : null}
            <Button title="시작하기" onPress={verify} loading={busy}
              disabled={code.trim().length < 4} style={{ marginTop: 16 }} />
            <Button title="번호 다시 입력" kind="ghost" onPress={() => { setSent(false); setCode(""); setDevCode(null); }}
              style={{ marginTop: 8 }} />
          </>
        )}
      </Card>

      {err ? <ErrorBox message={err} /> : null}

      <Sub style={{ marginTop: 20 }}>
        가입 시 1,000P를 드립니다. 결제 한도 해제를 위해서는 본인확인이 필요하며,
        본인확인 전에는 미성년자 기준(1일 10만원)이 적용됩니다.
      </Sub>
    </Screen>
  );
}
