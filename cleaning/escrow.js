// cleaning/escrow.js — PG 분할정산(에스크로) 어댑터
// 플랫폼이 고객 대금을 직접 보관하지 않는다. 결제 시 PG에 예치(escrow)를 걸고,
// 작업 완료가 확인되면 작업자 몫과 중개 수수료로 분할정산(release)을 지시한다.
// 실 연동 전에는 dev 모드로 동작하며, PAY_MODE=live면 실제 PG 호출로 넘어간다.
const crypto = require("crypto");

const LIVE = process.env.PAY_MODE === "live";
const PROVIDER = process.env.PG_PROVIDER || (LIVE ? "escrow" : "dev");

async function escrow({ match_id, amount, pg_token }) {
  if (!(Number(amount) > 0)) return { ok: false, message: "결제 금액이 올바르지 않습니다." };
  if (!LIVE) return { ok: true, provider: "dev", pg_key: `dev_${match_id}_${crypto.randomBytes(6).toString("hex")}` };
  if (!pg_token) return { ok: false, message: "PG 결제 토큰이 없습니다." };
  // TODO: PG사 분할정산 예치 API 호출 (pg_token 승인 → 예치 키 반환)
  return { ok: false, message: "PG 연동이 설정되지 않았습니다." };
}

async function release({ pg_key, worker_amount, fee_amount }) {
  if (!pg_key) return { ok: false, message: "예치 건을 찾을 수 없습니다." };
  if (!LIVE) return { ok: true, provider: "dev", worker_amount, fee_amount };
  // TODO: PG사 분할정산 확정 API 호출 (작업자 계좌 지급 + 플랫폼 수수료)
  return { ok: false, message: "PG 연동이 설정되지 않았습니다." };
}

async function refund({ pg_key, amount, reason }) {
  if (!LIVE) return { ok: true, provider: "dev", amount, reason };
  return { ok: false, message: "PG 연동이 설정되지 않았습니다." };
}

module.exports = { escrow, release, refund, PROVIDER, LIVE };
