// index.js — API 서버 (Express, async, Vercel 서버리스 호환)
//   로컬: node index.js → :4000 리슨
//   Vercel: api/index.js가 이 app을 export (리슨 안 함), 세션은 tokens 테이블(DB) 저장
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { getOdds, draw } = require("./gacha");
const pay = require("./pay");
const catalog = require("./catalog");

const app = express();

// CORS — Expo 웹/개발 서버는 다른 오리진에서 호출한다. 인증은 쿠키가 아니라
// Authorization 헤더 토큰이라 credentials를 켜지 않으며, 따라서 CSRF 위험이 없다.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-token");
  res.set("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.sendStatus(204); // preflight
  next();
});

// 예전 배포 구조(api/[...path].js)로 들어오던 /api 접두사를 흡수한다.
// 이제 모든 요청이 이 파일 하나로 들어오므로 라우팅은 전부 Express가 담당한다.
app.use((req, res, next) => {
  if (req.url === "/api" || req.url === "/api/") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  else if (req.url.startsWith("/api?")) req.url = "/" + req.url.slice(4);
  next();
});
// 이미지는 base64로 들어오므로 기본 100kb 제한으로는 부족하다.
// 관리자 화면에서 업로드 전에 리사이즈하지만, 서버에서도 상한을 다시 건다.
app.use(express.json({ limit: "8mb" }));
// DB 미설정이면 500 크래시 대신 원인을 알려준다
app.use((req, res, next) => {
  if (!db.ready) {
    if (req.path === "/health") return next(); // /health는 통과시켜 원인을 알려준다
    return res.status(503).json({ error: "DB_NOT_CONFIGURED",
      message: "DATABASE_URL이 설정되지 않았습니다. Vercel → Storage에서 Postgres를 연결한 뒤 재배포하세요." });
  }
  db.init().then(() => next()).catch(next);
});

// 링크 결제(블로그페이 방식) — PG SDK를 앱에 넣지 않는다. PAY_MODE=live 이거나
// 결제 링크/계좌가 설정돼 있으면 운영 모드로 보고, 개발용 자동승인 경로를 닫는다.
const PAY_DEV_MODE = process.env.PAY_MODE !== "live";
// 환경변수에 붙어 들어오는 앞뒤 공백/개행(붙여넣기 사고)을 제거 — 이것 때문에 403이 나는 경우가 많다
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "dev-admin").trim();
const BUILD = "2026-08-26.1"; // 관리자 페이지 캐시 확인용 빌드 스탬프
const MINOR_DAILY_LIMIT = 100000; // 만 19세 미만 일 결제 한도

async function auth(req, res, next) {
  try {
    const t = await db.get("SELECT user_id FROM tokens WHERE token=?", [req.headers.authorization || ""]);
    if (!t) return res.status(401).json({ error: "UNAUTHORIZED" });
    req.userId = t.user_id;
    next();
  } catch (e) { next(e); }
}
// 관리자 토큰 추출 — 헤더 / 쿼리 / Authorization / 바디 전부 허용.
// 브라우저·프록시·플랫폼마다 막히는 경로가 달라서 한 가지만 쓰면 원인을 못 찾는다.
function adminTokenOf(req) {
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const raw = req.headers["x-admin-token"] || (req.query && req.query.token) ||
    (req.body && req.body.admin_token) || bearer || "";
  return String(raw).trim();
}
function admin(req, res, next) {
  if (adminTokenOf(req) !== ADMIN_TOKEN) return res.status(403).json({ error: "FORBIDDEN" });
  next();
}
const h = (fn) => (req, res, next) => fn(req, res).catch(next); // async 핸들러 래퍼

function isMinor(birth) {
  if (!birth) return true; // 미확인 시 보수적으로 미성년 취급
  const y = +birth.slice(0, 4), m = +birth.slice(4, 6), d = +birth.slice(6, 8);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age < 19; // 민법상 성년 = 만 19세
}
// 오늘 결제액 — 랜덤팩(orders)과 마켓 구매(market_orders)를 합산한다.
// 합산하지 않으면 마켓이 미성년자 한도 우회 경로가 된다.
const PASS_CONFIGURED = !!(process.env.PASS_CLIENT_ID && process.env.PASS_CLIENT_SECRET);
// 개발용 자가 본인확인은 결제도 PASS도 붙지 않은 로컬 환경에서만 열린다.
// 운영(PAY_MODE=live 또는 PASS 설정)에서는 자동으로 닫힌다.
const ALLOW_DEV_IDENTITY = process.env.ALLOW_DEV_IDENTITY === "1"
  || (process.env.ALLOW_DEV_IDENTITY !== "0" && PAY_DEV_MODE && !PASS_CONFIGURED);

async function identityRequired() {
  const r = await db.get("SELECT value FROM settings WHERE key='identity_required'");
  return String(r ? r.value : "0") === "1";
}

// 나이 판정. 인증 기록이 있으면 그 생년월일만 쓴다.
// 미인증이면 — 강제 모드에서는 미성년자로 간주(보수적), 유예 모드에서는 기존 저장값을 인정한다.
async function ageStatus(userId) {
  const v = await db.get(
    "SELECT birth, provider, verified_at FROM identity_verifications WHERE user_id=? ORDER BY id DESC LIMIT 1",
    [userId]);
  if (v) return { verified: true, provider: v.provider, verified_at: v.verified_at, is_minor: isMinor(v.birth) };
  if (await identityRequired()) return { verified: false, is_minor: true, reason: "IDENTITY_REQUIRED" };
  const u = await db.get("SELECT birth FROM users WHERE id=?", [userId]);
  return { verified: false, is_minor: isMinor(u && u.birth), legacy: true };
}

async function todaySpent(userId) {
  const [pack, market] = await Promise.all([
    db.get("SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE user_id=? AND status='paid' AND substr(created_at,1,10)=?",
      [userId, db.TODAY()]),
    db.get(`SELECT COALESCE(SUM(buyer_total),0) AS s FROM market_orders
            WHERE buyer_id=? AND status NOT IN ('refunded') AND substr(created_at,1,10)=?`,
      [userId, db.TODAY()]),
  ]);
  return Number(pack.s) + Number(market.s);
}

// 결제 전 한도 검사. 차단해야 하면 응답 바디를 돌려주고, 통과면 null.
async function assertPaymentAllowed(userId, amount) {
  const age = await ageStatus(userId);
  if (!age.is_minor) return null;
  const spent = await todaySpent(userId);
  if (spent + amount <= MINOR_DAILY_LIMIT) return null;
  return { error: "DAILY_LIMIT_MINOR", limit: MINOR_DAILY_LIMIT, spent,
    remaining: Math.max(0, MINOR_DAILY_LIMIT - spent),
    verified: age.verified,
    message: age.verified ? "만 19세 미만은 하루 10만원까지 결제할 수 있습니다."
      : "본인확인을 완료해야 결제 한도가 해제됩니다." };
}

// 환불. 링크 결제는 돈이 앱 밖에서 오간 것이라 API로 되돌릴 수 없다 —
// 원장에 'requested'로 남기고, 관리자가 제공자 화면에서 실제 환불한 뒤 done으로 닫는다.
// 주문 상태(거래가 무효가 됐는가)와 원장 상태(돈이 실제로 나갔는가)는 별개로 본다.
async function cancelPayment({ kind, orderId, orderRef, pgKey, amount, reason }) {
  const rid = await db.insert(
    `INSERT INTO refunds (kind, order_id, order_ref, pg_key, amount, reason, status, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [kind, orderId || null, orderRef || null, pgKey || null, amount, reason || null,
     PAY_DEV_MODE ? "done" : "requested", db.NOW()]);
  if (PAY_DEV_MODE) {
    await db.run("UPDATE refunds SET pg_response=?, done_at=? WHERE id=?", ["DEV_MODE", db.NOW(), rid]);
    return { ok: true, refund_id: rid, dev: true };
  }
  return { ok: true, refund_id: rid, manual: true,
    message: "환불 요청이 접수되었습니다. 영업일 기준 1~3일 내에 결제하신 수단으로 돌려드립니다." };
}

app.get(["/", "/health"], (req, res) => {
  if (!db.ready) return res.status(503).json({ ok: false, configured: false,
    message: "DATABASE_URL이 설정되지 않았습니다. Vercel → Storage에서 Postgres를 연결한 뒤 재배포하세요." });
  res.json({ ok: true, configured: true, driver: db.usePg ? "postgres" : "sqlite",
    persistent: db.usePg, note: db.usePg ? undefined : "SQLite 로컬 모드" });
});

// ---------- 인증 (전화번호 본인인증) ----------
// 운영 전환: PASS(또는 SMS API) 연동으로 교체. birth는 PASS 결과에서 수신(자기 입력 아님).
app.post("/auth/request-code", h(async (req, res) => {
  const { phone } = req.body;
  if (!/^01[0-9]{8,9}$/.test(phone || "")) return res.status(400).json({ error: "INVALID_PHONE" });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.run(
    "INSERT INTO phone_codes (phone, code, expires_at) VALUES (?,?,?) ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at",
    [phone, code, Date.now() + 3 * 60 * 1000]);
  console.log(`[SMS 테스트모드] ${phone} 인증번호: ${code}`);
  res.json({ ok: true, dev_code: PAY_DEV_MODE ? code : undefined });
}));

app.post("/auth/verify", h(async (req, res) => {
  const { phone, code, nickname } = req.body;
  const row = await db.get("SELECT * FROM phone_codes WHERE phone=?", [phone]);
  if (!row || row.code !== code || Number(row.expires_at) < Date.now())
    return res.status(400).json({ error: "INVALID_CODE" });
  // 생년월일은 더 이상 클라이언트에서 받지 않는다. 자기 입력을 믿으면 미성년자 한도가 그대로 뚫린다.
  // 신규 가입자는 birth=NULL로 시작해 미성년자 한도가 적용되고, 본인확인을 마쳐야 해제된다.
  await db.run("DELETE FROM phone_codes WHERE phone=?", [phone]);

  let user = await db.get("SELECT * FROM users WHERE phone=?", [phone]); // 전화번호 = 중복가입 방지 키
  let isNew = false;
  if (!user) {
    isNew = true;
    const id = await db.insert("INSERT INTO users (phone, nickname, birth, points, created_at) VALUES (?,?,NULL,1000,?)",
      [phone, nickname || "트레이너", db.NOW()]);
    await db.run("INSERT INTO point_logs (user_id, delta, reason, created_at) VALUES (?,1000,'신규가입 보너스',?)", [id, db.NOW()]);
    user = await db.get("SELECT * FROM users WHERE id=?", [id]);
  }
  const token = crypto.randomBytes(24).toString("hex");
  await db.run("INSERT INTO tokens (token, user_id, created_at) VALUES (?,?,?)", [token, user.id, db.NOW()]);
  const age = await ageStatus(user.id);
  res.json({ token, is_new: isNew, user: { id: user.id, nickname: user.nickname, points: user.points,
    welcome_used: !!user.welcome_used, is_minor: age.is_minor, identity_verified: age.verified } });
}));

// ---------- 본인확인 (PASS) ----------
// 생년월일의 유일한 신뢰 출처. 클라이언트 자기 입력은 어떤 경로로도 받지 않는다.
app.get("/identity/status", auth, h(async (req, res) => {
  const age = await ageStatus(req.userId);
  res.json({ ...age, daily_limit: age.is_minor ? MINOR_DAILY_LIMIT : null,
    provider_ready: PASS_CONFIGURED, dev_mode: ALLOW_DEV_IDENTITY });
}));

// PASS 연동 지점. 계약·심사 완료 후 이 두 핸들러만 채우면 된다.
app.post("/identity/pass/start", auth, h(async (req, res) => {
  if (!PASS_CONFIGURED) return res.status(503).json({ error: "PASS_NOT_CONFIGURED",
    message: "PASS 본인확인이 아직 연동되지 않았습니다.",
    todo: "PASS_CLIENT_ID / PASS_CLIENT_SECRET 환경변수 설정 후 이 핸들러에 인증 요청 생성 로직을 넣으세요." });
  res.status(501).json({ error: "NOT_IMPLEMENTED" });
}));
app.post("/identity/pass/callback", h(async (req, res) => {
  if (!PASS_CONFIGURED) return res.status(503).json({ error: "PASS_NOT_CONFIGURED" });
  // TODO: PASS 응답 서명 검증 → recordVerification(userId, {provider:'pass', ci, di, name, birth, gender})
  res.status(501).json({ error: "NOT_IMPLEMENTED" });
}));

// 개발 전용 — 운영(PAY_MODE=live 또는 PASS 설정)에서는 자동으로 닫힌다
app.post("/identity/dev-verify", auth, h(async (req, res) => {
  if (!ALLOW_DEV_IDENTITY) return res.status(403).json({ error: "DEV_IDENTITY_DISABLED" });
  const { birth, name } = req.body;
  if (!/^(19|20)\d{6}$/.test(birth || "")) return res.status(400).json({ error: "INVALID_BIRTH" });
  await recordVerification(req.userId, { provider: "dev", birth, name: name || null });
  res.json({ ok: true, ...(await ageStatus(req.userId)) });
}));

async function recordVerification(userId, v) {
  await db.run(
    `INSERT INTO identity_verifications (user_id, provider, ci, di, name, birth, gender, phone, verified_at, memo, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [userId, v.provider, v.ci || null, v.di || null, v.name || null, v.birth, v.gender || null,
     v.phone || null, db.NOW(), v.memo || null, db.NOW()]);
  // users.birth는 표시용 캐시로만 갱신한다. 판정은 항상 identity_verifications를 본다.
  await db.run("UPDATE users SET birth=? WHERE id=?", [v.birth, userId]);
}

// ---------- 팩 / 확률 ----------
const viewers = new Map(); // "N명이 함께 보고 있어요" — 인스턴스별 근사치 (5분 창)
function trackViewer(packId, key) {
  if (!viewers.has(packId)) viewers.set(packId, new Map());
  const m = viewers.get(packId);
  m.set(key, Date.now());
  for (const [k, t] of m) if (Date.now() - t > 5 * 60 * 1000) m.delete(k);
  return m.size;
}

app.get("/packs", h(async (req, res) => {
  // archived = 카탈로그 리셋으로 물러난 옛 팩. 주문 이력 때문에 지우지 않고 숨긴다.
  const ids = await db.all("SELECT id FROM packs WHERE COALESCE(archived,0)=0 ORDER BY price DESC, id");
  res.json(await Promise.all(ids.map((p) => getOdds(p.id))));
}));

// 실시간 HIT 당첨 피드 — 홈 상단 티커용. 닉네임은 마스킹해서 내려준다.
// /packs/:id 보다 먼저 등록해야 한다 (안 그러면 "recent-hits"가 :id로 매칭됨).
function maskNickname(n) {
  const s = String(n || "트레이너");
  return s.length <= 1 ? s + "*" : s[0] + "*".repeat(Math.min(2, s.length - 1));
}
app.get("/packs/recent-hits", h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const rows = await db.all(
    `SELECT c.id, c.name, c.point_value, c.pack_name, c.created_at, u.nickname
     FROM owned_cards c JOIN users u ON u.id = c.user_id
     WHERE c.grade = 'HIT' ORDER BY c.id DESC LIMIT ${limit}`);
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, point_value: r.point_value,
    pack_name: r.pack_name, nickname: maskNickname(r.nickname), created_at: r.created_at,
  })));
}));

app.get("/packs/:id", h(async (req, res) => {
  const o = await getOdds(Number(req.params.id));
  if (!o) return res.status(404).json({ error: "NOT_FOUND" });
  o.viewers = trackViewer(o.pack.id, req.headers.authorization || req.ip);
  res.json(o);
}));

// ---------- 결제 → 개봉 ----------
// 링크 결제라 두 단계로 나뉜다.
//   POST /checkout  → 주문번호 + 결제 링크 발급 (아직 아무것도 뽑지 않는다)
//   입금 확인       → pay.settle()이 아래 확정 처리기를 돌려 그때 개봉한다
// 결제 대기 동안에는 슬롯을 예약해 둔다. 예약을 안 걸면 "결제는 됐는데 품절"이
// 생기고, 링크 결제는 자동 환불이 안 되므로 그건 사람이 수습해야 하는 사고가 된다.

pay.register("pack", async (c, link) => {
  const oid = await c.insert(
    "INSERT INTO orders (user_id, pack_id, amount, method, pg_key, created_at) VALUES (?,?,?,?,?,?)",
    [link.user_id, link.ref_id, link.amount, link.provider, link.pg_key || link.uid, db.NOW()]);
  const result = await draw(c, link.user_id, link.ref_id);
  return { order_id: oid, result };
});

app.post("/checkout", auth, h(async (req, res) => {
  const { pack_id, amount } = req.body;
  const pack = await db.get("SELECT * FROM packs WHERE id=?", [Number(pack_id)]);
  if (!pack || pack.is_welcome) return res.status(400).json({ error: "BAD_PACK" });
  if (!pack.active) return res.status(409).json({ error: "SOLD_OUT" });
  if (amount != null && Number(amount) !== pack.price)
    return res.status(400).json({ error: "AMOUNT_MISMATCH", expected: pack.price });

  // 미성년자 일 결제 한도 — 링크를 내주기 "전"에 막는다 (마켓 결제 합산)
  const blocked = await assertPaymentAllowed(req.userId, pack.price);
  if (blocked) return res.status(403).json(blocked);

  // 남은 슬롯에서 결제 대기 예약분을 뺀 것이 지금 팔 수 있는 몫이다.
  const reserved = await pay.reservedSlots(pack.id);
  if (pack.total_slots - pack.sold_slots - reserved <= 0)
    return res.status(409).json({ error: "SOLD_OUT",
      message: "지금은 결제 대기 중인 주문이 남은 수량을 모두 잡고 있어요. 잠시 후 다시 시도해 주세요." });

  try {
    const out = await pay.createCheckout({
      kind: "pack", userId: req.userId, refId: pack.id, amount: pack.price,
      title: pack.name, payUrlOverride: pack.pay_url || null });
    res.json({ ...out, dev_mode: PAY_DEV_MODE });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message, message: e.message_ko });
  }
}));

// 결제 상태 조회 — 앱은 링크를 열어준 뒤 이 엔드포인트를 폴링한다.
app.get("/checkout/:uid", auth, h(async (req, res) => {
  const link = await pay.find(req.params.uid);
  if (!link || Number(link.user_id) !== Number(req.userId))
    return res.status(404).json({ error: "PAYMENT_NOT_FOUND" });
  res.json(pay.publicView(link, await pay.getPaySettings()));
}));

app.post("/checkout/:uid/cancel", auth, h(async (req, res) => {
  const r = await pay.cancel(req.params.uid, req.userId);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  res.json({ ok: true });
}));

// 개발/테스트 전용 자동 승인. 운영(PAY_MODE=live)에서는 닫힌다.
app.post("/checkout/:uid/confirm-dev", auth, h(async (req, res) => {
  if (!PAY_DEV_MODE) return res.status(403).json({ error: "DEV_CONFIRM_DISABLED" });
  const r = await settleAndRespond(req.params.uid, { by: "dev" }, res, req.userId);
  return r;
}));

// 공통 확정 경로 — 웹훅·관리자·개발 승인이 모두 여기로 모인다.
async function settleAndRespond(uid, opts, res, ownerId) {
  const link = await pay.find(uid);
  if (!link || (ownerId != null && Number(link.user_id) !== Number(ownerId)))
    return res.status(404).json({ error: "PAYMENT_NOT_FOUND" });
  const out = await pay.settle(uid, {
    ...opts,
    // 확정 직전 한도 재검사 — 링크를 받아두고 다른 결제를 먼저 끝낸 경우를 막는다
    guard: (l) => assertPaymentAllowed(l.user_id, l.amount),
  });
  if (!out.ok) return res.status(out.status || 409).json({ error: out.error, detail: out.detail,
    refund_requested: out.refund_requested,
    message: out.refund_requested ? "결제는 확인됐지만 상품 확정에 실패했어요. 환불 요청을 접수했습니다." : undefined });
  const after = await pay.find(uid);
  res.json({ ok: true, already: !!out.already,
    ...pay.publicView(after, await pay.getPaySettings()), dev_mode: PAY_DEV_MODE });
}

// 결제 제공자 웹훅. 공유 비밀이 설정돼 있을 때만 열린다 — 아무나 주문을 확정시키면 안 된다.
app.post("/pay/webhook/:provider", h(async (req, res) => {
  const st = await pay.getPaySettings();
  if (!st.webhook_secret) return res.status(404).json({ error: "WEBHOOK_DISABLED" });
  const given = String(req.headers["x-pay-secret"] || req.query.secret || "");
  // 길이가 달라도 타이밍이 새지 않도록 해시를 비교한다
  const eq = crypto.timingSafeEqual(
    crypto.createHash("sha256").update(given).digest(),
    crypto.createHash("sha256").update(st.webhook_secret).digest());
  if (!eq) return res.status(403).json({ error: "BAD_SECRET" });

  const uid = String(req.body.uid || req.body.order_id || req.body.memo || "").trim();
  const status = String(req.body.status || "paid").toLowerCase();
  if (!uid) return res.status(400).json({ error: "UID_REQUIRED" });
  if (status !== "paid" && status !== "done" && status !== "success") {
    await pay.cancel(uid, null);
    return res.json({ ok: true, cancelled: true });
  }
  return settleAndRespond(uid, {
    pgKey: req.body.pg_key || req.body.tid || null,
    payerName: req.body.payer_name || req.body.buyer_name || null,
    by: "webhook:" + req.params.provider }, res, null);
}));

app.post("/purchase/welcome", auth, h(async (req, res) => {
  try {
    const result = await db.tx(async (c) => {
      const user = await c.get("SELECT * FROM users WHERE id=?" + db.FOR_UPDATE, [req.userId]);
      if (user.welcome_used) throw new Error("WELCOME_ALREADY_USED");
      const pack = await c.get("SELECT * FROM packs WHERE is_welcome=1 AND active=1");
      if (!pack) throw new Error("SOLD_OUT");
      if (user.points < pack.point_price) throw new Error("NOT_ENOUGH_POINTS");
      await c.run("UPDATE users SET points=points-?, welcome_used=1 WHERE id=?", [pack.point_price, req.userId]);
      await c.run("INSERT INTO point_logs (user_id, delta, reason, created_at) VALUES (?,?,'웰컴팩 개봉',?)",
        [req.userId, -pack.point_price, db.NOW()]);
      return draw(c, req.userId, pack.id);
    });
    res.json({ result });
  } catch (e) { res.status(409).json({ error: e.message }); }
}));

// ---------- 결과 처리: 포인트 교환 / 배송 ----------
app.post("/cards/:id/exchange", auth, h(async (req, res) => {
  try {
    const pts = await db.tx(async (c) => {
      const card = await c.get("SELECT * FROM owned_cards WHERE id=? AND user_id=? AND status='owned'" + db.FOR_UPDATE,
        [Number(req.params.id), req.userId]);
      if (!card) throw new Error("CARD_NOT_FOUND");
      await c.run("UPDATE owned_cards SET status='exchanged' WHERE id=?", [card.id]);
      await c.run("UPDATE users SET points=points+? WHERE id=?", [card.point_value, req.userId]);
      await c.run("INSERT INTO point_logs (user_id, delta, reason, created_at) VALUES (?,?,?,?)",
        [req.userId, card.point_value, `카드 교환: ${card.name}`, db.NOW()]);
      return card.point_value;
    });
    res.json({ points_added: pts });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

// 합배송 신청 — 배송비 사용자 부담(별도 결제)
app.post("/shipments", auth, h(async (req, res) => {
  const { card_ids, address } = req.body;
  if (!Array.isArray(card_ids) || !card_ids.length || !address)
    return res.status(400).json({ error: "BAD_REQUEST" });
  try {
    const sid = await db.tx(async (c) => {
      for (const id of card_ids) {
        const r = await c.run("UPDATE owned_cards SET status='ship_requested' WHERE id=? AND user_id=? AND status='owned'",
          [id, req.userId]);
        if (!r.changes) throw new Error("CARD_NOT_FOUND:" + id);
      }
      return c.insert("INSERT INTO shipments (user_id, card_ids, address, fee, created_at) VALUES (?,?,?,3500,?)",
        [req.userId, JSON.stringify(card_ids), address, db.NOW()]);
    });
    res.json({ shipment_id: sid, fee: 3500 }); // TODO: 배송비 결제 → 토스 confirm 동일 플로우
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ---------- 마이페이지 ----------
app.get("/me", auth, h(async (req, res) => {
  const user = await db.get("SELECT id, nickname, points, welcome_used, birth FROM users WHERE id=?", [req.userId]);
  const cards = await db.all("SELECT * FROM owned_cards WHERE user_id=? ORDER BY id DESC", [req.userId]);
  const logs = await db.all("SELECT * FROM point_logs WHERE user_id=? ORDER BY id DESC LIMIT 50", [req.userId]);
  const shipments = await db.all("SELECT * FROM shipments WHERE user_id=? ORDER BY id DESC", [req.userId]);
  const orders = await db.all(
    "SELECT o.*, p.name AS pack_name FROM orders o JOIN packs p ON p.id=o.pack_id WHERE o.user_id=? ORDER BY o.id DESC LIMIT 50",
    [req.userId]);
  const age = await ageStatus(req.userId);
  const minor = age.is_minor;
  const spent = await todaySpent(req.userId);
  res.json({
    user: { id: user.id, nickname: user.nickname, points: user.points, welcome_used: user.welcome_used,
      is_minor: minor, identity_verified: age.verified },
    identity: age,
    limit: { is_minor: minor, daily_limit: minor ? MINOR_DAILY_LIMIT : null,
      today_spent: spent, remaining: minor ? Math.max(0, MINOR_DAILY_LIMIT - spent) : null },
    cards, point_logs: logs, shipments, orders,
  });
}));

// ---------- 마켓 (통신판매중개) ----------
require("./market").mount(app, { auth, admin, h, cancelPayment, assertPaymentAllowed });

// ---------- 관리자 ----------
let adminHtml = null;
app.get("/admin", (req, res) => {
  if (!adminHtml) {
    for (const p of [path.join(__dirname, "admin.html"), path.join(process.cwd(), "admin.html")]) {
      try { adminHtml = fs.readFileSync(p, "utf8"); break; } catch {}
    }
  }
  if (!adminHtml) return res.status(404).send("admin.html not found");
  // no-store: 재배포해도 사파리가 예전 admin.html을 계속 쓰는 문제를 막는다
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.type("html").send(adminHtml.replace(/__BUILD__/g, BUILD));
});

// 진단용 — 인증도 DB도 타지 않는다. 로그인 실패 원인을 계층별로 분리하기 위한 엔드포인트.
// 토큰 값 자체는 절대 응답에 넣지 않는다 (길이/일치 여부만).
app.get("/admin/ping", (req, res) => {
  const given = adminTokenOf(req);
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true, build: BUILD, node: process.version,
    seen_path: req.path, seen_url: req.originalUrl, method: req.method,
    on_vercel: !!process.env.VERCEL,
    admin_token_configured: !!process.env.ADMIN_TOKEN,
    admin_token_length: ADMIN_TOKEN.length,
    given_length: given.length,
    given_via: req.headers["x-admin-token"] ? "header"
      : (req.query && req.query.token) ? "query"
      : req.headers.authorization ? "authorization" : "none",
    match: given === ADMIN_TOKEN,
    db_ready: db.ready, db_driver: db.usePg ? "postgres" : "sqlite",
  });
});

app.get("/admin/overview", admin, h(async (req, res) => {
  // 팩마다 쿼리를 돌리면(N+1) Neon 콜드스타트에서 Vercel 함수 타임아웃(10초)에 걸린다 → 전량 조회 후 메모리 그룹핑
  const [sales, users, pend, packRows, hitRows, poolRows, orderCounts] = await Promise.all([
    db.get("SELECT COALESCE(SUM(amount),0) AS s, COUNT(*) AS c FROM orders WHERE status='paid'"),
    db.get("SELECT COUNT(*) AS c FROM users"),
    db.get("SELECT COUNT(*) AS c FROM shipments WHERE status!='shipped'"),
    db.all("SELECT * FROM packs ORDER BY COALESCE(archived,0), price DESC, id"),
    db.all("SELECT * FROM hits ORDER BY id"),
    db.all("SELECT * FROM point_pool ORDER BY id"),
    db.all("SELECT pack_id, COUNT(*) AS c FROM orders GROUP BY pack_id"),
  ]);
  const by = (rows) => rows.reduce((m, r) => ((m[r.pack_id] = m[r.pack_id] || []).push(r), m), {});
  const hitsBy = by(hitRows), poolBy = by(poolRows);
  const ordBy = Object.fromEntries(orderCounts.map((r) => [r.pack_id, Number(r.c)]));
  const packs = packRows.map((p) => ({ ...p,
    hits: hitsBy[p.id] || [], pool: poolBy[p.id] || [], orders: ordBy[p.id] || 0 }));
  res.json({ sales_total: Number(sales.s), order_count: Number(sales.c), user_count: Number(users.c),
    pending_shipments: Number(pend.c), packs });
}));

app.post("/admin/packs", admin, h(async (req, res) => {
  const { name, price, point_price = 0, is_welcome = 0, total_slots, image = "" } = req.body;
  if (!name || total_slots == null) return res.status(400).json({ error: "BAD_REQUEST" });
  const id = await db.insert("INSERT INTO packs (name, price, point_price, is_welcome, total_slots, image) VALUES (?,?,?,?,?,?)",
    [name, price || 0, point_price, is_welcome ? 1 : 0, total_slots, image]);
  res.json({ id });
}));
app.post("/admin/packs/:id", admin, h(async (req, res) => {
  const allowed = ["name", "price", "point_price", "total_slots", "active", "image", "list_price", "pay_url"];
  const sets = [], vals = [];
  for (const k of allowed) if (req.body[k] != null) { sets.push(`${k}=?`); vals.push(req.body[k]); }
  if (!sets.length) return res.status(400).json({ error: "NO_FIELDS" });
  vals.push(Number(req.params.id));
  await db.run(`UPDATE packs SET ${sets.join(",")} WHERE id=?`, vals);
  res.json({ ok: true });
}));

app.post("/admin/packs/:id/hits", admin, h(async (req, res) => {
  const { name, total_qty, point_value, cost = 0, image = "" } = req.body;
  if (!name || !total_qty || point_value == null) return res.status(400).json({ error: "BAD_REQUEST" });
  const id = await db.insert(
    "INSERT INTO hits (pack_id, name, grade, image, total_qty, remaining, point_value, cost) VALUES (?,?,'HIT',?,?,?,?,?)",
    [Number(req.params.id), name, image, total_qty, total_qty, point_value, cost]);
  await db.run("UPDATE packs SET active=1 WHERE id=?", [Number(req.params.id)]); // 재고 보충 시 판매 재개
  res.json({ id });
}));
app.post("/admin/hits/:id", admin, h(async (req, res) => {
  const { point_value, remaining, total_qty, image } = req.body;
  const sets = [], vals = [];
  if (point_value != null) { sets.push("point_value=?"); vals.push(point_value); }
  if (remaining != null) { sets.push("remaining=?"); vals.push(remaining); }
  if (total_qty != null) { sets.push("total_qty=?"); vals.push(total_qty); }
  if (image != null) { sets.push("image=?"); vals.push(image); }
  if (!sets.length) return res.status(400).json({ error: "NO_FIELDS" });
  vals.push(Number(req.params.id));
  await db.run(`UPDATE hits SET ${sets.join(",")} WHERE id=?`, vals);
  const hit = await db.get("SELECT pack_id FROM hits WHERE id=?", [Number(req.params.id)]);
  if (hit) {
    const left = await db.get("SELECT COALESCE(SUM(remaining),0) AS s FROM hits WHERE pack_id=?", [hit.pack_id]);
    await db.run("UPDATE packs SET active=? WHERE id=?", [Number(left.s) > 0 ? 1 : 0, hit.pack_id]);
  }
  res.json({ ok: true });
}));

app.post("/admin/packs/:id/pool", admin, h(async (req, res) => {
  const { name, rarity, weight = 1, image = "" } = req.body;
  if (!name || !["common", "uncommon", "rare"].includes(rarity)) return res.status(400).json({ error: "BAD_REQUEST" });
  const id = await db.insert("INSERT INTO point_pool (pack_id, name, rarity, image, weight) VALUES (?,?,?,?,?)",
    [Number(req.params.id), name, rarity, image, weight]);
  res.json({ id });
}));
app.post("/admin/pool/:id/delete", admin, h(async (req, res) => {
  await db.run("DELETE FROM point_pool WHERE id=?", [Number(req.params.id)]);
  res.json({ ok: true });
}));
app.post("/admin/pool/:id", admin, h(async (req, res) => {
  const { image, weight, name } = req.body;
  const sets = [], vals = [];
  if (image != null) { sets.push("image=?"); vals.push(image); }
  if (weight != null) { sets.push("weight=?"); vals.push(weight); }
  if (name != null) { sets.push("name=?"); vals.push(name); }
  if (!sets.length) return res.status(400).json({ error: "NO_FIELDS" });
  vals.push(Number(req.params.id));
  await db.run(`UPDATE point_pool SET ${sets.join(",")} WHERE id=?`, vals);
  res.json({ ok: true });
}));

app.get("/admin/shipments", admin, h(async (req, res) => {
  const rows = await db.all(
    "SELECT s.*, u.phone, u.nickname FROM shipments s JOIN users u ON u.id=s.user_id ORDER BY s.id DESC");
  for (const s of rows) {
    const ids = JSON.parse(s.card_ids);
    s.cards = [];
    for (const id of ids) {
      const c = await db.get("SELECT name, grade FROM owned_cards WHERE id=?", [id]);
      if (c) s.cards.push(c);
    }
  }
  res.json(rows);
}));
app.get("/admin/orders", admin, h(async (req, res) => {
  res.json(await db.all(
    "SELECT o.*, u.nickname, p.name AS pack_name FROM orders o JOIN users u ON u.id=o.user_id JOIN packs p ON p.id=o.pack_id ORDER BY o.id DESC LIMIT 200"));
}));
app.get("/admin/users", admin, h(async (req, res) => {
  res.json(await db.all(`
    SELECT u.id, u.nickname, u.phone, u.points, u.welcome_used, u.created_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS order_count,
      (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE o.user_id=u.id) AS spent,
      (SELECT provider FROM identity_verifications v WHERE v.user_id=u.id ORDER BY v.id DESC LIMIT 1) AS verified_by,
      u.birth
    FROM users u ORDER BY u.id DESC LIMIT 200`));
}));
app.post("/admin/shipments/:id", admin, h(async (req, res) => {
  const { status, tracking } = req.body;
  const id = Number(req.params.id);
  await db.run("UPDATE shipments SET status=COALESCE(?,status), tracking=COALESCE(?,tracking) WHERE id=?",
    [status || null, tracking || null, id]);
  if (status === "shipped") {
    const s = await db.get("SELECT card_ids FROM shipments WHERE id=?", [id]);
    if (s) for (const cid of JSON.parse(s.card_ids))
      await db.run("UPDATE owned_cards SET status='shipped' WHERE id=?", [cid]);
  }
  res.json({ ok: true });
}));

// 오프라인 신분증 확인 등으로 관리자가 직접 본인확인을 등록한다.
app.post("/admin/users/:id/verify", admin, h(async (req, res) => {
  const { birth, name, memo } = req.body;
  if (!/^(19|20)\d{6}$/.test(birth || "")) return res.status(400).json({ error: "INVALID_BIRTH" });
  const u = await db.get("SELECT id FROM users WHERE id=?", [Number(req.params.id)]);
  if (!u) return res.status(404).json({ error: "USER_NOT_FOUND" });
  await recordVerification(u.id, { provider: "admin_manual", birth, name: name || null,
    memo: memo || "관리자 수동 확인" });
  res.json({ ok: true, ...(await ageStatus(u.id)) });
}));

// ---------- 이미지 ----------
// 업로드는 관리자만, 조회는 공개(앱이 그대로 <Image src>로 쓴다).
const IMAGE_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

app.post("/admin/images", admin, h(async (req, res) => {
  const { data, label } = req.body;
  // data:image/jpeg;base64,AAAA... 형태만 받는다
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(data || ""));
  if (!m) return res.status(400).json({ error: "BAD_IMAGE", message: "data:image/...;base64, 형식이어야 합니다." });
  const [, mime, b64] = m;
  if (!IMAGE_MIME[mime]) return res.status(400).json({ error: "BAD_MIME", message: "JPEG · PNG · WebP만 올릴 수 있어요." });
  const bytes = Buffer.byteLength(b64, "base64");
  if (bytes > MAX_IMAGE_BYTES)
    return res.status(413).json({ error: "IMAGE_TOO_LARGE", message: `이미지가 너무 큽니다 (${Math.round(bytes / 1024)}KB). 3MB 이하로 올려주세요.` });

  const id = await db.insert(
    "INSERT INTO images (mime, data, bytes, label, created_at) VALUES (?,?,?,?,?)",
    [mime, b64, bytes, label || null, db.NOW()]);
  res.json({ id, url: `/images/${id}`, bytes });
}));

app.get("/images/:id", h(async (req, res) => {
  const img = await db.get("SELECT mime, data FROM images WHERE id=?", [Number(req.params.id)]);
  if (!img) return res.status(404).json({ error: "NOT_FOUND" });
  // 이미지는 교체 시 새 id를 받으므로 내용이 바뀌지 않는다 → 길게 캐시
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.type(img.mime).send(Buffer.from(img.data, "base64"));
}));

app.get("/admin/images", admin, h(async (req, res) => {
  res.json(await db.all("SELECT id, mime, bytes, label, created_at FROM images ORDER BY id DESC LIMIT 100"));
}));

// 카탈로그 리셋 — 판매 상품을 전부 새로 깐다.
// 주문이 붙은 팩은 지우면 이력이 끊기므로 archived로 숨기고, 주문이 없는 팩만 실제로 지운다.
app.post("/admin/catalog/reset", admin, h(async (req, res) => {
  if (String(req.body.confirm || "") !== "RESET")
    return res.status(400).json({ error: "CONFIRM_REQUIRED",
      message: 'confirm 값에 "RESET"을 보내야 실행됩니다.' });

  await pay.sweepExpired();
  const pending = await db.get("SELECT COUNT(*) AS c FROM payment_links WHERE status='pending'");
  if (Number(pending.c) > 0)
    return res.status(409).json({ error: "PENDING_PAYMENTS", count: Number(pending.c),
      message: "결제 대기 중인 주문이 있습니다. 확정하거나 반려한 뒤 다시 시도하세요." });

  const out = await db.tx(async (c) => {
    const packs = await c.all("SELECT id FROM packs");
    const used = await c.all("SELECT DISTINCT pack_id FROM orders");
    const usedIds = new Set(used.map((r) => Number(r.pack_id)));

    let archived = 0, removed = 0;
    for (const p of packs) {
      if (usedIds.has(Number(p.id))) {
        await c.run("UPDATE packs SET active=0, archived=1 WHERE id=?", [p.id]);
        archived++;
      } else {
        for (const t of ["hits", "guaranteed", "point_pool"])
          await c.run(`DELETE FROM ${t} WHERE pack_id=?`, [p.id]);
        await c.run("DELETE FROM packs WHERE id=?", [p.id]);
        removed++;
      }
    }
    const made = await catalog.insertCatalog(c);
    return { archived, removed, created: made.pack_ids.length + 1 };
  });

  res.json({ ok: true, ...out,
    message: `상품 ${out.created}개를 새로 만들었습니다. 주문이 없던 ${out.removed}개는 삭제, 주문 이력이 있는 ${out.archived}개는 보관 처리했습니다.` });
}));

app.get("/admin/refunds", admin, h(async (req, res) => {
  res.json(await db.all(
    `SELECT * FROM refunds
     ORDER BY (CASE WHEN status IN ('failed','requested','pending') THEN 0 ELSE 1 END), id DESC LIMIT 200`));
}));

// 링크 결제는 API로 환불이 안 된다. 관리자가 제공자 화면에서 실제로 돈을 돌려준 뒤
// 여기서 원장을 닫는다 — 이 단계를 거쳐야 "돈이 나갔다"고 말할 수 있다.
app.post("/admin/refunds/:id/:action", admin, h(async (req, res) => {
  const map = { done: "done", failed: "failed", retry: "requested" };
  const to = map[req.params.action];
  if (!to) return res.status(400).json({ error: "BAD_ACTION" });
  const r = await db.run("UPDATE refunds SET status=?, pg_response=?, done_at=? WHERE id=?",
    [to, req.body.memo || null, to === "done" ? db.NOW() : null, Number(req.params.id)]);
  if (!r.changes) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true, status: to });
}));

// ---------- 결제 대사 ----------
// 입금 확인은 기본적으로 사람이 한다. 목록에서 주문번호와 입금자명을 맞춰보고 승인하면
// 그 시점에 개봉/주문이 확정된다.
app.get("/admin/payments", admin, h(async (req, res) => {
  await pay.sweepExpired();
  const st = String(req.query.status || "open");
  const where = st === "all" ? "" :
    st === "open" ? "WHERE p.status IN ('pending','failed')" : "WHERE p.status=?";
  const args = st === "all" || st === "open" ? [] : [st];
  res.json({
    settings: await pay.getPaySettings(),
    payments: await db.all(
      `SELECT p.*, u.nickname, u.phone FROM payment_links p LEFT JOIN users u ON u.id=p.user_id
       ${where} ORDER BY (CASE WHEN p.status='pending' THEN 0 ELSE 1 END), p.id DESC LIMIT 200`, args),
  });
}));

app.post("/admin/payments/:uid/confirm", admin, h(async (req, res) =>
  settleAndRespond(req.params.uid, {
    pgKey: req.body.pg_key || null, payerName: req.body.payer_name || null,
    by: "admin" }, res, null)));

app.post("/admin/payments/:uid/reject", admin, h(async (req, res) => {
  const r = await pay.cancel(req.params.uid, null);
  if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
  await db.run("UPDATE payment_links SET fail_reason=? WHERE uid=?",
    [req.body.reason || "관리자 취소", req.params.uid]);
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "INTERNAL", detail: String(err.message || err) });
});

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API on :${PORT} (${db.usePg ? "Postgres" : "SQLite"}${PAY_DEV_MODE ? ", 결제 테스트 모드" : ", 링크 결제"})`));
}
