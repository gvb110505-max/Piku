// 판매 등록 — 등록 즉시 예상 정산액을 보여준다(수수료를 나중에 알게 되면 분쟁이 된다).
import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, H2, Sub, Card, Button, Field, ErrorBox, Row, Pill } from "@/components/ui";
import { Api, ApiError } from "@/lib/api";
import { C, won } from "@/lib/theme";

export default function Sell() {
  const router = useRouter();
  const [kind, setKind] = useState<"single" | "box">("single");
  const [title, setTitle] = useState("");
  const [cardSet, setCardSet] = useState("");
  const [grade, setGrade] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [policy, setPolicy] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { Api.policy().then(setPolicy).catch(() => {}); }, []);

  const p = Number(price.replace(/[^0-9]/g, "")) || 0;
  const feeRate = policy?.fee_rate ?? 0.08;
  const inspFee = policy?.inspection_fee ?? 0;
  const fee = Math.floor(p * feeRate);
  const payout = p - fee - inspFee;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await Api.createListing({
        kind, title: title.trim(), card_set: cardSet.trim() || null, grade: grade.trim() || null,
        condition: condition.trim() || null, ask_price: p, description: desc.trim() || null,
      });
      router.replace(`/market/${r.id}`);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "등록에 실패했어요."); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <Row style={{ marginTop: 4 }}>
        {(["single", "box"] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)}>
            <View style={{ borderWidth: 1, borderColor: kind === k ? C.accent200 : C.line,
              borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: kind === k ? C.accent200 : C.n500, fontWeight: "700", fontSize: 13 }}>
                {k === "single" ? "싱글 카드" : "미개봉 박스"}
              </Text>
            </View>
          </Pressable>
        ))}
      </Row>

      <Card>
        <Field label="상품명" placeholder="예: 리자몽 VMAX SSR" value={title} onChangeText={setTitle} />
        <Field label="세트 (선택)" placeholder="예: 샤이니스타V" value={cardSet} onChangeText={setCardSet} />
        <Field label="등급 (선택)" placeholder="예: PSA10 / raw" value={grade} onChangeText={setGrade} />
        <Field label="상태 (선택)" placeholder="예: 민트, 미개봉" value={condition} onChangeText={setCondition} />
        <Field label="희망가" placeholder="예: 500000" value={price} onChangeText={setPrice} keyboardType="number-pad" />
        <Field label="설명 (선택)" placeholder="상태, 보관 방법 등" value={desc} onChangeText={setDesc} multiline />
      </Card>

      {p > 0 ? (
        <Card tone="panel">
          <Sub>정산 예정액</Sub>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 }}>
            <Text style={{ color: C.text, fontSize: 32, fontWeight: "500", letterSpacing: -0.6 }}>
              {won(Math.max(0, payout))}
            </Text>
            {inspFee > 0 ? null : <Text style={{ color: C.accent300, fontSize: 12.5 }}>검수비 무료</Text>}
          </Row>
          <View style={{ height: 1, backgroundColor: "rgba(233,233,237,0.10)", marginVertical: 14 }} />
          <View style={{ marginTop: 10, gap: 6 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Sub>판매가</Sub><Text style={{ color: C.text }}>{won(p)}</Text>
            </Row>
            <Row style={{ justifyContent: "space-between" }}>
              <Sub>판매 수수료 ({(feeRate * 100).toFixed(0)}%)</Sub>
              <Text style={{ color: C.danger }}>-{won(fee)}</Text>
            </Row>
            {inspFee > 0 ? (
              <Row style={{ justifyContent: "space-between" }}>
                <Sub>검수비</Sub><Text style={{ color: C.danger }}>-{won(inspFee)}</Text>
              </Row>
            ) : (
              <Row style={{ justifyContent: "space-between" }}>
                <Sub>검수비</Sub><Pill text="무료" tone="accent" />
              </Row>
            )}
          </View>
        </Card>
      ) : null}

      {err ? <ErrorBox message={err} /> : null}

      <Button title="등록하기" onPress={submit} loading={busy}
        disabled={!title.trim() || p < 1000} style={{ marginTop: 16 }} />

      <Card>
        <H2>판매 방법</H2>
        <Sub style={{ marginTop: 8, lineHeight: 20 }}>
          1. 상품이 팔리면 <Text style={{ color: C.accent200 }}>수거 신청</Text>을 눌러 접수번호를 받습니다{"\n"}
          2. 박스 윗면에 접수번호를 유성펜으로 크게 적습니다{"\n"}
          3. 집 앞에 두면 한진택배가 방문 수거합니다 (택배사 접수 불필요, 수거비 Piku 부담){"\n"}
          4. 검수 통과 후 등록하신 계좌로 정산됩니다
        </Sub>
      </Card>
    </Screen>
  );
}
