// 카드 아트 자리표시 — 프로토타입용.
//
// 실제 상품 사진은 관리자(팩·HIT·보장)와 판매자(마켓)가 올린다. 그 전까지
// 모든 칸이 단색 그라디언트라 화면이 비어 보여서, 카드 한 장처럼 읽히는
// 그림을 이름으로부터 만들어 깐다.
//
// 중요 — 여기 그려지는 생물은 전부 우리가 만든 추상 도형이다. 특정 IP의
// 캐릭터·로고·프레임을 베끼지 않는다. 자리표시가 출시 때까지 남더라도
// 남의 상표를 쓰는 일이 없어야 한다.
//
// 같은 이름이면 항상 같은 그림이 나온다(이름 해시 → 부품 선택). 그래서
// 컬렉션에서 같은 카드가 다른 모습으로 보이는 일이 없다.
import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Svg, {
  Defs, LinearGradient, RadialGradient, Stop, Rect, Circle, Ellipse, Path, G, Polygon,
} from "react-native-svg";

// 속성(타입)별 색. 등급과 섞이지 않게 아트 안에서만 쓴다.
const TYPES = [
  { key: "fire", a: "#FF6B35", b: "#7A1F10", glow: "#FFB36B" },
  { key: "water", a: "#3BA3FF", b: "#10305F", glow: "#8FD0FF" },
  { key: "grass", a: "#4CCB6B", b: "#143A22", glow: "#A6F0B4" },
  { key: "electric", a: "#FFD23F", b: "#5A4406", glow: "#FFE98A" },
  { key: "psychic", a: "#B36BFF", b: "#2E1250", glow: "#DDB4FF" },
  { key: "dark", a: "#5C6B8A", b: "#121722", glow: "#9DB0D1" },
] as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// ---- 부품 ----
// 몸통 4종 × 머리 3종 × 뿔·귀 4종 × 꼬리 3종 × 눈 2종 × 배경무늬 3종
function body(i: number, c: string) {
  const o = { fill: c };
  if (i === 0) return <Ellipse cx={50} cy={86} rx={21} ry={23} {...o} />;
  if (i === 1) return <Path d="M50 62c16 0 24 12 24 26 0 13-11 21-24 21s-24-8-24-21c0-14 8-26 24-26z" {...o} />;
  if (i === 2) return <Path d="M31 70h38c3 0 5 3 4 6l-5 30c-1 3-3 5-6 5H38c-3 0-5-2-6-5l-5-30c-1-3 1-6 4-6z" {...o} />;
  return <Path d="M50 61c18 0 26 16 22 32-3 12-11 18-22 18s-19-6-22-18c-4-16 4-32 22-32z" {...o} />;
}
function head(i: number, c: string) {
  const o = { fill: c };
  if (i === 0) return <Circle cx={50} cy={50} r={17} {...o} />;
  if (i === 1) return <Ellipse cx={50} cy={50} rx={19} ry={16} {...o} />;
  return <Path d="M50 33c11 0 19 8 19 18s-8 17-19 17-19-7-19-17 8-18 19-18z" {...o} />;
}
function crown(i: number, c: string) {
  const o = { fill: c };
  if (i === 0) return <G><Polygon points="36,40 30,19 46,33" {...o} /><Polygon points="64,40 70,19 54,33" {...o} /></G>;
  if (i === 1) return <G><Ellipse cx={33} cy={36} rx={8} ry={12} {...o} /><Ellipse cx={67} cy={36} rx={8} ry={12} {...o} /></G>;
  if (i === 2) return <Polygon points="50,18 58,38 42,38" {...o} />;
  return <G><Polygon points="40,36 34,22 48,32" {...o} /><Polygon points="60,36 66,22 52,32" {...o} />
    <Polygon points="50,24 55,37 45,37" {...o} /></G>;
}
function tail(i: number, c: string) {
  const o = { fill: c };
  if (i === 0) return <Path d="M70 92c12 2 18-6 16-16 6 10 2 24-12 25z" {...o} />;
  if (i === 1) return <Path d="M72 96c14-4 16-16 10-24 12 8 10 26-6 31z" {...o} />;
  return <G><Path d="M70 95c10 6 18 2 20-6 2 12-8 18-18 14z" {...o} />
    <Circle cx={88} cy={84} r={5} {...o} /></G>;
}
function eyes(i: number, c: string) {
  if (i === 0) return <G><Circle cx={43} cy={50} r={3.4} fill={c} /><Circle cx={57} cy={50} r={3.4} fill={c} /></G>;
  return <G><Path d="M39 48l8 3-8 3z" fill={c} /><Path d="M61 48l-8 3 8 3z" fill={c} /></G>;
}
function pattern(i: number, c: string) {
  if (i === 0) return (
    <G opacity={0.16}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
        <Polygon key={n} fill={c}
          points={`50,70 ${50 + 70 * Math.cos((n * Math.PI) / 4 - 0.1)},${70 + 70 * Math.sin((n * Math.PI) / 4 - 0.1)} ${50 + 70 * Math.cos((n * Math.PI) / 4 + 0.1)},${70 + 70 * Math.sin((n * Math.PI) / 4 + 0.1)}`} />
      ))}
    </G>
  );
  if (i === 1) return (
    <G opacity={0.14}>
      {[22, 38, 54].map((r, n) => <Circle key={n} cx={50} cy={70} r={r} stroke={c} strokeWidth={2} fill="none" />)}
    </G>
  );
  return (
    <G opacity={0.12}>
      {[-30, 0, 30, 60].map((y, n) => (
        <Rect key={n} x={-20} y={y + 30} width={140} height={7} fill={c}
          transform={`rotate(-24 50 ${y + 33})`} />
      ))}
    </G>
  );
}

export function CardArt({ name, holo, style }: {
  name: string; holo?: boolean; style?: ViewStyle;
}) {
  const h = hash(name || "piku");
  // 부품마다 독립된 해시를 쓴다. 한 해시를 나눠 쓰면 값이 같이 움직여서
  // 이름이 비슷한 카드들이 서로 닮아버린다.
  const pick = (salt: string, n: number) => hash(salt + "|" + (name || "piku")) % n;
  const t = TYPES[pick("type", TYPES.length)];

  // SVG의 id는 문서 전체에서 공유된다. 카드마다 다른 이름을 주지 않으면
  // 두 번째 카드부터 첫 카드의 그라디언트를 가져다 써서 전부 같은 색이 된다.
  const uid = `ca${h.toString(36)}`;
  const BG = `${uid}-bg`, GLOW = `${uid}-glow`, FOIL = `${uid}-foil`;

  // 몸통은 바탕보다 어둡게, 머리는 한 단계 밝게 — 실루엣이 겹쳐도 형태가 읽히게
  const dark = "rgba(10,10,14,0.78)";
  const mid = "rgba(10,10,14,0.64)";

  return (
    <View style={[st.wrap, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={BG} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.a} />
            <Stop offset="1" stopColor={t.b} />
          </LinearGradient>
          <RadialGradient id={GLOW} cx="50%" cy="48%" r="52%">
            <Stop offset="0" stopColor={t.glow} stopOpacity={holo ? 0.75 : 0.45} />
            <Stop offset="1" stopColor={t.glow} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={FOIL} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={holo ? 0.3 : 0.14} />
            <Stop offset="0.62" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={100} height={140} fill={`url(#${BG})`} />
        {pattern(pick("pat", 3), "#FFFFFF")}
        <Rect x={0} y={0} width={100} height={140} fill={`url(#${GLOW})`} />

        {/* 바닥 그림자 — 생물이 떠 보이지 않게 */}
        <Ellipse cx={50} cy={112} rx={26} ry={5} fill="rgba(0,0,0,0.3)" />

        <G>
          {tail(pick("tail", 3), mid)}
          {body(pick("body", 4), dark)}
          {crown(pick("crown", 4), mid)}
          {head(pick("head", 3), dark)}
          {eyes(pick("eye", 2), t.glow)}
        </G>

        {/* 홀로 광택 — HIT만 강하게 */}
        <Rect x={-20} y={0} width={140} height={140} fill={`url(#${FOIL})`} transform="rotate(-18 50 70)" />
      </Svg>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
});
