// Piku API 클라이언트.
// 서버는 응답이 JSON이 아닐 수 있으므로(플랫폼 오류 페이지 등) 항상 text로 받아 직접 파싱한다.
// 그래야 "알 수 없는 오류" 대신 상태코드와 본문이 그대로 드러난다.
import Constants from "expo-constants";

const FALLBACK = "https://piku-ry77.vercel.app";
export const BASE_URL: string =
  (Constants.expoConfig?.extra as any)?.apiUrl || process.env.EXPO_PUBLIC_API_URL || FALLBACK;

let TOKEN: string | null = null;
export function setToken(t: string | null) { TOKEN = t; }
export function getToken() { return TOKEN; }

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.code = data?.error;
    this.data = data;
  }
}

type Opts = { method?: "GET" | "POST"; body?: unknown; auth?: boolean };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = opts.body ? "POST" : "GET", body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth && TOKEN) headers.Authorization = TOKEN;

  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    throw new ApiError("서버에 연결하지 못했어요. 네트워크를 확인해주세요.", 0);
  }

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {
    throw new ApiError(`서버 응답을 읽지 못했어요 (HTTP ${res.status})`, res.status, { raw: text.slice(0, 200) });
  }
  if (!res.ok) throw new ApiError(messageOf(data) || `요청 실패 (HTTP ${res.status})`, res.status, data);
  return data as T;
}

// 서버 에러 코드를 사용자 문구로 옮긴다
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "로그인이 필요해요.",
  INVALID_PHONE: "휴대폰 번호를 다시 확인해주세요.",
  INVALID_CODE: "인증번호가 맞지 않거나 만료됐어요.",
  WELCOME_ALREADY_USED: "웰컴팩은 계정당 한 번만 열 수 있어요.",
  NOT_ENOUGH_POINTS: "포인트가 부족해요.",
  SOLD_OUT: "방금 매진됐어요.",
  TOO_MANY_PENDING_PAYMENTS: "결제 대기 중인 주문이 있어요. 먼저 결제하거나 취소해 주세요.",
  LISTING_HELD: "다른 분이 결제 중이에요. 잠시 후 다시 시도해 주세요.",
  PAYMENT_NOT_FOUND: "결제 정보를 찾지 못했어요.",
  PAYMENT_NOT_PENDING: "이미 처리된 결제예요.",
  DEV_CONFIRM_DISABLED: "테스트 결제는 사용할 수 없어요.",
  PACK_INACTIVE: "지금은 판매하지 않는 팩이에요.",
  AMOUNT_MISMATCH: "가격 정보가 바뀌었어요. 새로고침해주세요.",
  LISTING_UNAVAILABLE: "다른 분이 먼저 구매했어요.",
  SELF_PURCHASE: "본인 상품은 구매할 수 없어요.",
  MARKET_DISABLED: "마켓이 일시 중단됐어요.",
  BAD_PRICE: "1,000원 ~ 50,000,000원 사이로 등록해주세요.",
  PICKUP_INFO_REQUIRED: "수거 주소와 연락처를 입력해주세요.",
  ADDRESS_REQUIRED: "받는 주소를 입력해주세요.",
  CARD_NOT_FOUND: "이미 처리된 카드예요.",
};
function messageOf(d: any): string | null {
  if (!d) return null;
  if (d.error === "DAILY_LIMIT_MINOR") {
    return d.message || `미성년자는 하루 ${Number(d.limit).toLocaleString("ko-KR")}원까지 결제할 수 있어요.`;
  }
  if (d.error && MESSAGES[d.error]) return MESSAGES[d.error];
  return d.message || d.error || null;
}

// ---------- 타입 ----------
export type Pack = {
  id: number; name: string; price: number; list_price: number | null; point_price: number; is_welcome: boolean;
  image: string; total_slots: number; sold_slots: number; remaining_slots: number;
  sold_out: boolean; active: boolean; reserved_slots?: number; available_slots?: number;
};
export type Hit = { id: number; name: string; image: string; total_qty: number; remaining: number; point_value: number; probability: number };
export type Guaranteed = { id: number; slot_no: number; name: string; image: string;
  point_value: number; kind: "guaranteed" | "last_one"; awarded: boolean; next: boolean };
// last_one = 마지막 1구를 여는 사람이 받는 상품. 보장 목록과 따로 온다.
// 일반 카드도 개별 확률과 함께 온다 — 구성 상품 목록에 이미지로 같이 깔기 위해서다.
export type PoolCard = { id: number; name: string; rarity: string; image: string;
  weight: number; probability: number };
export type Odds = { pack: Pack; hits: Hit[]; point_probability: number; point_remaining: number;
  pool: PoolCard[]; guaranteed: Guaranteed[]; last_one: Guaranteed | null; viewers?: number };
// ---------- 링크 결제 ----------
// 앱은 결제를 직접 처리하지 않는다. 서버가 발급한 주문번호(uid)와 결제 링크를 받아
// 링크를 열어주고, 입금이 확인될 때까지 상태만 지켜본다.
export type PayStatus = "pending" | "paid" | "expired" | "cancelled" | "failed";
export type Checkout = {
  uid: string; kind: "pack" | "market"; title?: string | null; amount: number;
  provider: "manual" | "link" | "dev"; pay_url: string | null; bank: string;
  status: PayStatus; expires_at: string | null; paid_at?: string | null;
  fail_reason?: string | null; dev_mode?: boolean;
  result?: { order_id: number; result?: DrawResult; order_uid?: string; status?: string } | null;
};
export type DrawResult = { grade: string; name: string; image: string; point_value: number; card_id: number; draw_no: number;
  bonus: { name: string; slot_no: number; point_value: number; kind?: "guaranteed" | "last_one" } | null };
export type OwnedCard = { id: number; name: string; grade: string; image: string; point_value: number; status: string; pack_name: string; created_at: string };
export type Listing = { id: number; seller_id: number; seller_nickname?: string; kind: string; title: string;
  card_set: string | null; grade: string | null; condition: string | null; product_key: string;
  images: string[]; ask_price: number; description: string | null; status: string; created_at: string };
export type Quote = { item_price: number; fee_rate: number; fee_amount: number; inspection_fee: number;
  shipping_fee: number; buyer_total: number; payout_amount: number };
export type MarketOrder = { id: number; order_uid: string; listing_id: number; title: string; item_price: number;
  buyer_total: number; payout_amount: number; status: string; buyer_address: string | null;
  out_tracking: string | null; fail_reason: string | null; created_at: string;
  seller_nickname?: string; buyer_nickname?: string; inbound?: Inbound | null };
export type Inbound = { id: number; inbound_code: string; status: string; pickup_address: string; pickup_date: string | null };
// 홈 상단 티커용 실시간 HIT 피드. 닉네임은 서버에서 마스킹돼 온다.
export type RecentHit = { id: number; name: string; point_value: number; pack_name: string;
  nickname: string; created_at: string };

// 이미지 값은 두 종류가 섞여 있다 — 관리자가 올린 "/images/12" 또는 외부 URL,
// 그리고 시드 데이터에 남아 있는 "pack_5000" 같은 옛 키. 앞의 것만 실제로 그린다.
export function imageUrl(v?: string | null): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return BASE_URL + s;
  return null;   // 옛 키 → 자리표시 그라디언트를 쓴다
}

// ---------- 엔드포인트 ----------
export const Api = {
  requestCode: (phone: string) => api<{ ok: boolean; dev_code?: string }>("/auth/request-code", { body: { phone }, auth: false }),
  verify: (phone: string, code: string, nickname?: string) =>
    api<{ token: string; is_new: boolean; user: any }>("/auth/verify", { body: { phone, code, nickname }, auth: false }),

  packs: () => api<Odds[]>("/packs", { auth: false }),
  pack: (id: number) => api<Odds>(`/packs/${id}`, { auth: false }),
  recentHits: (limit = 20) => api<RecentHit[]>(`/packs/recent-hits?limit=${limit}`, { auth: false }),

  // 결제 링크 발급 — 이 시점에는 아무것도 뽑히지 않는다. 슬롯만 잠시 잡아둔다.
  checkout: (pack_id: number, amount: number) => api<Checkout>("/checkout", { body: { pack_id, amount } }),
  checkoutStatus: (uid: string) => api<Checkout>(`/checkout/${uid}`),
  cancelCheckout: (uid: string) => api(`/checkout/${uid}/cancel`, { body: {} }),
  confirmDev: (uid: string) => api<Checkout>(`/checkout/${uid}/confirm-dev`, { body: {} }),
  welcome: () => api<{ result: DrawResult }>("/purchase/welcome", { body: {} }),

  me: () => api<any>("/me"),
  identity: () => api<{ verified: boolean; is_minor: boolean; provider?: string; daily_limit: number | null; dev_mode: boolean }>("/identity/status"),
  devVerify: (birth: string) => api("/identity/dev-verify", { body: { birth } }),

  exchange: (cardId: number) => api<{ points_added: number }>(`/cards/${cardId}/exchange`, { body: {} }),
  ship: (card_ids: number[], address: string) => api<{ shipment_id: number; fee: number }>("/shipments", { body: { card_ids, address } }),

  // 마켓
  listings: (q?: { q?: string; kind?: string; sort?: string }) => {
    const p = new URLSearchParams();
    if (q?.q) p.set("q", q.q);
    if (q?.kind) p.set("kind", q.kind);
    if (q?.sort) p.set("sort", q.sort);
    const s = p.toString();
    return api<{ items: Listing[] }>("/market/listings" + (s ? "?" + s : ""), { auth: false });
  },
  listing: (id: number) => api<{ listing: Listing; quote: Quote }>(`/market/listings/${id}`, { auth: false }),
  createListing: (b: Record<string, unknown>) => api<{ id: number; quote: Quote }>("/market/listings", { body: b }),
  cancelListing: (id: number) => api(`/market/listings/${id}/cancel`, { body: {} }),
  quotes: (productKey: string) => api<any>(`/market/quotes?product_key=${encodeURIComponent(productKey)}`, { auth: false }),
  buy: (listing_id: number, address: string, amount: number) =>
    api<Checkout & Quote & { notice: string }>("/market/orders", { body: { listing_id, address, amount } }),
  myTrades: () => api<{ bought: MarketOrder[]; sold: MarketOrder[]; listings: Listing[] }>("/market/orders/mine"),
  pickup: (orderId: number, b: { pickup_address: string; pickup_phone: string; pickup_date?: string }) =>
    api<{ inbound_code: string; steps: string[]; warning: string; carrier: string }>(`/market/orders/${orderId}/pickup`, { body: b }),
  sellerProfile: () => api<any>("/market/seller-profile"),
  saveSellerProfile: (b: Record<string, unknown>) => api("/market/seller-profile", { body: b }),
  policy: () => api<any>("/market/policy", { auth: false }),
};
