// nocturne — 딥 인디고 베이스에 바이올렛 액센트.
// 값은 디자인 시스템에서 그대로 가져왔다. 바꿀 때는 시안(Claude Design)과 함께 움직일 것.
export const C = {
  bg: "#161826",          // 화면 바탕
  surface: "#1E2032",     // 카드·필드
  line: "rgba(233,233,237,0.10)",
  lineSoft: "rgba(233,233,237,0.07)",
  text: "#E9E9ED",
  n200: "#D6D6DE",
  n300: "#B0B0BD",
  n400: "#8B8B9B",
  n500: "#6B6B7C",
  n600: "#53535F",
  accent: "#9184D9",
  accent200: "#C4BCF0",
  accent300: "#AFA4E6",
  accentFill: "rgba(145,132,217,0.14)",
  accentFillStrong: "rgba(145,132,217,0.16)",
  danger: "#E08C8C",
  up: "#AFA4E6",      // 상승·적립 (디자인 시스템은 액센트를 씀)
  down: "#6B6B7C",    // 하락·차감
} as const;

// 카드 아트 자리표시 — 실제 스캔이 붙기 전까지 이 그라디언트를 쓴다
export const ART = {
  base: ["#2b2741", "#292b31", "#423a6a"] as const,
  hero: ["#3a3462", "#262838", "#423a6a"] as const,
  panel: ["#262a60", "#232532"] as const,
};

export const R = { sm: 6, md: 12, lg: 18, pill: 9999 } as const;

export const won = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "원";
export const pt = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "P";
export const pct = (n: number) => (n * 100).toFixed(2) + "%";

// 등급별 강조 — HIT만 액센트를 쓰고 나머지는 뉴트럴로 눌러둔다
export const gradeColor = (grade: string) => (grade === "HIT" ? C.accent200 : C.n300);
export const gradeLabel = (grade: string) =>
  ({ HIT: "HIT", rare: "레어", uncommon: "언커먼", common: "커먼" } as Record<string, string>)[grade] || grade;
