// Piku 팔레트.
//
// 바탕은 계속 검정이다. 검정 위에서만 채도가 제대로 살고, 카드 이미지도 검정 위에서 가장 잘 뜬다.
// 색은 장식으로 뿌리지 않고 "의미가 있는 자리"에만 넣는다.
//   brand  — 살 수 있는 것(CTA·활성 상태·가격)
//   등급색 — HIT/레어/언커먼/커먼. 카드 프레임·칩·값에 그대로 쓴다
//   상태색 — 성공/경고
// 팩마다 고유 색(packHue)을 하나씩 배정해서, 이미지가 아직 없어도 화면이 회색으로만 남지 않게 한다.
import { Platform, TextStyle } from "react-native";

export const C = {
  bg: "#08080A",          // 화면 바탕
  surface: "#141418",     // 카드·필드
  panel: "#1B1B21",       // 히어로/패널
  panelDeep: "#101014",

  line: "rgba(255,255,255,0.10)",
  lineSoft: "rgba(255,255,255,0.06)",
  lineStrong: "rgba(255,255,255,0.18)",
  track: "rgba(255,255,255,0.08)",
  wash: "rgba(255,255,255,0.06)",

  text: "#FAFAFA",
  n200: "#E4E4E8",
  n300: "#B4B4BE",
  n400: "#8B8B96",
  n500: "#6A6A75",
  n600: "#4A4A55",

  // 브랜드 — 버밀리언. 결제·개봉처럼 "지금 누르는 것"에만 쓴다.
  brand: "#FF5A3C",
  brandSoft: "rgba(255,90,60,0.15)",
  brandLine: "rgba(255,90,60,0.42)",
  brand2: "#FF9F1C",      // 그라디언트 짝 (브랜드 → 앰버)
  onBrand: "#150703",     // 브랜드 채움 위 글자

  // 등급 — 값이 아니라 종류를 나타내는 색이라 서로 확실히 구분되게 잡았다
  hit: "#FFC148",
  hitSoft: "rgba(255,193,72,0.16)",
  rare: "#A472FF",
  rareSoft: "rgba(164,114,255,0.16)",
  uncommon: "#2ED3B7",
  uncommonSoft: "rgba(46,211,183,0.16)",
  common: "#7C8AB8",
  commonSoft: "rgba(124,138,184,0.16)",

  // 상태
  up: "#39D98A",
  danger: "#FF5470",
  dangerLine: "rgba(255,84,112,0.38)",
  dangerSoft: "rgba(255,84,112,0.14)",

  // 예전 이름 유지 — 화면 곳곳에서 쓰고 있어서 한 번에 바꾸지 않는다
  accent: "#FF5A3C",
  accent200: "#FF8A6B",
  accent300: "#FFB39C",
  accentFill: "rgba(255,90,60,0.15)",
  accentFillStrong: "rgba(255,90,60,0.24)",
  gold: "#FFC148",
  goldDim: "rgba(255,193,72,0.45)",
  down: "#6A6A75",
  artLabel: "rgba(255,255,255,0.42)",
  onAccent: "#150703",
} as const;

// 팩·상품 자리표시용 색. id로 고정되니 새로고침해도 같은 팩은 같은 색이다.
const HUES: readonly (readonly [string, string])[] = [
  ["#FF5A3C", "#FF9F1C"],   // 버밀리언 → 앰버
  ["#7B5CFF", "#C86BFF"],   // 바이올렛 → 퍼플
  ["#1FB6FF", "#2ED3B7"],   // 시안 → 틸
  ["#FF3D77", "#FF7A45"],   // 마젠타 → 코랄
  ["#38C172", "#A8E063"],   // 그린 → 라임
  ["#FFB020", "#FF6B6B"],   // 골드 → 레드
];
export const packHue = (id: number) => HUES[Math.abs(id) % HUES.length];

export const gradeColor = (grade: string) =>
  ({ HIT: C.hit, rare: C.rare, uncommon: C.uncommon, common: C.common } as Record<string, string>)[grade] || C.common;
export const gradeSoft = (grade: string) =>
  ({ HIT: C.hitSoft, rare: C.rareSoft, uncommon: C.uncommonSoft, common: C.commonSoft } as Record<string, string>)[grade] || C.commonSoft;
export const gradeLabel = (grade: string) =>
  ({ HIT: "HIT", rare: "레어", uncommon: "언커먼", common: "커먼" } as Record<string, string>)[grade] || grade;

export const ART = {
  base: ["#1E1E24", "#242430", "#2E2E3A"] as const,
  hero: ["#2C2C38", "#1A1A22", "#3A3A48"] as const,
  panel: ["#1B1B21", "#101014"] as const,
};

export const R = { sm: 8, md: 14, lg: 20, pill: 9999 } as const;

// 본문 서체. 웹 기본 스택이 환경에 따라 굴림으로 떨어져서 지저분해 보이므로 고정한다.
export const FONT = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Segoe UI', Roboto, sans-serif",
}) as string;
export const T: TextStyle = { fontFamily: FONT };

// 숫자는 등폭으로. 값이 바뀔 때 자릿수가 흔들리면 살아 있는 수치로 읽히지 않는다.
export const NUM: TextStyle = { fontFamily: FONT, fontVariant: ["tabular-nums"] };
// 주문번호처럼 사람이 그대로 옮겨 적는 문자열
export const MONO: TextStyle = {
  fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }),
};

export const won = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "원";
export const pt = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "P";
export const pct = (n: number) => (n * 100).toFixed(2) + "%";
