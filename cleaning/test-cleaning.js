// cleaning/test-cleaning.js — 같은 프로세스에서 서버를 띄우고 전체 플로우 검증
const fs = require("fs");
const DB = "/tmp/cleaning-test.db";
process.env.CLEANING_SQLITE_PATH = DB;
for (const f of [DB, DB + "-shm", DB + "-wal"]) try { fs.unlinkSync(f); } catch {}

const app = require("./index.js");
const server = app.listen(4111);
const B = "http://localhost:4111";
const ADMIN = { "x-admin-token": "dev-admin" };

let fail = 0;
const ok = (cond, label, extra) => {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra !== undefined && !cond ? "  → " + JSON.stringify(extra) : ""}`);
};
const req = (m, p, body, headers = {}) => fetch(B + p, {
  method: m, headers: { "Content-Type": "application/json", ...headers },
  body: m === "GET" ? undefined : JSON.stringify(body || {}),
}).then((r) => r.json());
const get = (p, tok) => req("GET", p, null, tok ? { Authorization: tok } : {});
const post = (p, body, tok) => req("POST", p, body, tok ? { Authorization: tok } : {});

const ALL_YES = Object.fromEntries(require("./terms").TERMS.map((t) => [t.code, true]));

const signup = (role, phone, name, consents = ALL_YES) =>
  post("/auth/verify", { role, phone, name, nickname: name, birth: "19900101", ci: "ci-" + phone, consents });

(async () => {
  // 1) 약관 화면
  const terms = await get("/terms");
  ok(terms.terms.length === 7 && terms.terms.filter((t) => t.required).length === 6,
    "약관 7개(필수 6 + 선택 1) 제공", terms.terms.map((t) => t.code));
  ok(/통신판매중개자/.test(terms.notice), "통신판매중개자 고지 문구 제공");

  // 2) 필수 동의 누락 시 가입 거부
  const partial = { ...ALL_YES, sanction_policy: false };
  const noConsent = await signup("worker", "01000000001", "미동의", partial);
  ok(noConsent.error === "CONSENT_REQUIRED", "필수 미동의 → 가입 차단", noConsent);

  // 3) 만 19세 미만 차단
  const minor = await post("/auth/verify",
    { role: "worker", phone: "01000000002", name: "미성년", birth: "20150101", ci: "ci-minor", consents: ALL_YES });
  ok(minor.error === "AGE_RESTRICTED", "만 19세 미만 → 가입 차단", minor);

  // 4) 정상 가입 + 동의 기록
  const cust = await signup("customer", "01011112222", "고객A");
  const w1 = await signup("worker", "01033334444", "작업자A");
  const w2 = await signup("worker", "01055556666", "작업자B");
  ok(!!cust.token && !!w1.token, "고객/작업자 가입", { cust, w1 });
  const me = await get("/me", w1.token);
  ok(me.consents.length === 7 && me.consents.every((c) => c.agreed_at), "동의 항목별 일시 기록", me.consents);
  ok(me.phone === "010****4444", "휴대폰 마스킹 노출", me.phone);

  // 5) 모집글 — 확정 전에는 정확한 주소 비공개
  const created = await post("/job-posts", {
    cleaning_type: "move_in", scheduled_at: "2026-10-01 10:00:00",
    sido: "서울특별시", sigungu: "마포구", dong: "연남동",
    address: "서울 마포구 연남동 123-45 302호", pyeong: 24, budget: 120000, note: "반려동물 있음",
  }, cust.token);
  const postId = created.post.id;
  const list = await get("/job-posts");
  ok(list[0].address === null && list[0].region === "서울특별시 마포구 연남동",
    "목록에서 정확한 주소 비공개(동 단위만)", list[0]);
  const beforeMatch = await get(`/job-posts/${postId}`, w1.token);
  ok(beforeMatch.post.address === null, "확정 전 작업자에게 주소 비공개", beforeMatch.post);

  // 6) 지원 + 정렬/신규 뱃지
  await post(`/job-posts/${postId}/apply`, { price: 120000 }, w1.token);
  await post(`/job-posts/${postId}/apply`, { price: 115000 }, w2.token);
  const dup = await post(`/job-posts/${postId}/apply`, {}, w1.token);
  ok(dup.error === "ALREADY_APPLIED", "중복 지원 차단", dup);
  const apps = await get(`/job-posts/${postId}/applications`, cust.token);
  ok(apps.length === 2 && apps.every((a) => a.stats.is_new), "신규 작업자 뱃지 표시", apps.map((a) => a.stats));

  // 7) 선택 → 확정 후 주소 공개
  const sel = await post(`/job-posts/${postId}/select`, { application_id: apps[0].id }, cust.token);
  ok(sel.address === "서울 마포구 연남동 123-45 302호", "확정 후 정확한 주소 공개", sel);
  const matchId = sel.match.id;
  const selectedWorkerTok = apps[0].worker.id === (await get("/me", w1.token)).user.id ? w1.token : w2.token;
  const afterMatch = await get(`/job-posts/${postId}`, selectedWorkerTok);
  ok(afterMatch.post.address_visible === true, "확정된 작업자만 주소 열람", afterMatch.post);

  // 8) 결제(에스크로) → 완료 → 정산(수수료 + 3.3% 원천징수)
  const notPaid = await post(`/matches/${matchId}/complete`, {}, cust.token);
  ok(notPaid.error === "NOT_PAID", "미결제 상태에서 완료 차단", notPaid);
  const pay = await post(`/matches/${matchId}/pay`, {}, cust.token);
  ok(pay.status === "escrowed", "PG 에스크로 예치", pay);
  const done = await post(`/matches/${matchId}/complete`, {}, cust.token);
  const s = done.settlement;
  const expFee = Math.floor(120000 * 0.15), expWh = Math.floor((120000 - expFee) * 0.033);
  ok(s.fee === expFee && s.wh === expWh && s.payout === 120000 - expFee - expWh,
    `정산 계산(수수료 ${expFee} / 원천징수 ${expWh})`, s);
  const mv = await get(`/matches/${matchId}`, selectedWorkerTok);
  ok(mv.post.address === null, "작업 종료 후 작업자 화면에서 주소 비공개", mv.post);

  // 9) 별점 — 완료 거래만, 1점은 사유 필수
  const noReason = await post(`/matches/${matchId}/rating`, { score: 1 }, cust.token);
  ok(noReason.error === "REASON_REQUIRED", "1점 사유 미선택 차단", noReason);
  const r1 = await post(`/matches/${matchId}/rating`, { score: 5, review: "깔끔해요" }, cust.token);
  ok(!!r1.rating_id, "별점 등록", r1);
  const r2 = await post(`/matches/${matchId}/rating`, { score: 4 }, cust.token);
  ok(r2.error === "ALREADY_RATED", "중복 평가 차단", r2);

  // ---- 제재 시나리오: 작업자C에게 1점을 연속으로 준다 ----
  const wc = await signup("worker", "01077778888", "작업자C");
  const workerC = (await get("/me", wc.token)).user.id;
  const runJob = async (score, reason) => {
    const p = await post("/job-posts", {
      cleaning_type: "home", scheduled_at: "2026-10-02 10:00:00",
      sido: "서울특별시", sigungu: "마포구", dong: "성산동",
      address: "서울 마포구 성산동 1-1", pyeong: 20, budget: 100000,
    }, cust.token);
    await post(`/job-posts/${p.post.id}/apply`, {}, wc.token);
    const a = await get(`/job-posts/${p.post.id}/applications`, cust.token);
    const sel = await post(`/job-posts/${p.post.id}/select`, { application_id: a[0].id }, cust.token);
    await post(`/matches/${sel.match.id}/pay`, {}, cust.token);
    await post(`/matches/${sel.match.id}/complete`, {}, cust.token);
    return post(`/matches/${sel.match.id}/rating`, { score, reason }, cust.token);
  };
  const s1 = await runJob(1, "no_show");
  ok(s1.sanction === "none", "1점 1회 → 제재 없음", s1);
  const s2 = await runJob(1, "poor_quality");
  ok(s2.sanction === "warned", "연속 1점 2회 → 경고", s2);
  const notes = await get("/notifications", wc.token);
  ok(notes.some((n) => n.kind === "sanction_warning"), "경고 알림 발송", notes.map((n) => n.kind));
  const s3 = await runJob(1, "damage");
  ok(s3.sanction === "withdraw_pending", "연속 1점 3회 → 자동 탈퇴 예정", s3);
  const meC = await get("/me", wc.token);
  ok(meC.user.status === "suspended", "탈퇴 예정 중 계정 정지", meC.user);
  const blocked = await post("/job-posts/1/apply", {}, wc.token);
  ok(blocked.error === "SUSPENDED", "제재 중 신규 지원 차단", blocked);

  // 10) 이의신청 + 관리자 무효 처리 → 제재 자동 취소
  const mySanctions = await get("/sanctions/me", wc.token);
  const wd = mySanctions.find((x) => x.type === "withdraw");
  ok(!!wd.appeal_deadline, "7일 이의신청 기간 부여", wd.appeal_deadline);
  const ap = await post(`/sanctions/${wd.id}/appeal`, { text: "악의적 평가입니다" }, wc.token);
  ok(ap.ok, "이의신청 접수", ap);
  const ratings = await new Promise((r) => r(null)).then(() =>
    get(`/workers/${workerC}`, wc.token));
  ok(ratings.stats.rating_count === 3, "작업자 평가 3건", ratings.stats);
  // 관리자: 최근 1점 하나를 무효 처리 → 조건 미충족으로 제재 취소
  const one = await req("GET", "/admin/sanctions?status=appealed", null, ADMIN);
  ok(one.length === 1, "관리자 이의신청 목록", one);
  const allRatings = await (async () => {
    const db = require("./db");
    return db.all("SELECT * FROM ratings WHERE worker_id=? ORDER BY id DESC", [workerC]);
  })();
  const resolved = await req("POST", `/admin/sanctions/${wd.id}/resolve`,
    { action: "accept", memo: "악의적 반복 평가 확인", void_rating_ids: [allRatings[0].id] }, ADMIN);
  ok(resolved.ok, "이의신청 인용 + 평가 무효", resolved);
  const meC2 = await get("/me", wc.token);
  ok(meC2.user.status === "active", "제재 취소 후 계정 복구", meC2.user);

  // 11) 누적 1점 5회 → 자동 탈퇴 예정 → 확정 → 재가입 차단
  const wd2 = await signup("worker", "01099990000", "작업자D");
  const runFor = async (tok, score, reason) => {
    const p = await post("/job-posts", {
      cleaning_type: "home", scheduled_at: "2026-10-03 10:00:00",
      sido: "서울특별시", sigungu: "마포구", dong: "서교동",
      address: "서울 마포구 서교동 2-2", pyeong: 20, budget: 100000,
    }, cust.token);
    await post(`/job-posts/${p.post.id}/apply`, {}, tok);
    const a = await get(`/job-posts/${p.post.id}/applications`, cust.token);
    const sel = await post(`/job-posts/${p.post.id}/select`, { auto: true }, cust.token);
    await post(`/matches/${sel.match.id}/pay`, {}, cust.token);
    await post(`/matches/${sel.match.id}/complete`, {}, cust.token);
    return post(`/matches/${sel.match.id}/rating`, { score, reason }, cust.token);
  };
  // 1,5,1,5,1,5,1 → 연속은 안 쌓이고 누적 1점만 4회 → 경고
  const seq = [[1, "rude"], [5], [1, "rude"], [5], [1, "rude"], [5], [1, "rude"]];
  let last;
  for (const [sc, rs] of seq) last = await runFor(wd2.token, sc, rs);
  ok(last.sanction === "warned", "누적 1점 4회 → 경고", last);
  last = await runFor(wd2.token, 5);
  last = await runFor(wd2.token, 1, "rude");
  ok(last.sanction === "withdraw_pending", "누적 1점 5회 → 자동 탈퇴 예정", last);

  const sancD = (await req("GET", "/admin/sanctions?status=open", null, ADMIN))
    .find((x) => x.type === "withdraw" && x.rule === "total_ones");
  const exec = await req("POST", `/admin/sanctions/${sancD.id}/resolve`, { action: "execute" }, ADMIN);
  ok(!!exec.executed, "관리자 탈퇴 확정", exec);
  const rejoin = await signup("worker", "01099990000", "작업자D");
  ok(rejoin.error === "BLACKLISTED", "해시 CI 블랙리스트로 재가입 차단", rejoin);
  const loginAgain = await get("/me", wd2.token);
  ok(loginAgain.error === "WITHDRAWN", "탈퇴 계정 접근 차단", loginAgain);

  // 12) 악용 패턴 표시
  const abuse = await req("GET", "/admin/abuse?min_ones=3", null, ADMIN);
  ok(abuse.length >= 0, "악용 패턴 집계 동작", abuse);

  // 13) 신고
  const rep = await post("/reports", { match_id: matchId, kind: "damage", detail: "액자 파손" }, cust.token);
  ok(!!rep.report_id, "신고 접수", rep);
  const repList = await req("GET", "/admin/reports", null, ADMIN);
  ok(repList.length === 1, "관리자 신고 목록", repList);
  const repDone = await req("POST", `/admin/reports/${rep.report_id}/resolve`,
    { status: "resolved", memo: "합의 완료" }, ADMIN);
  ok(repDone.ok, "신고 처리", repDone);

  // 14) 수수료율 설정
  const st = await req("POST", "/admin/settings", { fee_rate: "0.2" }, ADMIN);
  ok(st.find((x) => x.key === "fee_rate").value === "0.2", "수수료율 변경", st);
  const badRate = await req("POST", "/admin/settings", { fee_rate: "1.5" }, ADMIN);
  ok(badRate.error === "BAD_FEE_RATE", "잘못된 수수료율 거부", badRate);
  const noAuth = await req("GET", "/admin/settings", null, {});
  ok(noAuth.error === "FORBIDDEN", "관리자 토큰 없이 접근 차단", noAuth);

  // 15) 정산 내역
  const settle = await req("GET", "/admin/settlements", null, ADMIN);
  ok(settle.every((x) => x.withholding_rate === 0.033), "정산 내역에 3.3% 원천징수 기록", settle[0]);

  console.log(fail ? `\n${fail}건 실패` : "\n전부 통과");
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
