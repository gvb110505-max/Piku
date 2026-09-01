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
  point_value INTEGER NOT NULL, cost INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'hit'          -- heavy | hit (상품 구성표 묶음)
);
CREATE TABLE IF NOT EXISTS guaranteed (
  id ${ID}, pack_id INTEGER NOT NULL, slot_no INTEGER NOT NULL, name TEXT NOT NULL,
  image TEXT, point_value INTEGER NOT NULL DEFAULT 0, awarded_user INTEGER,
  kind TEXT NOT NULL DEFAULT 'guaranteed'   -- guaranteed | last_one(마지막 1구 상품)
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

-- 본인확인 결과. 생년월일의 유일한 신뢰 출처(single source of truth)다.
-- users.birth는 가입 시 자기 입력값이라 신뢰하지 않는다 — 여기에 행이 있어야 "인증된 나이"다.
-- ci/di는 통신사 본인확인의 연계정보. 중복가입 판별과 재인증 대조에 쓴다.
CREATE TABLE IF NOT EXISTS identity_verifications (
  id ${ID}, user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,                    -- pass | admin_manual | dev
  ci TEXT, di TEXT, name TEXT, birth TEXT, gender TEXT, phone TEXT,
  verified_at TEXT NOT NULL, memo TEXT, created_at TEXT
);

-- 환불 원장. PG 취소는 실패할 수 있으므로 시도를 반드시 기록하고, 성공한 뒤에만
-- 주문 상태를 refunded로 바꾼다. pg_key 단위 중복 취소를 막는 역할도 겸한다.
-- 업로드 이미지. 팩/HIT/POINT 카드의 아트를 관리자가 교체할 수 있게 한다.
-- 본문은 base64로 들고, 참조하는 쪽(packs.image 등)은 "/images/<id>" 경로만 저장한다.
-- 그래야 /packs 응답이 이미지 때문에 무거워지지 않고, 브라우저가 이미지를 캐시할 수 있다.
CREATE TABLE IF NOT EXISTS images (
  id ${ID}, mime TEXT NOT NULL, data TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0, label TEXT, created_at TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id ${ID}, kind TEXT NOT NULL,              -- pack | market
  order_id INTEGER, order_ref TEXT,
  pg_key TEXT, amount INTEGER NOT NULL, reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | done | failed
  pg_response TEXT, created_at TEXT, done_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_links (
  id ${ID},
  uid TEXT NOT NULL UNIQUE,                  -- 주문번호 = 결제 링크에 적히는 코드 (입금자명 대조 키)
  kind TEXT NOT NULL,                        -- pack | market
  user_id INTEGER NOT NULL,
  ref_id INTEGER,                            -- pack_id | listing_id
  title TEXT,
  amount INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual',   -- link(주문서 링크) | manual(무통장) | dev
  pay_url TEXT,
  payload TEXT,                              -- 확정 시 필요한 부가 정보(JSON) — 예: 배송지
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | paid | expired | cancelled | failed
  expires_at TEXT,                           -- 이 시각까지만 슬롯을 잡아둔다
  paid_at TEXT, closed_at TEXT,
  pg_key TEXT,                               -- 제공자 거래번호 (환불 대조용)
  payer_name TEXT,                           -- 입금자명 — 수동 대조 키
  confirmed_by TEXT,                         -- webhook | admin:<id> | dev
  result TEXT,                               -- 확정 결과(JSON) — order_id, 개봉 카드 등
  fail_reason TEXT,
  created_at TEXT
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
  // 0 = 유예. 기존 가입자는 저장된 생년월일을 그대로 인정한다(서비스 중단 방지).
  // 1 = 강제. 본인확인을 마친 유저만 성인으로 취급하고, 미인증자는 전원 미성년자 한도가 적용된다.
  identity_required: "0",

  // ---- 링크 결제(블로그페이 방식) ----
  // 앱에 PG SDK를 넣지 않는다. 서버가 주문번호를 만들고 결제 링크를 내려주면
  // 구매자가 그 링크에서 결제하고, 입금이 확인된 시점에 상품이 확정된다.
  pay_provider: "manual",         // link = 주문서 링크 / manual = 무통장 입금 / dev = 테스트 자동승인
  pay_link_template: "",          // 예: https://blogpay.co.kr/order/xxxx?amount={amount}&memo={uid}
  pay_bank: "",                   // manual일 때 안내할 입금 계좌 (은행 예금주 계좌번호)
  pay_hold_minutes: "20",         // 결제 대기 동안 슬롯을 잡아두는 시간
  pay_webhook_secret: "",         // 웹훅 검증용 공유 비밀 (비어 있으면 웹훅 비활성)
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

  await require("./catalog").insertCatalog(c);
}

const ready = usePg || sqliteAvailable; // DB 사용 가능 여부

let _ready = null;
// 컬럼 추가 마이그레이션. CREATE TABLE IF NOT EXISTS는 기존 테이블에 컬럼을
// 붙여주지 않으므로, 추가되는 컬럼은 여기서 멱등하게 ALTER 한다.
// 이미 있으면 DB가 에러를 내는데 그건 정상이라 삼킨다.
const ADD_COLUMNS = [
  // 정가 — 할인 표시용. 비어 있으면 할인 UI를 띄우지 않는다.
  ["packs", "list_price", "INTEGER"],
  // 팩별 결제 링크(블로그페이 주문서 URL). 비어 있으면 기본 링크/무통장 안내로 떨어진다.
  ["packs", "pay_url", "TEXT"],
  // 라스트원(마지막 1구 상품)과 일반 보장을 구분한다
  ["guaranteed", "kind", "TEXT NOT NULL DEFAULT 'guaranteed'"],
  // 카탈로그 리셋으로 물러난 옛 팩. 주문 이력이 있어 지우지 않고 숨긴다.
  ["packs", "archived", "INTEGER NOT NULL DEFAULT 0"],
  // HEAVY HITS / HITS 구분. 상품 구성표를 등급대로 묶어 보여주는 데 쓴다.
  ["hits", "tier", "TEXT NOT NULL DEFAULT 'hit'"],
];
async function migrate() {
  for (const [table, col, type] of ADD_COLUMNS) {
    const sql = `ALTER TABLE ${table} ADD COLUMN ${col} ${type}`;
    try {
      if (usePg) await pgPool().query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      else sqlite().exec(sql);
    } catch (e) {
      if (!/duplicate column|already exists/i.test(String(e && e.message))) throw e;
    }
  }
}

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
    await migrate();
    await seed();
  })();
  return _ready;
}

module.exports = { ...root, tx, init, FOR_UPDATE, NOW, TODAY, usePg, ready };
