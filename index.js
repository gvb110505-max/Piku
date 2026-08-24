// index.js — API 서버 (Express, async, Vercel 서버리스 호환)
//   로컬: node index.js → :4000 리슨
//   Vercel: api/index.js가 이 app을 export (리슨 안 함), 세션은 tokens 테이블(DB) 저장
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { getOdds, draw } = require("./gacha");

const app = express();
// 예전 배포 구조(api/[...path].js)로 들어오던 /api 접두사를 흡수한다.
// 이제 모든 요청이 이 파일 하나로 들어오므로 라우팅은 전부 Express가 담당한다.
app.use((req, res, next) => {
  if (req.url === "/api" || req.url === "/api/") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  else if (req.url.startsWith("/api?")) req.url = "/" + req.url.slice(4);
  next();
});
app.use(express.json());
// DB 미설정이면 500 크래시 대신 원인을 알려준다
app.use((req, res, next) => {
  if (!db.ready) {
    if (req.path === "/health") return next(); // /health는 통과시켜 원인을 알려준다
    return res.status(503).json({ error: "DB_NOT_CONFIGURED",
      message: "DATABASE_URL이 설정되지 않았습니다. Vercel → Storage에서 Postgres를 연결한 뒤 재배포하세요." });
  }
  db.init().then(() => next()).catch(next);
});

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || ""; // 비어있으면 테스트 모드
// 환경변수에 붙어 들어오는 앞뒤 공백/개행(붙여넣기 사고)을 제거 — 이것 때문에 403이 나는 경우가 많다
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "dev-admin").trim();
const BUILD = "2026-08-24.6"; // 관리자 페이지 캐시 확인용 빌드 스탬프
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
  const u = await db.get("SELECT birth FROM users WHERE id=?", [userId]);
  if (!isMinor(u.birth)) return null;
  const spent = await todaySpent(userId);
  if (spent + amount <= MINOR_DAILY_LIMIT) return null;
  return { error: "DAILY_LIMIT_MINOR", limit: MINOR_DAILY_LIMIT, spent,
    remaining: Math.max(0, MINOR_DAILY_LIMIT - spent) };
}

// 토스 결제 승인. 시크릿 키가 없으면 개발 모드로 통과시킨다.
async function confirmPayment({ paymentKey, orderId, amount }) {
  if (!TOSS_SECRET_KEY) return { ok: true, key: paymentKey || "DEV" };
  const r = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(TOSS_SECRET_KEY + ":").toString("base64"),
      "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  if (!r.ok) return { ok: false, detail: await r.text() };
  return { ok: true, key: paymentKey };
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
  res.json({ ok: true, dev_code: TOSS_SECRET_KEY ? undefined : code });
}));

app.post("/auth/verify", h(async (req, res) => {
  const { phone, code, nickname, birth } = req.body;
  const row = await db.get("SELECT * FROM phone_codes WHERE phone=?", [phone]);
  if (!row || row.code !== code || Number(row.expires_at) < Date.now())
    return res.status(400).json({ error: "INVALID_CODE" });
  if (!/^(19|20)\d{6}$/.test(birth || ""))
    return res.status(400).json({ error: "INVALID_BIRTH" });
  await db.run("DELETE FROM phone_codes WHERE phone=?", [phone]);

  let user = await db.get("SELECT * FROM users WHERE phone=?", [phone]); // 전화번호 = 중복가입 방지 키
  let isNew = false;
  if (!user) {
    isNew = true;
    const id = await db.insert("INSERT INTO users (phone, nickname, birth, points, created_at) VALUES (?,?,?,1000,?)",
      [phone, nickname || "트레이너", birth, db.NOW()]);
    await db.run("INSERT INTO point_logs (user_id, delta, reason, created_at) VALUES (?,1000,'신규가입 보너스',?)", [id, db.NOW()]);
    user = await db.get("SELECT * FROM users WHERE id=?", [id]);
  }
  const token = crypto.randomBytes(24).toString("hex");
  await db.run("INSERT INTO tokens (token, user_id, created_at) VALUES (?,?,?)", [token, user.id, db.NOW()]);
  res.json({ token, is_new: isNew, user: { id: user.id, nickname: user.nickname, points: user.points,
    welcome_used: !!user.welcome_used, is_minor: isMinor(user.birth) } });
}));

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
  const ids = await db.all("SELECT id FROM packs ORDER BY id");
  res.json(await Promise.all(ids.map((p) => getOdds(p.id))));
}));
app.get("/packs/:id", h(async (req, res) => {
  const o = await getOdds(Number(req.params.id));
  if (!o) return res.status(404).json({ error: "NOT_FOUND" });
  o.viewers = trackViewer(o.pack.id, req.headers.authorization || req.ip);
  res.json(o);
}));

// ---------- 결제 → 개봉 ----------
app.post("/purchase", auth, h(async (req, res) => {
  const { pack_id, method, paymentKey, orderId, amount } = req.body;
  const pack = await db.get("SELECT * FROM packs WHERE id=?", [pack_id]);
  if (!pack || pack.is_welcome) return res.status(400).json({ error: "BAD_PACK" });
  if (amount !== pack.price) return res.status(400).json({ error: "AMOUNT_MISMATCH" });

  // 미성년자 일 결제 한도 — PG 승인 "전"에 차단 (마켓 결제 합산)
  const blocked = await assertPaymentAllowed(req.userId, amount);
  if (blocked) return res.status(403).json(blocked);

  const pay = await confirmPayment({ paymentKey, orderId, amount });
  if (!pay.ok) return res.status(402).json({ error: "PAYMENT_FAILED", detail: pay.detail });

  try {
    const out = await db.tx(async (c) => {
      const oid = await c.insert("INSERT INTO orders (user_id, pack_id, amount, method, pg_key, created_at) VALUES (?,?,?,?,?,?)",
        [req.userId, pack_id, amount, method || "toss", paymentKey || "DEV", db.NOW()]);
      const result = await draw(c, req.userId, pack_id);
      return { order_id: oid, result };
    });
    res.json(out);
  } catch (e) {
    // TODO 운영: SOLD_OUT 경합 시 자동 환불 API 호출
    res.status(409).json({ error: e.message });
  }
}));

// 웰컴팩: 1,000포인트 + 계정당 1회 (서버 검증)
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
  const minor = isMinor(user.birth);
  const spent = await todaySpent(req.userId);
  res.json({
    user: { id: user.id, nickname: user.nickname, points: user.points, welcome_used: user.welcome_used, is_minor: minor },
    limit: { is_minor: minor, daily_limit: minor ? MINOR_DAILY_LIMIT : null,
      today_spent: spent, remaining: minor ? Math.max(0, MINOR_DAILY_LIMIT - spent) : null },
    cards, point_logs: logs, shipments, orders,
  });
}));

// ---------- 마켓 (통신판매중개) ----------
require("./market").mount(app, { auth, admin, h, confirmPayment, assertPaymentAllowed });

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
    db.all("SELECT * FROM packs ORDER BY id"),
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
  const allowed = ["name", "price", "point_price", "total_slots", "active", "image"];
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
  const { point_value, remaining, total_qty } = req.body;
  const sets = [], vals = [];
  if (point_value != null) { sets.push("point_value=?"); vals.push(point_value); }
  if (remaining != null) { sets.push("remaining=?"); vals.push(remaining); }
  if (total_qty != null) { sets.push("total_qty=?"); vals.push(total_qty); }
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
      (SELECT COALESCE(SUM(amount),0) FROM orders o WHERE o.user_id=u.id) AS spent
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "INTERNAL", detail: String(err.message || err) });
});

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`API on :${PORT} (${db.usePg ? "Postgres" : "SQLite"}${TOSS_SECRET_KEY ? ", PG결제 연동" : ", 결제 테스트 모드"})`));
}
