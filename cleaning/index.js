// cleaning/index.js — "청소로 용돈벌이" 중개 플랫폼 API 서버
//   로컬: node cleaning/index.js → :4100
//   플랫폼은 거래 당사자가 아니라 통신판매중개자다. 대금은 PG 분할정산(에스크로)에
//   예치되고, 서버는 예치/해제 지시만 한다 — 고객 돈을 직접 보관하지 않는다.
const express = require("express");
const path = require("path");
const db = require("./db");
const { TERMS, REQUIRED, byCode, BROKER_NOTICE } = require("./terms");
const sec = require("./secure");
const sanctions = require("./sanctions");
const pg = require("./escrow");

const app = express();
const ADMIN_TOKEN = String(process.env.CLEANING_ADMIN_TOKEN || "dev-admin").trim();
const IDENTITY_DEV = process.env.IDENTITY_MODE !== "live"; // PASS 연동 전 개발 모드

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-admin-token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  if (!db.ready) return res.status(503).json({ error: "DB_NOT_CONFIGURED" });
  db.init().then(() => next()).catch(next);
});

const h = (fn) => (req, res, next) => fn(req, res).catch(next);
const bad = (res, code, msg) => res.status(400).json({ error: code, message: msg });

async function auth(req, res, next) {
  try {
    const t = await db.get("SELECT user_id FROM tokens WHERE token=?", [req.headers.authorization || ""]);
    if (!t) return res.status(401).json({ error: "UNAUTHORIZED" });
    const u = await db.get("SELECT * FROM users WHERE id=?", [t.user_id]);
    if (!u) return res.status(401).json({ error: "UNAUTHORIZED" });
    if (u.status === "withdrawn") return res.status(403).json({ error: "WITHDRAWN", message: "탈퇴 처리된 계정입니다." });
    req.user = u;
    next();
  } catch (e) { next(e); }
}
const role = (want) => (req, res, next) =>
  req.user.role === want ? next() : res.status(403).json({ error: "ROLE_REQUIRED", message: `${want} 전용 기능입니다.` });
// 제재(suspended) 중인 작업자는 새 지원/작업을 할 수 없다. 이의신청과 조회는 가능하다.
const activeOnly = (req, res, next) =>
  req.user.status === "active" ? next()
    : res.status(403).json({ error: "SUSPENDED", message: "제재 절차 진행 중에는 이용할 수 없습니다." });
function adminOf(req) {
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return String(req.headers["x-admin-token"] || (req.query && req.query.token) || bearer || "").trim();
}
const admin = (req, res, next) =>
  adminOf(req) === ADMIN_TOKEN ? next() : res.status(403).json({ error: "FORBIDDEN" });

const age = (birth) => {
  if (!/^\d{8}$/.test(String(birth || ""))) return -1;
  const y = +birth.slice(0, 4), m = +birth.slice(4, 6), d = +birth.slice(6, 8);
  const n = new Date();
  let a = n.getFullYear() - y;
  if (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d)) a--;
  return a;
};
const publicUser = (u) => ({
  id: u.id, role: u.role, nickname: u.nickname, name: u.name, status: u.status, created_at: u.created_at,
});

// ================= 공통 =================
app.get("/health", h(async (req, res) => res.json({
  ok: true, db: db.usePg ? "postgres" : "sqlite", notice: BROKER_NOTICE,
})));
// 온보딩 약관 화면이 그대로 그릴 수 있는 형태로 내려준다("보기" 본문 포함)
app.get("/terms", (req, res) => res.json({ notice: BROKER_NOTICE, terms: TERMS }));

// ================= 가입 / 본인인증 =================
// PASS 본인인증 결과(CI)를 받아 가입한다. CI 원본은 저장하지 않고 해시만 남긴다.
// consents는 {code: true/false} — 필수 항목이 하나라도 false면 가입이 진행되지 않는다.
app.post("/auth/verify", h(async (req, res) => {
  const { phone, name, birth, role: want = "customer", nickname, consents = {} } = req.body || {};
  const ci = IDENTITY_DEV ? (req.body.ci || `dev-ci-${phone}`) : req.body.ci;
  if (!phone || !ci) return bad(res, "IDENTITY_REQUIRED", "휴대폰 본인인증이 필요합니다.");
  if (!["customer", "worker"].includes(want)) return bad(res, "BAD_ROLE");
  if (age(birth) < 19) return bad(res, "AGE_RESTRICTED", "만 19세 이상만 이용할 수 있습니다.");

  const missing = REQUIRED.filter((c) => consents[c] !== true);
  if (missing.length) return bad(res, "CONSENT_REQUIRED", `필수 동의 항목 미동의: ${missing.join(", ")}`);

  const ciHash = sec.hash(ci);
  const black = await db.get("SELECT * FROM blacklist WHERE ci_hash=?", [ciHash]);
  if (black) return res.status(403).json({
    error: "BLACKLISTED", message: "제재 이력으로 재가입이 제한된 계정입니다.", reason: black.reason });

  const out = await db.tx(async (c) => {
    let u = await c.get("SELECT * FROM users WHERE ci_hash=?", [ciHash]);
    let isNew = false;
    if (!u) {
      const id = await c.insert(
        `INSERT INTO users (role, phone_enc, phone_hash, ci_hash, name, nickname, birth, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,'active',?,?)`,
        [want, sec.encrypt(phone), sec.hash(phone), ciHash, name || "", nickname || name || "",
          String(birth), db.NOW(), db.NOW()]);
      u = await c.get("SELECT * FROM users WHERE id=?", [id]);
      isNew = true;
    } else if (u.status === "withdrawn") {
      return { blocked: true };
    }
    // 동의 원장은 재인증 때마다 현재 버전으로 다시 남긴다(선택 항목 변경 추적)
    for (const t of TERMS) {
      const agreed = consents[t.code] === true ? 1 : 0;
      await c.run("INSERT INTO consents (user_id, code, version, agreed, agreed_at) VALUES (?,?,?,?,?)",
        [u.id, t.code, t.version, agreed, db.NOW()]);
    }
    const token = sec.token();
    await c.run("INSERT INTO tokens (token, user_id, created_at) VALUES (?,?,?)", [token, u.id, db.NOW()]);
    return { token, user: u, isNew };
  });
  if (out.blocked) return res.status(403).json({ error: "WITHDRAWN", message: "탈퇴 처리된 계정입니다." });
  res.json({ token: out.token, is_new: out.isNew, user: publicUser(out.user), notice: BROKER_NOTICE });
}));

app.get("/me", auth, h(async (req, res) => {
  const consents = await db.all(
    `SELECT code, version, agreed, agreed_at FROM consents WHERE user_id=? ORDER BY id DESC`, [req.user.id]);
  const seen = new Set();
  const latest = consents.filter((c) => (seen.has(c.code) ? false : seen.add(c.code)));
  const s = req.user.role === "worker" ? await workerStats(req.user.id) : null;
  res.json({ user: publicUser(req.user), phone: sec.maskPhone(sec.decrypt(req.user.phone_enc)),
    consents: latest, stats: s, notice: BROKER_NOTICE });
}));

app.get("/notifications", auth, h(async (req, res) =>
  res.json(await db.all("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50", [req.user.id]))));

// ================= 모집글 =================
// 정확한 주소는 확정 전까지 감춘다 — 목록/상세 모두 동/구 단위까지만.
const regionOf = (p) => `${p.sido} ${p.sigungu} ${p.dong}`;
function postView(p, { full = false } = {}) {
  return {
    id: p.id, customer_id: p.customer_id, cleaning_type: p.cleaning_type, scheduled_at: p.scheduled_at,
    region: regionOf(p), pyeong: p.pyeong, budget: p.budget, note: p.note, status: p.status,
    created_at: p.created_at,
    address: full ? sec.decrypt(p.address_enc) : null,
    address_visible: !!full,
  };
}

app.post("/job-posts", auth, role("customer"), activeOnly, h(async (req, res) => {
  const { cleaning_type, scheduled_at, sido, sigungu, dong, address, pyeong = 0, budget, note } = req.body || {};
  if (!cleaning_type || !scheduled_at || !sido || !sigungu || !dong || !address)
    return bad(res, "MISSING_FIELD", "청소 종류·일시·지역·주소는 필수입니다.");
  if (!(Number(budget) > 0)) return bad(res, "BAD_BUDGET");
  const id = await db.insert(
    `INSERT INTO job_posts (customer_id, cleaning_type, scheduled_at, sido, sigungu, dong, address_enc,
      pyeong, budget, note, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?)`,
    [req.user.id, cleaning_type, scheduled_at, sido, sigungu, dong, sec.encrypt(address),
      Number(pyeong) || 0, Number(budget), note || "", db.NOW(), db.NOW()]);
  const p = await db.get("SELECT * FROM job_posts WHERE id=?", [id]);
  res.json({ post: postView(p, { full: true }) });
}));

app.get("/job-posts", h(async (req, res) => {
  const { sigungu, status = "open", cleaning_type } = req.query;
  const w = ["1=1"], p = [];
  if (status) { w.push("status=?"); p.push(status); }
  if (sigungu) { w.push("sigungu=?"); p.push(sigungu); }
  if (cleaning_type) { w.push("cleaning_type=?"); p.push(cleaning_type); }
  const rows = await db.all(
    `SELECT * FROM job_posts WHERE ${w.join(" AND ")} ORDER BY id DESC LIMIT 100`, p);
  res.json(rows.map((r) => postView(r)));
}));

// 상세: 작성자 본인은 항상, 작업자는 "확정된 뒤 ~ 작업 완료 전"에만 정확한 주소를 본다.
app.get("/job-posts/:id", auth, h(async (req, res) => {
  const p = await db.get("SELECT * FROM job_posts WHERE id=?", [req.params.id]);
  if (!p) return res.status(404).json({ error: "NOT_FOUND" });
  const m = await db.get("SELECT * FROM matches WHERE post_id=? AND status IN ('matched','working')", [p.id]);
  const full = req.user.id === p.customer_id || (m && m.worker_id === req.user.id);
  const applications = req.user.id === p.customer_id ? await rankedApplications(p.id) : undefined;
  const mine = req.user.role === "worker"
    ? await db.get("SELECT * FROM applications WHERE post_id=? AND worker_id=?", [p.id, req.user.id]) : undefined;
  res.json({ post: postView(p, { full: !!full }), applications, my_application: mine || null, notice: BROKER_NOTICE });
}));

// ================= 지원 / 매칭 =================
async function workerStats(workerId) {
  const s = await sanctions.stats(db, workerId);
  const done = await db.get("SELECT COUNT(*) AS c FROM matches WHERE worker_id=? AND status='completed'", [workerId]);
  const newLimit = Number(await db.setting("new_worker_rating_count"));
  return { avg_score: s.avg, rating_count: s.count, completed_count: Number(done.c), is_new: s.count < newLimit };
}

// 서버가 평균 별점 → 평가 개수 → 완료 건수 순으로 정렬해서 고객에게 준다.
// 평가가 적은 신규 작업자는 평균 0점으로 밀리지 않도록 "신규" 뱃지를 달고
// 평가가 있는 작업자 사이사이가 아니라 상위권 바로 다음 구간에 배치한다.
async function rankedApplications(postId) {
  const rows = await db.all("SELECT * FROM applications WHERE post_id=? AND status<>'withdrawn'", [postId]);
  const out = [];
  for (const a of rows) {
    const u = await db.get("SELECT * FROM users WHERE id=?", [a.worker_id]);
    out.push({ ...a, worker: publicUser(u), stats: await workerStats(a.worker_id) });
  }
  out.sort((x, y) => {
    if (x.stats.is_new !== y.stats.is_new) return x.stats.is_new ? 1 : -1; // 신규는 별도 구간
    return (y.stats.avg_score - x.stats.avg_score)
      || (y.stats.rating_count - x.stats.rating_count)
      || (y.stats.completed_count - x.stats.completed_count)
      || (x.id - y.id);
  });
  return out;
}

app.post("/job-posts/:id/apply", auth, role("worker"), activeOnly, h(async (req, res) => {
  const p = await db.get("SELECT * FROM job_posts WHERE id=?", [req.params.id]);
  if (!p) return res.status(404).json({ error: "NOT_FOUND" });
  if (p.status !== "open") return bad(res, "POST_CLOSED", "이미 마감된 모집글입니다.");
  const dup = await db.get("SELECT id FROM applications WHERE post_id=? AND worker_id=?", [p.id, req.user.id]);
  if (dup) return bad(res, "ALREADY_APPLIED");
  const id = await db.insert(
    `INSERT INTO applications (post_id, worker_id, message, price, status, created_at)
     VALUES (?,?,?,?,'applied',?)`,
    [p.id, req.user.id, req.body.message || "", Number(req.body.price) || p.budget, db.NOW()]);
  res.json({ application_id: id });
}));

app.get("/job-posts/:id/applications", auth, role("customer"), h(async (req, res) => {
  const p = await db.get("SELECT * FROM job_posts WHERE id=?", [req.params.id]);
  if (!p) return res.status(404).json({ error: "NOT_FOUND" });
  if (p.customer_id !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
  res.json(await rankedApplications(p.id));
}));

// 고객이 지원자를 직접 고르거나(auto 미지정), "별점 최고 작업자 자동 배정"을 쓴다.
app.post("/job-posts/:id/select", auth, role("customer"), h(async (req, res) => {
  const { application_id, auto } = req.body || {};
  const out = await db.tx(async (c) => {
    const p = await c.get(`SELECT * FROM job_posts WHERE id=?${db.FOR_UPDATE}`, [req.params.id]);
    if (!p) return { err: [404, "NOT_FOUND"] };
    if (p.customer_id !== req.user.id) return { err: [403, "FORBIDDEN"] };
    if (p.status !== "open") return { err: [400, "POST_CLOSED"] };

    let app_;
    if (auto) {
      const ranked = await rankedApplications(p.id);
      // 자동 배정은 평가가 있는 최고 별점 작업자 우선, 지원자가 신규뿐이면 신규 중 먼저 지원한 사람
      app_ = ranked.find((a) => !a.stats.is_new) || ranked[0];
    } else {
      app_ = await c.get("SELECT * FROM applications WHERE id=? AND post_id=?", [application_id, p.id]);
    }
    if (!app_) return { err: [400, "NO_APPLICANT"] };
    const w = await c.get("SELECT * FROM users WHERE id=?", [app_.worker_id]);
    if (!w || w.status !== "active") return { err: [400, "WORKER_UNAVAILABLE"] };

    await c.run("UPDATE applications SET status='selected' WHERE id=?", [app_.id]);
    await c.run("UPDATE applications SET status='rejected' WHERE post_id=? AND id<>? AND status='applied'",
      [p.id, app_.id]);
    await c.run("UPDATE job_posts SET status='matched', updated_at=? WHERE id=?", [db.NOW(), p.id]);
    const matchId = await c.insert(
      `INSERT INTO matches (post_id, customer_id, worker_id, price, status, matched_at, created_at)
       VALUES (?,?,?,?,'matched',?,?)`,
      [p.id, p.customer_id, app_.worker_id, Number(app_.price) || p.budget, db.NOW(), db.NOW()]);
    await sanctions.notify(c, app_.worker_id, "matched", "작업이 확정되었습니다",
      `${regionOf(p)} / ${p.scheduled_at} 작업에 확정되었습니다. 상세 주소가 공개됩니다.`);
    return { matchId, post: p };
  });
  if (out.err) return res.status(out.err[0]).json({ error: out.err[1] });
  const m = await db.get("SELECT * FROM matches WHERE id=?", [out.matchId]);
  res.json({ match: m, address: sec.decrypt(out.post.address_enc) });
}));

// ================= 거래 / 결제 / 정산 =================
async function matchView(m, viewerId) {
  const p = await db.get("SELECT * FROM job_posts WHERE id=?", [m.post_id]);
  // 작업 종료 후에는 작업자 화면에서 주소를 비공개 처리한다
  const workerCanSee = viewerId === m.worker_id && ["matched", "working"].includes(m.status);
  const full = viewerId === m.customer_id || workerCanSee;
  const pay = await db.get("SELECT * FROM payments WHERE match_id=? ORDER BY id DESC", [m.id]);
  const st = await db.get("SELECT * FROM settlements WHERE match_id=? ORDER BY id DESC", [m.id]);
  const rating = await db.get("SELECT * FROM ratings WHERE match_id=?", [m.id]);
  return { match: m, post: postView(p, { full }), payment: pay || null, settlement: st || null,
    rating: rating || null, notice: BROKER_NOTICE };
}

app.get("/matches", auth, h(async (req, res) => {
  const rows = await db.all(
    "SELECT * FROM matches WHERE customer_id=? OR worker_id=? ORDER BY id DESC LIMIT 50", [req.user.id, req.user.id]);
  res.json(await Promise.all(rows.map((m) => matchView(m, req.user.id))));
}));

app.get("/matches/:id", auth, h(async (req, res) => {
  const m = await db.get("SELECT * FROM matches WHERE id=?", [req.params.id]);
  if (!m) return res.status(404).json({ error: "NOT_FOUND" });
  if (![m.customer_id, m.worker_id].includes(req.user.id)) return res.status(403).json({ error: "FORBIDDEN" });
  res.json(await matchView(m, req.user.id));
}));

// 결제 — PG 분할정산(에스크로)에 예치만 건다. 플랫폼 계좌로 받지 않는다.
app.post("/matches/:id/pay", auth, role("customer"), h(async (req, res) => {
  const m = await db.get("SELECT * FROM matches WHERE id=?", [req.params.id]);
  if (!m) return res.status(404).json({ error: "NOT_FOUND" });
  if (m.customer_id !== req.user.id) return res.status(403).json({ error: "FORBIDDEN" });
  const dup = await db.get("SELECT * FROM payments WHERE match_id=? AND status IN ('escrowed','released')", [m.id]);
  if (dup) return bad(res, "ALREADY_PAID");
  const r = await pg.escrow({ match_id: m.id, amount: m.price, pg_token: req.body.pg_token });
  if (!r.ok) return bad(res, "PAY_FAILED", r.message);
  const id = await db.insert(
    `INSERT INTO payments (match_id, customer_id, amount, pg_provider, pg_key, status, created_at, updated_at)
     VALUES (?,?,?,?,?,'escrowed',?,?)`,
    [m.id, req.user.id, m.price, r.provider, r.pg_key, db.NOW(), db.NOW()]);
  res.json({ payment_id: id, amount: m.price, status: "escrowed", notice: BROKER_NOTICE });
}));

// 작업 완료 확인(고객) → 수수료·원천징수를 제외한 금액을 작업자에게 정산 지시
app.post("/matches/:id/complete", auth, role("customer"), h(async (req, res) => {
  const out = await db.tx(async (c) => {
    const m = await c.get(`SELECT * FROM matches WHERE id=?${db.FOR_UPDATE}`, [req.params.id]);
    if (!m) return { err: [404, "NOT_FOUND"] };
    if (m.customer_id !== req.user.id) return { err: [403, "FORBIDDEN"] };
    if (m.status === "completed") return { err: [400, "ALREADY_COMPLETED"] };
    if (m.status === "cancelled") return { err: [400, "CANCELLED"] };
    const pay = await c.get("SELECT * FROM payments WHERE match_id=? AND status='escrowed'", [m.id]);
    if (!pay) return { err: [400, "NOT_PAID", "결제(에스크로 예치)가 확인되지 않았습니다."] };

    const feeRate = Number(await db.setting("fee_rate"));
    const whRate = Number(await db.setting("withholding_rate"));
    const gross = pay.amount;
    const fee = Math.floor(gross * feeRate);
    const wh = Math.floor((gross - fee) * whRate);       // 수수료 차감 후 지급액 기준 원천징수
    const payout = gross - fee - wh;

    const rel = await pg.release({ pg_key: pay.pg_key, worker_amount: payout, fee_amount: fee });
    if (!rel.ok) return { err: [400, "SETTLE_FAILED", rel.message] };

    await c.run("UPDATE payments SET status='released', updated_at=? WHERE id=?", [db.NOW(), pay.id]);
    await c.run("UPDATE matches SET status='completed', completed_at=? WHERE id=?", [db.NOW(), m.id]);
    await c.run("UPDATE job_posts SET status='completed', updated_at=? WHERE id=?", [db.NOW(), m.post_id]);
    const sid = await c.insert(
      `INSERT INTO settlements (match_id, payment_id, worker_id, gross, fee_rate, fee_amount,
        withholding_rate, withholding_amount, payout_amount, status, created_at, paid_at)
       VALUES (?,?,?,?,?,?,?,?,?,'paid',?,?)`,
      [m.id, pay.id, m.worker_id, gross, feeRate, fee, whRate, wh, payout, db.NOW(), db.NOW()]);
    await sanctions.notify(c, m.worker_id, "settled", "정산 완료",
      `작업 대금 ${payout.toLocaleString()}원이 정산되었습니다. (중개수수료 ${fee.toLocaleString()}원, 원천징수 3.3% ${wh.toLocaleString()}원 차감)`);
    return { settlement_id: sid, gross, fee, wh, payout };
  });
  if (out.err) return res.status(out.err[0]).json({ error: out.err[1], message: out.err[2] });
  res.json({ ok: true, settlement: out, notice: BROKER_NOTICE });
}));

// ================= 별점 =================
// 실제로 완료된 거래에 대해서만, 고객이 1회 남길 수 있다. 1점은 사유 필수.
const ONE_STAR_REASONS = ["no_show", "damage", "rude", "poor_quality", "late", "etc"];

app.post("/matches/:id/rating", auth, role("customer"), h(async (req, res) => {
  const { score, reason, review } = req.body || {};
  const s = Number(score);
  if (!(s >= 1 && s <= 5)) return bad(res, "BAD_SCORE", "별점은 1~5점입니다.");
  if (s === 1 && !ONE_STAR_REASONS.includes(String(reason)))
    return bad(res, "REASON_REQUIRED", `1점은 사유 선택이 필수입니다. (${ONE_STAR_REASONS.join(", ")})`);

  const out = await db.tx(async (c) => {
    const m = await c.get(`SELECT * FROM matches WHERE id=?${db.FOR_UPDATE}`, [req.params.id]);
    if (!m) return { err: [404, "NOT_FOUND"] };
    if (m.customer_id !== req.user.id) return { err: [403, "FORBIDDEN"] };
    if (m.status !== "completed") return { err: [400, "NOT_COMPLETED", "완료된 거래만 평가할 수 있습니다."] };
    const dup = await c.get("SELECT id FROM ratings WHERE match_id=?", [m.id]);
    if (dup) return { err: [400, "ALREADY_RATED"] };
    const id = await c.insert(
      `INSERT INTO ratings (match_id, customer_id, worker_id, score, reason, review, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [m.id, m.customer_id, m.worker_id, s, s === 1 ? reason : (reason || null), review || "", db.NOW()]);
    const ev = await sanctions.evaluate(c, m.worker_id);
    return { id, ev };
  });
  if (out.err) return res.status(out.err[0]).json({ error: out.err[1], message: out.err[2] });
  res.json({ rating_id: out.id, worker: { avg_score: out.ev.avg, rating_count: out.ev.count }, sanction: out.ev.action });
}));

app.get("/workers/:id", h(async (req, res) => {
  const u = await db.get("SELECT * FROM users WHERE id=? AND role='worker'", [req.params.id]);
  if (!u) return res.status(404).json({ error: "NOT_FOUND" });
  const reviews = await db.all(
    `SELECT score, reason, review, created_at FROM ratings
      WHERE worker_id=? AND voided=0 ORDER BY id DESC LIMIT 20`, [u.id]);
  res.json({ worker: publicUser(u), stats: await workerStats(u.id), reviews });
}));

// ================= 제재 / 이의신청 =================
app.get("/sanctions/me", auth, h(async (req, res) =>
  res.json(await db.all("SELECT * FROM sanctions WHERE user_id=? ORDER BY id DESC", [req.user.id]))));

app.post("/sanctions/:id/appeal", auth, h(async (req, res) => {
  const s = await db.get("SELECT * FROM sanctions WHERE id=?", [req.params.id]);
  if (!s || s.user_id !== req.user.id) return res.status(404).json({ error: "NOT_FOUND" });
  if (s.status !== "open") return bad(res, "NOT_APPEALABLE", "이의신청할 수 없는 상태입니다.");
  if (s.appeal_deadline && s.appeal_deadline < db.NOW()) return bad(res, "APPEAL_CLOSED", "이의신청 기간이 지났습니다.");
  await db.run("UPDATE sanctions SET status='appealed', appeal_text=?, appeal_at=? WHERE id=?",
    [String(req.body.text || ""), db.NOW(), s.id]);
  res.json({ ok: true });
}));

// ================= 신고 =================
const REPORT_KINDS = ["damage", "theft", "misconduct", "no_show", "etc"];
app.post("/reports", auth, h(async (req, res) => {
  const { match_id, kind, detail } = req.body || {};
  if (!REPORT_KINDS.includes(String(kind))) return bad(res, "BAD_KIND", `신고 유형: ${REPORT_KINDS.join(", ")}`);
  let target = null;
  if (match_id) {
    const m = await db.get("SELECT * FROM matches WHERE id=?", [match_id]);
    if (!m || ![m.customer_id, m.worker_id].includes(req.user.id)) return res.status(403).json({ error: "FORBIDDEN" });
    target = req.user.id === m.customer_id ? m.worker_id : m.customer_id;
  }
  const id = await db.insert(
    `INSERT INTO reports (reporter_id, target_user_id, match_id, kind, detail, status, created_at)
     VALUES (?,?,?,?,?,'received',?)`,
    [req.user.id, target, match_id || null, kind, String(detail || ""), db.NOW()]);
  res.json({ report_id: id });
}));

// ================= 관리자 =================
app.get("/admin/users", admin, h(async (req, res) => {
  const q = String(req.query.q || "");
  const w = ["1=1"], p = [];
  if (req.query.role) { w.push("role=?"); p.push(req.query.role); }
  if (req.query.status) { w.push("status=?"); p.push(req.query.status); }
  if (/^\d{10,11}$/.test(q)) { w.push("phone_hash=?"); p.push(sec.hash(q)); }
  else if (q) { w.push("(name LIKE ? OR nickname LIKE ?)"); p.push(`%${q}%`, `%${q}%`); }
  const rows = await db.all(`SELECT * FROM users WHERE ${w.join(" AND ")} ORDER BY id DESC LIMIT 100`, p);
  res.json(await Promise.all(rows.map(async (u) => ({
    ...publicUser(u), phone: sec.maskPhone(sec.decrypt(u.phone_enc)),
    stats: u.role === "worker" ? await workerStats(u.id) : null,
  }))));
}));

app.get("/admin/sanctions", admin, h(async (req, res) => {
  const rows = await db.all(
    `SELECT * FROM sanctions ${req.query.status ? "WHERE status=?" : ""} ORDER BY id DESC LIMIT 200`,
    req.query.status ? [req.query.status] : []);
  res.json(rows);
}));

// 이의신청 처리 — accept면 제재 취소(필요 시 문제된 평가를 함께 무효 처리), reject면 유지
app.post("/admin/sanctions/:id/resolve", admin, h(async (req, res) => {
  const { action, memo, void_rating_ids = [] } = req.body || {};
  if (!["accept", "reject", "execute"].includes(String(action))) return bad(res, "BAD_ACTION");
  const out = await db.tx(async (c) => {
    const s = await c.get(`SELECT * FROM sanctions WHERE id=?${db.FOR_UPDATE}`, [req.params.id]);
    if (!s) return { err: [404, "NOT_FOUND"] };
    if (action === "execute") {
      if (s.type !== "withdraw" || !["open", "appealed"].includes(s.status)) return { err: [400, "BAD_STATE"] };
      return { executed: await sanctions.execute(c, s) };
    }
    if (action === "reject") {
      await c.run("UPDATE sanctions SET status='open', admin_memo=? WHERE id=?", [String(memo || ""), s.id]);
      return { ok: true };
    }
    for (const rid of void_rating_ids) {
      await c.run("UPDATE ratings SET voided=1, void_reason=?, voided_at=? WHERE id=?",
        [String(memo || "관리자 무효 처리"), db.NOW(), rid]);
    }
    const ev = await sanctions.evaluate(c, s.user_id); // 조건이 풀리면 여기서 제재가 취소된다
    if (ev.action !== "cancelled") {
      await c.run("UPDATE sanctions SET status='cancelled', admin_memo=?, resolved_at=? WHERE id=?",
        [String(memo || "이의신청 인용"), db.NOW(), s.id]);
      await c.run("UPDATE users SET status='active', status_reason=NULL, updated_at=? WHERE id=?",
        [db.NOW(), s.user_id]);
    }
    return { ok: true, stats: ev };
  });
  if (out.err) return res.status(out.err[0]).json({ error: out.err[1] });
  res.json(out);
}));

// 평가 무효 처리(악의적 평가). 무효 후 제재 조건을 다시 계산한다.
app.post("/admin/ratings/:id/void", admin, h(async (req, res) => {
  const out = await db.tx(async (c) => {
    const r = await c.get("SELECT * FROM ratings WHERE id=?", [req.params.id]);
    if (!r) return { err: [404, "NOT_FOUND"] };
    await c.run("UPDATE ratings SET voided=1, void_reason=?, voided_at=? WHERE id=?",
      [String(req.body.reason || "관리자 무효 처리"), db.NOW(), r.id]);
    return { stats: await sanctions.evaluate(c, r.worker_id) };
  });
  if (out.err) return res.status(out.err[0]).json({ error: out.err[1] });
  res.json(out);
}));

// 이의신청 기간이 끝난 탈퇴 예정 건 확정(배치/버튼)
app.post("/admin/sanctions/run-due", admin, h(async (req, res) => {
  const done = await db.tx((c) => sanctions.executeDue(c));
  res.json({ executed: done });
}));

app.get("/admin/abuse", admin, h(async (req, res) => {
  const rows = await sanctions.abusePatterns(db, Number(req.query.min_ones || 3));
  res.json(rows);
}));

app.get("/admin/reports", admin, h(async (req, res) =>
  res.json(await db.all("SELECT * FROM reports ORDER BY id DESC LIMIT 200"))));

app.post("/admin/reports/:id/resolve", admin, h(async (req, res) => {
  const { status = "resolved", memo } = req.body || {};
  if (!["reviewing", "resolved", "rejected"].includes(status)) return bad(res, "BAD_STATUS");
  const r = await db.run("UPDATE reports SET status=?, admin_memo=?, resolved_at=? WHERE id=?",
    [status, String(memo || ""), db.NOW(), req.params.id]);
  if (!r.changes) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ ok: true });
}));

app.get("/admin/settlements", admin, h(async (req, res) =>
  res.json(await db.all("SELECT * FROM settlements ORDER BY id DESC LIMIT 200"))));

app.get("/admin/settings", admin, h(async (req, res) =>
  res.json(await db.all("SELECT * FROM settings ORDER BY key"))));

app.post("/admin/settings", admin, h(async (req, res) => {
  const body = req.body || {};
  delete body.admin_token;
  for (const [k, v] of Object.entries(body)) {
    if (!(k in db.DEFAULTS)) return bad(res, "UNKNOWN_KEY", k);
    if (k === "fee_rate" && !(Number(v) >= 0 && Number(v) < 1)) return bad(res, "BAD_FEE_RATE");
    const ex = await db.get("SELECT key FROM settings WHERE key=?", [k]);
    if (ex) await db.run("UPDATE settings SET value=?, updated_at=? WHERE key=?", [String(v), db.NOW(), k]);
    else await db.run("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)", [k, String(v), db.NOW()]);
  }
  res.json(await db.all("SELECT * FROM settings ORDER BY key"));
}));

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
// 앱 화면 데모(온보딩 약관 동의 → 본인인증 → 모집/지원/결제/평가). RN 화면과 1:1로 대응한다.
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "app.html")));
app.get("/app", (req, res) => res.sendFile(path.join(__dirname, "app.html")));

app.use((err, req, res, next) => {
  console.error("[error]", err && err.message);
  res.status(500).json({ error: "SERVER_ERROR", message: String(err && err.message) });
});

module.exports = app;
if (require.main === module) {
  const port = Number(process.env.PORT || 4100);
  app.listen(port, () => console.log(`cleaning api on :${port}`));
}
