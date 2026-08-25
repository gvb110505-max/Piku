// 블랙 + 골드. 관리자 페이지와 같은 팔레트를 쓴다.
export const C = {
  bg: "#0A0A0C",
  card: "#131318",
  cardHi: "#1A1A21",
  line: "#23232B",
  text: "#F5F5F7",
  sub: "#96969E",
  gold: "#F2C558",
  goldDim: "#C8992F",
  green: "#5CFF9D",
  red: "#FF7A7A",
} as const;

export const RARITY: Record<string, { label: string; color: string }> = {
  HIT: { label: "HIT", color: "#F2C558" },
  rare: { label: "RARE", color: "#8AB4FF" },
  uncommon: { label: "UNCOMMON", color: "#7DE3B8" },
  common: { label: "COMMON", color: "#96969E" },
};

export const won = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "원";
export const pt = (n: number | string) => Number(n || 0).toLocaleString("ko-KR") + "P";
export const pct = (n: number) => (n * 100).toFixed(2) + "%";
