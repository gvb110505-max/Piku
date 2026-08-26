// 흑백 팔레트. 색은 전부 여기서만 정의한다 — 화면/컴포넌트에 하드코딩 금지.
// 강조는 색상 대신 명도와 흰색 채움으로 준다.
export const C = {
  bg: "#0A0A0A",          // 화면 바탕
  surface: "#151515",     // 카드·필드
  panel: "#1C1C1C",       // 히어로/패널 카드
  panelDeep: "#121212",

  // 헤어라인·트랙 — 전부 흰색 알파
  line: "rgba(255,255,255,0.10)",
  lineSoft: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.18)",
  track: "rgba(255,255,255,0.08)",
  wash: "rgba(255,255,255,0.06)",   // 카드 위 광택

  text: "#FAFAFA",
  n200: "#E2E2E2",
  n300: "#B6B6B6",
  n400: "#8E8E8E",
  n500: "#6C6C6C",
  n600: "#4D4D4D",

  // 강조 = 흰색. 채움은 알파로만 단계를 준다.
  accent: "#FFFFFF",
  accent200: "#FFFFFF",
  accent300: "#D6D6D6",
  accentFill: "rgba(255,255,255,0.10)",
  accentFillStrong: "rgba(255,255,255,0.16)",

  // 완전 무채색이면 오류를 못 알아본다 → 경고만 최소한의 색을 남긴다
  danger: "#E5A3A3",
  dangerLine: "rgba(229,163,163,0.35)",

  up: "#FAFAFA",
  down: "#6C6C6C",

  artLabel: "rgba(255,255,255,0.40)",
  onAccent: "#0A0A0A",    // 흰 채움 위 글자
} as const;

// 카드 아트 자리표시 그라디언트 — 실제 이미지가 없을 때만 쓴다
export const ART = {
  base: ["#1E1E1E", "#242424", "#2E2E2E"] as const,
  hero: ["#2C2C2C", "#1A1A1A", "#3A3A3A"] as const,
  panel: ["#1C1C1C", "#121212"] as const,
};

export const R = { sm: 6, md: 12, lg: 18, pill: 9999 } as const;

export const won = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "원";
export const pt = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "P";
export const pct = (n: number) => (n * 100).toFixed(2) + "%";

// 등급 강조 — HIT만 흰색으로 띄우고 나머지는 눌러둔다
export const gradeColor = (grade: string) => (grade === "HIT" ? C.text : C.n400);
export const gradeLabel = (grade: string) =>
  ({ HIT: "HIT", rare: "레어", uncommon: "언커먼", common: "커먼" } as Record<string, string>)[grade] || grade;
