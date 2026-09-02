// pay.js — 링크 결제 (블로그페이 방식)
//
// PG SDK를 앱에 넣지 않는다. 흐름은 항상 이 순서다.
//   1) 서버가 주문번호(uid)를 만들고 결제 링크를 내려준다 → payment_links.pending
//   2) 구매자가 그 링크(또는 무통장)로 결제한다 — 앱 밖에서 벌어지는 일이다
//   3) 입금이 확인되면(웹훅 또는 관리자 대사) 그때 상품이 확정된다
//
// 핵심은 "확정은 입금 확인 시점"이라는 것. 결제 전에 카드를 뽑아두면 안 되고,
// 반대로 결제만 받아놓고 재고가 없으면 실물 환불이 필요해진다. 그래서 pending
// 동안에는 슬롯을 TTL로 예약해 두고, 시간이 지나면 자동으로 풀어준다.
const db = require("./db");

// 사람이 눈으로 대조하는 코드다 — 0/O, 1/I 처럼 헷갈리는 글자를 뺀다.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function code(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

async function getPaySettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const mins = Number(s.pay_hold_minutes ?? 20);
  return {
    provider: String(s.pay_provider || "manual"),
    template: String(s.pay_link_template || ""),
    bank: String(s.pay_bank || ""),
    hold_minutes: Number.isFinite(mins) && mins > 0 ? Math.min(mins, 180) : 20,
    webhook_secret: String(s.pay_webhook_secret || ""),
  };
}

// 결제 링크 템플릿 치환. 금액·주문번호가 URL에 그대로 들어가므로 인코딩해서 넣는다.
function buildPayUrl(template, { uid, amount, title }) {
  if (!template) return null;
  return template
    .replace(/\{uid\}/g, encodeURIComponent(uid))
    .replace(/\{amount\}/g, encodeURIComponent(String(amount)))
    .replace(/\{name\}/g, encodeURIComponent(title || ""))
    .replace(/\{title\}/g, encodeURIComponent(title || ""));
}

// ---- 확정 처리기 등록 ----
// kind별로 "입금이 확인됐을 때 무엇을 만들지"를 각 모듈이 직접 등록한다.
// 처리기는 (c, link) → result 형태이고 반드시 트랜잭션 컨텍스트 안에서 돈다.
const fulfillers = new Map();
function register(kind, fn) { fulfillers.set(kind, fn); }

// ---- 만료 처리 ----
// 정답은 "아직 살아 있는 예약"의 정의 한 줄이다. 청소(UPDATE)가 늦어도
// 이 조건으로 세면 결과가 틀리지 않는다 — 청소는 순전히 정리용이다.
const ALIVE = "status='pending' AND (expires_at IS NULL OR expires_at > ?)";

// 크론이 없는 환경(서버리스)이라 게으르게 쓸어담되, 요청마다 쓰기를 날리지 않도록
// 인스턴스별로 간격을 둔다. 홈 한 번 열 때 UPDATE가 팩 수만큼 나가던 걸 막는다.
const SWEEP_EVERY_MS = 60 * 1000;
let lastSweep = 0;
async function sweepExpired({ force = false } = {}) {
  if (!force && Date.now() - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = Date.now();
  const now = db.NOW();
  await db.run(
    "UPDATE payment_links SET status='expired', closed_at=? WHERE status='pending' AND expires_at IS NOT NULL AND expires_at <= ?",
    [now, now]);
}

// 팩 슬롯 예약 수 — 아직 결제 대기 중이라 남에게 팔면 안 되는 몫.
async function reservedSlots(packId) {
  const r = await db.get(
    `SELECT COUNT(*) AS c FROM payment_links WHERE kind='pack' AND ref_id=? AND ${ALIVE}`,
    [packId, db.NOW()]);
  return Number(r.c || 0);
}

// 여러 팩을 한 번에. 홈 화면처럼 팩이 여러 개일 때 쿼리가 팩 수만큼 늘지 않게 한다.
async function reservedSlotsMany(packIds) {
  const out = new Map(packIds.map((id) => [Number(id), 0]));
  if (!packIds.length) return out;
  const rows = await db.all(
    `SELECT ref_id, COUNT(*) AS c FROM payment_links
     WHERE kind='pack' AND ${ALIVE} GROUP BY ref_id`, [db.NOW()]);
  for (const r of rows) if (out.has(Number(r.ref_id))) out.set(Number(r.ref_id), Number(r.c));
  return out;
}

// 한 사람이 결제창만 열어두고 재고를 묶어두지 못하게 한다.
const MAX_OPEN_PER_USER = 3;

async function createCheckout({ kind, userId, refId, amount, title, payUrlOverride, payload }) {
  await sweepExpired();
  const open = await db.get(
    `SELECT COUNT(*) AS c FROM payment_links WHERE user_id=? AND ${ALIVE}`, [userId, db.NOW()]);
  if (Number(open.c) >= MAX_OPEN_PER_USER) {
    const e = new Error("TOO_MANY_PENDING_PAYMENTS");
    e.status = 429;
    e.message_ko = "결제 대기 중인 주문이 있어요. 먼저 결제하거나 취소해 주세요.";
    throw e;
  }

  const st = await getPaySettings();
  const uid = (kind === "market" ? "MK" : "PK") + code(6);
  // db.NOW()와 같은 형식으로 저장해야 한다 — 만료 판정이 문자열 비교라서.
  const expires = db.AT(Date.now() + st.hold_minutes * 60 * 1000);
  // 팩별 링크가 등록돼 있으면 그걸 쓰고, 없으면 공통 템플릿으로 만든다.
  const payUrl = payUrlOverride || buildPayUrl(st.template, { uid, amount, title });

  const id = await db.insert(
    `INSERT INTO payment_links (uid, kind, user_id, ref_id, title, amount, provider, pay_url, payload,
       status, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`,
    [uid, kind, userId, refId ?? null, title || null, amount, st.provider, payUrl,
     payload ? JSON.stringify(payload) : null, expires, db.NOW()]);

  return { id, uid, kind, title: title || null, amount, provider: st.provider, pay_url: payUrl,
    bank: st.provider === "manual" ? st.bank : "", expires_at: expires, status: "pending" };
}

// 구매자에게 내려보낼 형태. payload는 내부용이라 빼고, 결과 JSON만 풀어준다.
function publicView(row, st) {
  return {
    uid: row.uid, kind: row.kind, title: row.title, amount: row.amount,
    provider: row.provider, pay_url: row.pay_url,
    bank: row.provider === "manual" ? (st ? st.bank : "") : "",
    status: row.status, expires_at: row.expires_at, paid_at: row.paid_at,
    fail_reason: row.fail_reason || null,
    result: row.result ? JSON.parse(row.result) : null,
  };
}

// 조회는 쓰기를 하지 않는다. 청소가 아직 안 돌았어도 만료된 건 만료로 보여준다 —
// DB 상태와 화면이 어긋나지 않게 읽는 쪽에서 판정한다.
async function find(uid) {
  const row = await db.get("SELECT * FROM payment_links WHERE uid=?", [String(uid || "")]);
  if (!row) return null;
  if (row.status === "pending" && row.expires_at && row.expires_at <= db.NOW())
    return { ...row, status: "expired" };
  return row;
}

// ---- 입금 확인 → 확정 ----
// 여기가 돈과 상품이 만나는 유일한 지점이다. pending → paid 전이를 조건부 UPDATE로
// 걸어서, 웹훅과 관리자 대사가 동시에 들어와도 확정은 한 번만 일어나게 한다.
async function settle(uid, { pgKey, payerName, by, guard } = {}) {
  const link = await find(uid);
  if (!link) return { ok: false, error: "PAYMENT_NOT_FOUND", status: 404 };
  if (link.status === "paid")
    return { ok: true, already: true, link, result: link.result ? JSON.parse(link.result) : null };
  // 만료됐어도 확정은 받는다 — 만료는 "슬롯을 더 잡아두지 않는다"는 뜻이지
  // "들어온 돈을 무시한다"는 뜻이 아니다. 재고가 정말 없으면 아래 확정 처리기가
  // SOLD_OUT으로 막고 환불 요청이 자동 접수된다.
  if (link.status !== "pending" && link.status !== "expired")
    return { ok: false, error: "PAYMENT_NOT_PENDING", status: 409, state: link.status };

  // 확정 직전 마지막 검사(예: 미성년자 한도). 통과 못 하면 결제를 확정하지 않는다.
  if (guard) {
    const blocked = await guard(link);
    if (blocked) return { ok: false, error: "PAYMENT_BLOCKED", status: 403, detail: blocked };
  }

  const fulfill = fulfillers.get(link.kind);
  if (!fulfill) return { ok: false, error: "NO_FULFILLER", status: 500 };

  // 선점 — 이 UPDATE에 성공한 호출만 상품을 만든다.
  const claim = await db.run(
    `UPDATE payment_links SET status='paid', paid_at=?, pg_key=?, payer_name=?, confirmed_by=?
     WHERE uid=? AND status IN ('pending','expired')`,
    [db.NOW(), pgKey || null, payerName || null, by || "admin", link.uid]);
  if (!claim.changes) {
    const again = await find(uid);
    return { ok: true, already: true, link: again, result: again && again.result ? JSON.parse(again.result) : null };
  }

  // 선점 UPDATE로 방금 채워진 값들을 확정 처리기도 봐야 한다 (거래번호는 환불 대조 키다)
  const paid = { ...link, status: "paid", pg_key: pgKey || null, payer_name: payerName || null };
  try {
    const result = await db.tx((c) => fulfill(c, paid));
    await db.run("UPDATE payment_links SET result=? WHERE uid=?", [JSON.stringify(result), link.uid]);
    return { ok: true, link: paid, result };
  } catch (e) {
    // 입금은 들어왔는데 상품을 못 만든 상태. 임의로 pending으로 되돌리면 이중 확정이
    // 나므로 failed로 못 박고 환불 원장을 남긴다 — 사람이 처리해야 하는 건이다.
    await db.run("UPDATE payment_links SET status='failed', fail_reason=?, closed_at=? WHERE uid=?",
      [String(e.message || e), db.NOW(), link.uid]);
    await db.insert(
      `INSERT INTO refunds (kind, order_ref, pg_key, amount, reason, status, created_at)
       VALUES (?,?,?,?,?, 'requested', ?)`,
      [link.kind, link.uid, pgKey || null, link.amount, "확정 실패 자동 환불 요청: " + e.message, db.NOW()]);
    return { ok: false, error: e.message, status: 409, refund_requested: true };
  }
}

async function cancel(uid, userId) {
  const link = await find(uid);
  if (!link) return { ok: false, error: "PAYMENT_NOT_FOUND", status: 404 };
  if (userId != null && Number(link.user_id) !== Number(userId))
    return { ok: false, error: "FORBIDDEN", status: 403 };
  if (link.status !== "pending" && link.status !== "expired")
    return { ok: false, error: "PAYMENT_NOT_PENDING", status: 409, state: link.status };
  await db.run(
    `UPDATE payment_links SET status='cancelled', closed_at=? WHERE uid=? AND status IN ('pending','expired')`,
    [db.NOW(), uid]);
  return { ok: true };
}

module.exports = { getPaySettings, buildPayUrl, register, createCheckout, find, publicView,
  settle, cancel, sweepExpired, reservedSlots, reservedSlotsMany, code };
