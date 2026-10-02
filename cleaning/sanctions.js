// cleaning/sanctions.js — 별점 기반 자동 제재 엔진
// 규칙(요구사항 6):
//   탈퇴: 최근 유효 평가 3개가 연속 1점  |  누적 유효 1점 평가 5회
//   경고: 한 단계 전 (연속 1점 2회 / 누적 1점 4회)
// 무효 처리된 평가(voided=1)는 모든 계산에서 빠진다 — 그래서 평가 무효 후
// 다시 evaluate()를 돌리면 열려 있던 탈퇴 예정 제재가 자동으로 취소된다.
const db = require("./db");

const CONSECUTIVE_LIMIT = 3;
const TOTAL_LIMIT = 5;

async function stats(c, workerId) {
  const rows = await c.all(
    "SELECT id, score FROM ratings WHERE worker_id=? AND voided=0 ORDER BY id DESC", [workerId]);
  let consecutive = 0;
  for (const r of rows) { if (Number(r.score) === 1) consecutive++; else break; }
  const totalOnes = rows.filter((r) => Number(r.score) === 1).length;
  const count = rows.length;
  const avg = count ? rows.reduce((s, r) => s + Number(r.score), 0) / count : 0;
  return { consecutive, totalOnes, count, avg: Math.round(avg * 100) / 100 };
}

async function notify(c, userId, kind, title, body) {
  await c.run("INSERT INTO notifications (user_id, kind, title, body, created_at) VALUES (?,?,?,?,?)",
    [userId, kind, title, body || "", db.NOW()]);
}

// 평가 등록/무효 이후에 호출한다. 같은 트랜잭션 커넥션(c)을 받아 원자적으로 처리한다.
async function evaluate(c, workerId) {
  const s = await stats(c, workerId);
  const open = await c.get(
    "SELECT * FROM sanctions WHERE user_id=? AND type='withdraw' AND status IN ('open','appealed')", [workerId]);

  const hit = s.consecutive >= CONSECUTIVE_LIMIT ? "consecutive_ones"
    : s.totalOnes >= TOTAL_LIMIT ? "total_ones" : null;

  if (hit) {
    if (open) return { ...s, sanction: open, action: "already_open" };
    const days = Number(await db.setting("appeal_days"));
    const deadline = db.AT(Date.now() + days * db.DAY);
    const detail = hit === "consecutive_ones"
      ? `최근 평가 ${s.consecutive}개 연속 1점`
      : `누적 1점 평가 ${s.totalOnes}회`;
    const id = await c.insert(
      `INSERT INTO sanctions (user_id, type, rule, detail, status, appeal_deadline, created_at)
       VALUES (?,?,?,?,'open',?,?)`, [workerId, "withdraw", hit, detail, deadline, db.NOW()]);
    await c.run("UPDATE users SET status='suspended', status_reason=?, updated_at=? WHERE id=?",
      [detail, db.NOW(), workerId]);
    await notify(c, workerId, "sanction_withdraw", "자동 탈퇴 예정 안내",
      `${detail}으로 자동 탈퇴 대상이 되었습니다. ${deadline}까지 이의신청할 수 있습니다.`);
    return { ...s, sanction: { id, rule: hit, detail, appeal_deadline: deadline }, action: "withdraw_pending" };
  }

  // 조건이 풀렸는데 탈퇴 예정이 열려 있으면(=평가 무효 처리 결과) 자동 취소
  if (open) {
    await c.run("UPDATE sanctions SET status='cancelled', admin_memo=?, resolved_at=? WHERE id=?",
      ["평가 무효 처리로 제재 조건 미충족", db.NOW(), open.id]);
    await c.run("UPDATE users SET status='active', status_reason=NULL, updated_at=? WHERE id=?",
      [db.NOW(), workerId]);
    await notify(c, workerId, "sanction_cancelled", "제재 취소 안내",
      "이의신청 또는 평가 무효 처리로 자동 탈퇴 대상에서 제외되었습니다.");
    return { ...s, action: "cancelled" };
  }

  const warn = s.consecutive === CONSECUTIVE_LIMIT - 1 ? "consecutive_ones"
    : s.totalOnes === TOTAL_LIMIT - 1 ? "total_ones" : null;
  if (warn) {
    // 같은 규칙의 경고를 이미 보냈으면 중복 발송하지 않는다
    const dup = await c.get(
      "SELECT id FROM sanctions WHERE user_id=? AND type='warning' AND rule=? AND detail=?",
      [workerId, warn, String(warn === "consecutive_ones" ? s.consecutive : s.totalOnes)]);
    if (!dup) {
      await c.insert(
        `INSERT INTO sanctions (user_id, type, rule, detail, status, created_at)
         VALUES (?,?,?,?,'open',?)`,
        [workerId, "warning", warn, String(warn === "consecutive_ones" ? s.consecutive : s.totalOnes), db.NOW()]);
      const msg = warn === "consecutive_ones"
        ? `최근 평가 ${s.consecutive}개가 연속 1점입니다. 1점을 한 번 더 받으면 자동 탈퇴됩니다.`
        : `누적 1점 평가가 ${s.totalOnes}회입니다. 1회 더 받으면 자동 탈퇴됩니다.`;
      await notify(c, workerId, "sanction_warning", "경고 알림", msg);
    }
    return { ...s, action: "warned" };
  }
  return { ...s, action: "none" };
}

// 이의신청 기간이 끝난 탈퇴 예정 건을 확정한다(관리자 페이지 버튼 / 배치).
// 확정 시 해시된 CI만 블랙리스트에 남기고 계정은 withdrawn으로 바꾼다.
async function executeDue(c, now = db.NOW()) {
  const due = await c.all(
    "SELECT * FROM sanctions WHERE type='withdraw' AND status IN ('open','appealed') AND appeal_deadline <= ?", [now]);
  const done = [];
  for (const s of due) done.push(await execute(c, s));
  return done;
}

async function execute(c, sanction) {
  const u = await c.get("SELECT * FROM users WHERE id=?", [sanction.user_id]);
  await c.run("UPDATE users SET status='withdrawn', status_reason=?, updated_at=? WHERE id=?",
    [sanction.detail, db.NOW(), sanction.user_id]);
  const exists = await c.get("SELECT id FROM blacklist WHERE ci_hash=?", [u.ci_hash]);
  if (!exists) {
    await c.run("INSERT INTO blacklist (ci_hash, reason, sanction_id, created_at) VALUES (?,?,?,?)",
      [u.ci_hash, sanction.detail, sanction.id, db.NOW()]);
  }
  await c.run("UPDATE sanctions SET status='executed', resolved_at=? WHERE id=?", [db.NOW(), sanction.id]);
  await notify(c, sanction.user_id, "withdrawn", "자동 탈퇴 확정",
    `${sanction.detail}으로 계정이 탈퇴 처리되었습니다. 동일한 본인인증 정보로는 재가입할 수 없습니다.`);
  return { sanction_id: sanction.id, user_id: sanction.user_id };
}

// 악용 패턴: 같은 고객이 특정 작업자(또는 전반)에게 1점만 반복해서 주는 경우를 관리자에게 표시
async function abusePatterns(c, minOnes = 3) {
  const rows = await c.all(
    `SELECT customer_id,
            COUNT(*) AS total,
            SUM(CASE WHEN score=1 THEN 1 ELSE 0 END) AS ones
       FROM ratings WHERE voided=0 GROUP BY customer_id`);
  return rows
    .map((r) => ({ customer_id: r.customer_id, total: Number(r.total), ones: Number(r.ones),
      one_ratio: Number(r.total) ? Math.round((Number(r.ones) / Number(r.total)) * 100) / 100 : 0 }))
    .filter((r) => r.ones >= minOnes && r.one_ratio >= 0.8)
    .sort((a, b) => b.ones - a.ones);
}

module.exports = { evaluate, stats, executeDue, execute, abusePatterns, notify, CONSECUTIVE_LIMIT, TOTAL_LIMIT };
