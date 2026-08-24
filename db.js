// db.js — 스토리지 어댑터
//   DATABASE_URL 있으면 Postgres(pg) — Vercel 배포용 (Neon/Vercel Postgres)
//   없으면 better-sqlite3 — 로컬 개발용. Vercel에서 DATABASE_URL 미설정 시 /tmp SQLite(휘발성, 데모 전용)
// SQL은 ? 플레이스홀더로 작성 → pg에서 $n으로 자동 변환. 스키마만 방언 분기.

// Neon/Supabase/Vercel 연동은 변수명이 제각각(DATABASE_URL, POSTGRES_URL, ...)이라 전부 훑는다
const PG_ENV_KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "NEON_DATABASE_URL"];
function findPgUrl() {
  for (const k of PG_ENV_KEYS) {
    const v = process.env[k];
    if (v && /^postgres(ql)?:\/\//.test(v)) return v;
  }
  // 위 목록에 없는 이름이어도 postgres 연결 문자열이면 사용
  for (const [k, v] of Object.entries(process.env))
    if (typeof v === "string" && /^postgres(ql)?:\/\//.test(v)) return v;
  return null;
}
const PG_URL = findPgUrl();
const usePg = !!PG_URL;

let _pg = null, _sq = null;
function pgPool() {
  if (!_pg) {
    const { Pool } = require("pg");
    _pg = new Pool({ connectionString: PG_URL,
      ssl: /localhost|127\.0\.0\.1/.test(PG_URL) ? false : { rejectUnauthorized: false } });
  }
  return _pg;
}
// better-sqlite3는 네이티브 모듈이라 배포 환경에 없을 수 있음 → 크래시 대신 명확히 안내
let sqliteAvailable = true;
try { require.resolve("better-sqlite3"); } catch { sqliteAvailable = false; }
const NO_DB = () => {
  throw Object.assign(new Error("NO_DATABASE"),
    { hint: "DATABASE_URL 환경변수를 설정해 Postgres를 연결하세요 (Vercel: Storage → Postgres)." });
};

function sqlite() {
  if (!sqliteAvailable) NO_DB();
  if (!_sq) {
    const Database = require("better-sqlite3");
    const path = process.env.SQLITE_PATH || (process.env.VERCEL ? "/tmp/data.db" : __dirname + "/data.db");
    _sq = new Database(path);
    _sq.pragma("journal_mode = DELETE");
  }
  return _sq;
}

const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => "$" + ++i); };

// ---- 쿼리 인터페이스 (풀/커넥션 공용) ----
function wrap(exec) {
  return {
    all: async (sql, p = []) => exec(sql, p).then((r) => r.rows),
    get: async (sql, p = []) => exec(sql, p).then((r) => r.rows[0]),
    run: async (sql, p = []) => exec(sql, p).then((r) => ({ changes: r.rowCount ?? 0 })),
    insert: async (sql, p = []) => exec(sql + " RETURNING id", p).then((r) => r.rows[0].id),
  };
}
function wrapSqlite(dbh) {
  return {
    all: async (sql, p = []) => dbh.prepare(sql).all(...p),
    get: async (sql, p = []) => dbh.prepare(sql).get(...p),
    run: async (sql, p = []) => { const r = dbh.prepare(sql).run(...p); return { changes: r.changes }; },
    insert: async (sql, p = []) => dbh.prepare(sql).run(...p).lastInsertRowid,
  };
}

let root;
if (usePg) root = wrap((sql, p) => pgPool().query(toPg(sql), p));
else if (sqliteAvailable) root = wrapSqlite(sqlite());
// SQLite 모듈도 DATABASE_URL도 없으면(배포 초기 상태) 서버는 정상 기동하고 /health가 원인을 알려준다
else root = { all: NO_DB, get: NO_DB, run: NO_DB, insert: NO_DB };

// ---- 트랜잭션 ----
let _mutex = Promise.resolve(); // sqlite: 프로세스 내 직렬화
async function tx(fn) {
  if (usePg) {
    const client = await pgPool().connect();
    const c = wrap((sql, p) => client.query(toPg(sql), p));
    try {
      await client.query("BEGIN");
      const out = await fn(c);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { client.release(); }
  }
  // sqlite
  if (!sqliteAvailable) NO_DB();
  const prev = _mutex;
  let release; _mutex = new Promise((r) => (release = r));
  await prev;
  const dbh = sqlite();
  const c = wrapSqlite(dbh);
  try {
    dbh.exec("BEGIN IMMEDIATE");
    const out = await fn(c);
    dbh.exec("COMMIT");
    return out;
  } catch (e) {
    try { dbh.exec("ROLLBACK"); } catch {}
    throw e;
  } finally { release(); }
}

// pg 행 잠금 접미사 (sqlite는 BEGIN IMMEDIATE로 전체 잠금)
const FOR_UPDATE = usePg ? " FOR UPDATE" : "";
// created_at 저장은 양쪽 다 'YYYY-MM-DD HH:MM:SS' UTC 텍스트 → 날짜 비교는 substr로 통일
const NOW = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const TODAY = () => new Date().toISOString().slice(0, 10);

// ---- 스키마 ----
const ID = usePg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id ${ID}, phone TEXT UNIQUE NOT NULL, nickname TEXT, birth TEXT,
  points INTEGER NOT NULL DEFAULT 0, welcome_used INTEGER NOT NULL DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS phone_codes (
  phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS packs (
  id ${ID}, name TEXT NOT NULL, price INTEGER NOT NULL, point_price INTEGER DEFAULT 0,
  is_welcome INTEGER NOT NULL DEFAULT 0, total_slots INTEGER NOT NULL,
  sold_slots INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, image TEXT
);
CREATE TABLE IF NOT EXISTS hits (
  id ${ID}, pack_id INTEGER NOT NULL, name TEXT NOT NULL, grade TEXT NOT NULL,
  image TEXT, total_qty INTEGER NOT NULL, remaining INTEGER NOT NULL,
  point_value INTEGER NOT NULL, cost INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS guaranteed (
  id ${ID}, pack_id INTEGER NOT NULL, slot_no INTEGER NOT NULL, name TEXT NOT NULL,
  image TEXT, point_value INTEGER NOT NULL DEFAULT 0, awarded_user INTEGER
);
CREATE TABLE IF NOT EXISTS point_pool (
  id ${ID}, pack_id INTEGER NOT NULL, name TEXT NOT NULL, rarity TEXT NOT NULL,
  image TEXT, weight INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS owned_cards (
  id ${ID}, user_id INTEGER NOT NULL, name TEXT NOT NULL, grade TEXT NOT NULL,
  image TEXT, point_value INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'owned',
  pack_name TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS point_logs (
  id ${ID}, user_id INTEGER NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id ${ID}, user_id INTEGER NOT NULL, pack_id INTEGER NOT NULL, amount INTEGER NOT NULL,
  method TEXT NOT NULL, pg_key TEXT, status TEXT NOT NULL DEFAULT 'paid', created_at TEXT
);
CREATE TABLE IF NOT EXISTS shipments (
  id ${ID}, user_id INTEGER NOT NULL, card_ids TEXT NOT NULL, address TEXT NOT NULL,
  fee INTEGER NOT NULL DEFAULT 3500, fee_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested', tracking TEXT, created_at TEXT
);

-- ================= 마켓 (통신판매중개 / 중앙 검수) =================
-- 운영 정책값. 관리자 페이지에서 수정 가능하며, 주문 생성 시점의 값을 주문 행에 박제한다.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT
);

-- 판매자 정산 계좌 / 반송지. users를 건드리지 않기 위해 별도 테이블로 분리.
CREATE TABLE IF NOT EXISTS seller_profiles (
  user_id INTEGER PRIMARY KEY, bank TEXT, account TEXT, holder TEXT,
  return_address TEXT, return_phone TEXT, created_at TEXT, updated_at TEXT
);

-- 판매 등록. product_key는 시세 집계 단위 (카드명|세트|등급 정규화).
CREATE TABLE IF NOT EXISTS listings (
  id ${ID}, seller_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'single',      -- single | box
  title TEXT NOT NULL, card_set TEXT, grade TEXT, condition TEXT,
  product_key TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  ask_price INTEGER NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',    -- active | reserved | sold | cancelled
  created_at TEXT, updated_at TEXT
);

-- 에스크로 주문. 구매 대금은 Piku가 보관하고 검수 통과 후에만 판매자에게 정산한다.
CREATE TABLE IF NOT EXISTS market_orders (
  id ${ID}, order_uid TEXT UNIQUE NOT NULL,
  listing_id INTEGER NOT NULL, buyer_id INTEGER NOT NULL, seller_id INTEGER NOT NULL,
  product_key TEXT NOT NULL, title TEXT NOT NULL,
  item_price INTEGER NOT NULL,
  fee_rate REAL NOT NULL, fee_amount INTEGER NOT NULL,   -- 판매 수수료 (판매자 부담)
  inspection_fee INTEGER NOT NULL DEFAULT 0,             -- 검수비 (판매자 부담)
  shipping_fee INTEGER NOT NULL DEFAULT 0,               -- 구매자 부담 배송비
  buyer_total INTEGER NOT NULL,                          -- 구매자 결제액 = item_price + shipping_fee
  payout_amount INTEGER NOT NULL,                        -- 판매자 정산액 = item_price - fee - inspection_fee
  status TEXT NOT NULL DEFAULT 'paid',
  -- paid → awaiting_inbound → inbound → inspecting → passed → shipped → completed
  --                                              └→ failed → refunded
  --  전 단계 취소 시 → refunded
  pg_key TEXT, buyer_address TEXT, out_tracking TEXT,
  fail_reason TEXT,
  created_at TEXT, updated_at TEXT
);

-- 판매자 → 검수센터 입고. 박스에 적는 식별자가 inbound_code.
-- 코드 없는/판독 불가 박스는 order_id NULL + status='unmatched'로 등록해 나중에 수동 매칭한다.
CREATE TABLE IF NOT EXISTS inbound_shipments (
  id ${ID}, order_id INTEGER, seller_id INTEGER,
  inbound_code TEXT, carrier TEXT NOT NULL DEFAULT 'hanjin',
  pickup_address TEXT, pickup_phone TEXT, pickup_date TEXT,
  tracking TEXT,
  status TEXT NOT NULL DEFAULT 'requested', -- requested | picked_up | received | unmatched | discarded
  note TEXT, photo TEXT,
  received_at TEXT, created_at TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS inspections (
  id ${ID}, order_id INTEGER NOT NULL, inspector TEXT,
  result TEXT NOT NULL,                     -- pass | fail
  reason TEXT, photos TEXT NOT NULL DEFAULT '[]', created_at TEXT
);

-- 환불 원장. PG 취소는 실패할 수 있으므로 시도를 반드시 기록하고, 성공한 뒤에만
-- 주문 상태를 refunded로 바꾼다. pg_key 단위 중복 취소를 막는 역할도 겸한다.
CREATE TABLE IF NOT EXISTS refunds (
  id ${ID}, kind TEXT NOT NULL,              -- pack | market
  order_id INTEGER, order_ref TEXT,
  pg_key TEXT, amount INTEGER NOT NULL, reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | done | failed
  pg_response TEXT, created_at TEXT, done_at TEXT
);

CREATE TABLE IF NOT EXISTS payouts (
  id ${ID}, order_id INTEGER NOT NULL, seller_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | paid | cancelled
  bank TEXT, account TEXT, holder TEXT,
  approved_at TEXT, paid_at TEXT, memo TEXT, created_at TEXT
);
`;

// 마켓 기본 정책값 — 관리자 페이지에서 변경 가능. 주문 시점 값이 주문 행에 복사된다.
const MARKET_DEFAULTS = {
  market_fee_rate: "0.08",        // 판매 수수료 8% (판매자 부담)
  market_inspection_fee: "0",     // 검수비 무료
  market_shipping_fee: "3500",    // 검수센터 → 구매자 배송비 (구매자 부담)
  market_enabled: "1",
};

async function seed() {
  const c = root;
  // 마켓 정책값은 팩 시드 여부와 무관하게 항상 보정 (신규 키가 추가돼도 자동 반영)
  for (const [k, v] of Object.entries(MARKET_DEFAULTS)) {
    const row = await c.get("SELECT key FROM settings WHERE key=?", [k]);
    if (!row) await c.run("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)", [k, v, NOW()]);
  }
  const cnt = await c.get("SELECT COUNT(*) AS c FROM packs");
  if (Number(cnt.c) > 0) return;

  const pack = (name, price, pp, w, slots, img) =>
    c.insert("INSERT INTO packs (name, price, point_price, is_welcome, total_slots, image) VALUES (?,?,?,?,?,?)",
      [name, price, pp, w, slots, img]);
  const hit = (pid, name, img, qty, pv, cost) =>
    c.run("INSERT INTO hits (pack_id, name, grade, image, total_qty, remaining, point_value, cost) VALUES (?,?,'HIT',?,?,?,?,?)",
      [pid, name, img, qty, qty, pv, cost]);
  const g = (pid, no, name, img, pv) =>
    c.run("INSERT INTO guaranteed (pack_id, slot_no, name, image, point_value) VALUES (?,?,?,?,?)", [pid, no, name, img, pv]);
  const pool = (pid, name, r, img, w) =>
    c.run("INSERT INTO point_pool (pack_id, name, rarity, image, weight) VALUES (?,?,?,?,?)", [pid, name, r, img, w]);

  const p5 = await pack("스타터 랜덤팩", 5000, 0, 0, 200, "pack_5000");
  await hit(p5, "피카츄 AR", "pikachu_ar", 5, 25000, 28000);
  await hit(p5, "이브이 SR", "eevee_sr", 3, 40000, 45000);
  await hit(p5, "리자몽 EX", "charizard_ex", 1, 120000, 130000);
  for (const n of [50, 100, 150, 200]) await g(p5, n, "[JP] 메가 하이클래스팩 박스", "box_mega", 60000);

  const p10 = await pack("레귤러 랜덤팩", 10000, 0, 0, 300, "pack_10000");
  await hit(p10, "뮤 EX", "mew_ex", 4, 60000, 70000);
  await hit(p10, "리자몽 SAR", "charizard_sar", 2, 180000, 200000);
  await hit(p10, "이상해꽃 SAR", "venusaur_sar", 2, 90000, 100000);
  for (const n of [75, 150, 225, 300]) await g(p10, n, "[JP] 하이클래스팩 박스 ×2", "box_double", 120000);

  const p50 = await pack("프리미엄 랜덤팩", 50000, 0, 0, 100, "pack_50000");
  await hit(p50, "리자몽 SAR (PSA10)", "charizard_psa10", 1, 900000, 950000);
  await hit(p50, "뮤츠 UR", "mewtwo_ur", 2, 350000, 380000);
  await hit(p50, "피카츄 프로모", "pikachu_promo", 5, 120000, 130000);
  for (const n of [50, 100]) await g(p50, n, "[JP] 박스 세트 + 슬리브", "box_set", 500000);

  const pw = await pack("웰컴 팩", 0, 1000, 1, 500, "pack_welcome");
  await hit(pw, "피카츄 프로모(웰컴)", "pikachu_welcome", 20, 5000, 3000);

  for (const pid of [p5, p10, p50, pw]) {
    await pool(pid, "꼬부기", "common", "squirtle", 30);
    await pool(pid, "파이리", "common", "charmander", 30);
    await pool(pid, "이상해씨", "common", "bulbasaur", 30);
    await pool(pid, "피카츄", "uncommon", "pikachu", 15);
    await pool(pid, "이브이", "uncommon", "eevee", 15);
    await pool(pid, "망나뇽", "rare", "dragonite", 5);
    await pool(pid, "갸라도스", "rare", "gyarados", 5);
  }
}

const ready = usePg || sqliteAvailable; // DB 사용 가능 여부

let _ready = null;
function init() {
  if (!ready) return Promise.reject(Object.assign(new Error("NO_DATABASE"),
    { hint: "DATABASE_URL 환경변수를 설정해 Postgres를 연결하세요 (Vercel: Storage → Postgres)." }));
  if (!_ready) _ready = (async () => {
    if (usePg) {
      for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean))
        await pgPool().query(stmt);
    } else {
      sqlite().exec(SCHEMA);
    }
    await seed();
  })();
  return _ready;
}

module.exports = { ...root, tx, init, FOR_UPDATE, NOW, TODAY, usePg, ready };
