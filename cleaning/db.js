// cleaning/db.js — 청소 중개 플랫폼 스토리지 어댑터
//   DATABASE_URL 있으면 Postgres(pg), 없으면 better-sqlite3(로컬/테스트)
//   SQL은 ? 플레이스홀더로 쓰고 pg에서 $n으로 변환한다. 스키마만 방언 분기.
const PG_ENV_KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "NEON_DATABASE_URL"];
function findPgUrl() {
  for (const k of PG_ENV_KEYS) {
    const v = process.env[k];
    if (v && /^postgres(ql)?:\/\//.test(v)) return v;
  }
  return null;
}
const PG_URL = findPgUrl();
const usePg = !!PG_URL;

let _pg = null, _sq = null;
function pgPool() {
  if (!_pg) {
    const { Pool } = require("pg");
    _pg = new Pool({
      connectionString: PG_URL,
      max: Number(process.env.PG_POOL_MAX || 3),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      ssl: /localhost|127\.0\.0\.1/.test(PG_URL) ? false : { rejectUnauthorized: false },
    });
    _pg.on("error", (e) => console.error("[pg pool]", e.message));
  }
  return _pg;
}
let sqliteAvailable = true;
try { require.resolve("better-sqlite3"); } catch { sqliteAvailable = false; }
const NO_DB = () => {
  throw Object.assign(new Error("NO_DATABASE"),
    { hint: "DATABASE_URL 환경변수를 설정해 Postgres를 연결하세요." });
};
function sqlite() {
  if (!sqliteAvailable) NO_DB();
  if (!_sq) {
    const Database = require("better-sqlite3");
    const path = process.env.CLEANING_SQLITE_PATH ||
      (process.env.VERCEL ? "/tmp/cleaning.db" : __dirname + "/cleaning.db");
    _sq = new Database(path);
    _sq.pragma("journal_mode = DELETE");
  }
  return _sq;
}
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => "$" + ++i); };

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
    insert: async (sql, p = []) => Number(dbh.prepare(sql).run(...p).lastInsertRowid),
  };
}

let root;
if (usePg) root = wrap((sql, p) => pgPool().query(toPg(sql), p));
else if (sqliteAvailable) root = wrapSqlite(sqlite());
else root = { all: NO_DB, get: NO_DB, run: NO_DB, insert: NO_DB };

let _mutex = Promise.resolve();
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

const FOR_UPDATE = usePg ? " FOR UPDATE" : "";
// 시각은 전부 "YYYY-MM-DD HH:MM:SS" 한 형식으로만 저장한다 — 문자열 비교로 대소를 따지기 때문.
const AT = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const NOW = () => AT(Date.now());
const DAY = 86400000;

const ID = usePg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
const SCHEMA = `
-- 회원. role은 customer(고객) | worker(작업자) | admin.
-- ci_hash는 본인인증 고유값(CI)의 해시 — 원본은 저장하지 않는다. 재가입 차단의 유일한 키.
CREATE TABLE IF NOT EXISTS users (
  id ${ID},
  role TEXT NOT NULL,
  phone_enc TEXT NOT NULL,                  -- 암호화 저장
  phone_hash TEXT NOT NULL,                 -- 조회용 해시
  ci_hash TEXT NOT NULL,
  name TEXT, nickname TEXT, birth TEXT,
  status TEXT NOT NULL DEFAULT 'active',    -- active | suspended(이의신청 기간) | withdrawn
  status_reason TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT
);
-- 약관 동의 원장. 항목·버전·동의 여부·일시를 개별 행으로 남긴다(철회도 새 행).
CREATE TABLE IF NOT EXISTS consents (
  id ${ID}, user_id INTEGER NOT NULL,
  code TEXT NOT NULL, version TEXT NOT NULL,
  agreed INTEGER NOT NULL, agreed_at TEXT NOT NULL
);
-- 모집글. address_enc는 암호화 저장하고, 확정 전에는 동/구까지만 공개한다.
CREATE TABLE IF NOT EXISTS job_posts (
  id ${ID}, customer_id INTEGER NOT NULL,
  cleaning_type TEXT NOT NULL,              -- home | move_in | office | aircon ...
  scheduled_at TEXT NOT NULL,
  sido TEXT NOT NULL, sigungu TEXT NOT NULL, dong TEXT NOT NULL,
  address_enc TEXT NOT NULL,
  pyeong INTEGER NOT NULL DEFAULT 0,
  budget INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open | matched | completed | cancelled
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS applications (
  id ${ID}, post_id INTEGER NOT NULL, worker_id INTEGER NOT NULL,
  message TEXT, price INTEGER,
  status TEXT NOT NULL DEFAULT 'applied',   -- applied | selected | rejected | withdrawn
  created_at TEXT
);
-- 확정된 거래.
CREATE TABLE IF NOT EXISTS matches (
  id ${ID}, post_id INTEGER NOT NULL, customer_id INTEGER NOT NULL, worker_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'matched',   -- matched | working | completed | cancelled
  matched_at TEXT, completed_at TEXT, created_at TEXT
);
-- 결제(에스크로). 플랫폼은 대금을 보관하지 않고 PG 분할정산 예치만 건다.
CREATE TABLE IF NOT EXISTS payments (
  id ${ID}, match_id INTEGER NOT NULL, customer_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  pg_provider TEXT NOT NULL, pg_key TEXT,
  status TEXT NOT NULL DEFAULT 'escrowed',  -- escrowed | released | refunded | failed
  created_at TEXT, updated_at TEXT
);
-- 정산. 수수료율과 3.3% 원천징수는 정산 시점 값을 행에 박제한다.
CREATE TABLE IF NOT EXISTS settlements (
  id ${ID}, match_id INTEGER NOT NULL, payment_id INTEGER NOT NULL, worker_id INTEGER NOT NULL,
  gross INTEGER NOT NULL,
  fee_rate REAL NOT NULL, fee_amount INTEGER NOT NULL,
  withholding_rate REAL NOT NULL, withholding_amount INTEGER NOT NULL,
  payout_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid
  created_at TEXT, paid_at TEXT
);
-- 별점. voided=1이면 관리자가 무효 처리한 평가 — 제재 계산에서 제외된다.
CREATE TABLE IF NOT EXISTS ratings (
  id ${ID}, match_id INTEGER NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL, worker_id INTEGER NOT NULL,
  score INTEGER NOT NULL, reason TEXT, review TEXT,
  voided INTEGER NOT NULL DEFAULT 0, void_reason TEXT, voided_at TEXT,
  created_at TEXT
);
-- 제재 이력. warning은 알림만, withdraw는 7일 이의신청 후 탈퇴 확정.
CREATE TABLE IF NOT EXISTS sanctions (
  id ${ID}, user_id INTEGER NOT NULL,
  type TEXT NOT NULL,                       -- warning | withdraw
  rule TEXT NOT NULL,                       -- consecutive_ones | total_ones
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open | appealed | cancelled | executed
  appeal_text TEXT, appeal_at TEXT,
  appeal_deadline TEXT,
  admin_memo TEXT,
  created_at TEXT, resolved_at TEXT
);
-- 재가입 차단 목록. 해시된 CI만 보관한다(재가입 방지 목적의 최소 정보).
CREATE TABLE IF NOT EXISTS blacklist (
  id ${ID}, ci_hash TEXT NOT NULL UNIQUE, reason TEXT, sanction_id INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id ${ID}, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT, read_at TEXT, created_at TEXT
);
-- 신고(파손/도난/부적절 행위).
CREATE TABLE IF NOT EXISTS reports (
  id ${ID}, reporter_id INTEGER NOT NULL, target_user_id INTEGER, match_id INTEGER,
  kind TEXT NOT NULL, detail TEXT,
  status TEXT NOT NULL DEFAULT 'received',  -- received | reviewing | resolved | rejected
  admin_memo TEXT, created_at TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT
);
`;

const DEFAULTS = {
  fee_rate: "0.15",             // 중개 수수료 15% (작업자 정산에서 차감)
  withholding_rate: "0.033",    // 사업소득 원천징수 3.3%
  pg_provider: "dev",           // dev | escrow(PG 분할정산)
  appeal_days: "7",             // 자동 탈퇴 전 이의신청 기간
  new_worker_rating_count: "3", // 이 개수 미만이면 "신규" 뱃지
};

const ready = usePg || sqliteAvailable;
let _ready = null;
function init() {
  if (!ready) return Promise.reject(Object.assign(new Error("NO_DATABASE"),
    { hint: "DATABASE_URL 환경변수를 설정해 Postgres를 연결하세요." }));
  if (!_ready) _ready = (async () => {
    if (usePg) {
      for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean))
        await pgPool().query(stmt);
    } else {
      sqlite().exec(SCHEMA);
    }
    for (const [k, v] of Object.entries(DEFAULTS)) {
      const row = await root.get("SELECT key FROM settings WHERE key=?", [k]);
      if (!row) await root.run("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)", [k, v, NOW()]);
    }
  })();
  return _ready;
}

async function setting(key) {
  const r = await root.get("SELECT value FROM settings WHERE key=?", [key]);
  return r ? r.value : DEFAULTS[key];
}

module.exports = { ...root, tx, init, setting, DEFAULTS, FOR_UPDATE, NOW, AT, DAY, usePg, ready };
