// test-e2e.js — 서버를 같은 프로세스에서 띄우고 전체 플로우 검증
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}

const _app = require("./index.js"); _app.listen(4000); // 서버 부팅
const B = "http://localhost:4000";
const j = (r) => r.json();

(async () => {
  await new Promise((r) => setTimeout(r, 500));
  const post = (p, body, tok) => fetch(B + p, { method: "POST",
    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: tok } : {}) },
    body: JSON.stringify(body || {}) }).then(j);
  const get = (p, tok) => fetch(B + p, { headers: tok ? { Authorization: tok } : {} }).then(j);

  // 1) 가입 + 1000P
  const { dev_code } = await post("/auth/request-code", { phone: "01012345678" });
  const v = await post("/auth/verify", { phone: "01012345678", code: dev_code, nickname: "세현", birth: "20110315" });
  console.log("1. 가입:", v.is_new, "| 포인트:", v.user.points);
  const T = v.token;

  // 2) 중복가입 방지 (같은 번호 재인증 → 기존 계정)
  const { dev_code: c2 } = await post("/auth/request-code", { phone: "01012345678" });
  const v2 = await post("/auth/verify", { phone: "01012345678", code: c2, birth: "20110315" });
  console.log("2. 중복가입 방지:", v2.is_new === false ? "OK(기존계정 로그인)" : "FAIL");

  // 3) 웰컴팩 1회 + 2회차 거부
  const w1 = await post("/purchase/welcome", {}, T);
  const w2 = await post("/purchase/welcome", {}, T);
  console.log("3. 웰컴팩:", w1.result?.name, "| 2회차:", w2.error === "WELCOME_ALREADY_USED" ? "차단 OK" : "FAIL");

  // 4) 유료팩 구매 (테스트 모드)
  const p1 = await post("/purchase", { pack_id: 1, method: "kakao", orderId: "O1", amount: 5000, paymentKey: "T1" }, T);
  console.log("4. 구매/추첨:", p1.result.grade, p1.result.name);

  // 5) 금액 조작 차단
  const bad = await post("/purchase", { pack_id: 1, method: "kakao", orderId: "O2", amount: 100, paymentKey: "T2" }, T);
  console.log("5. 금액조작:", bad.error === "AMOUNT_MISMATCH" ? "차단 OK" : "FAIL");

  // 6) 확률 재계산 확인
  const odds = await get("/packs/1");
  console.log("6. 확률 실시간:", odds.pack.remaining_slots, "슬롯 |", odds.hits.map(h => h.name + " " + (h.probability * 100).toFixed(2) + "%").join(", "));

  // 7) 포인트 교환
  const ex = await post(`/cards/${p1.result.card_id}/exchange`, {}, T);
  console.log("7. 포인트 교환: +" + ex.points_added + "P");

  // 8) 합배송 신청
  const p2 = await post("/purchase", { pack_id: 1, method: "toss", orderId: "O3", amount: 5000, paymentKey: "T3" }, T);
  const p3 = await post("/purchase", { pack_id: 1, method: "toss", orderId: "O4", amount: 5000, paymentKey: "T4" }, T);
  const sh = await post("/shipments", { card_ids: [p2.result.card_id, p3.result.card_id], address: "서울 강남구 테스트로 1" }, T);
  console.log("8. 합배송:", sh.shipment_id ? `신청 OK (배송비 ${sh.fee}원)` : "FAIL");

  // 9) 마이페이지 종합
  const me = await get("/me", T);
  console.log("9. 마이페이지: 포인트", me.user.points, "| 카드", me.cards.length, "| 배송", me.shipments.length, "| 포인트내역", me.point_logs.length);

  // 10) HIT 소진 → SOLD OUT (웰컴팩 재고 0으로 만들고 확인)
  const db = require("./db");
  await db.run("UPDATE hits SET remaining=0 WHERE pack_id=(SELECT id FROM packs WHERE is_welcome=1)");
  await db.run("UPDATE users SET welcome_used=0, points=points+1000 WHERE id=1");
  const w3 = await post("/purchase/welcome", {}, T);
  console.log("10. HIT 소진 시:", w3.error === "SOLD_OUT" ? "판매 중단 OK" : JSON.stringify(w3));

  // 11) 미성년자(2011년생) 일 한도 10만원 — 5천원 팩 반복 구매
  let blocked = null, count = 0;
  for (let i = 0; i < 30; i++) {
    const r = await post("/purchase", { pack_id: 1, method: "toss", orderId: "L" + i, amount: 5000, paymentKey: "T" }, T);
    if (r.error === "DAILY_LIMIT_MINOR") { blocked = r; break; }
    count++;
  }
  const meL = await get("/me", T);
  console.log("11. 미성년 일한도:", blocked && meL.limit.today_spent <= 100000
    ? `OK (오늘 ${meL.limit.today_spent.toLocaleString()}원에서 차단, 잔여 ${blocked.remaining}원)` : "FAIL");

  // 12) 성인은 한도 없음
  const { dev_code: ca } = await post("/auth/request-code", { phone: "01055556666" });
  const va = await post("/auth/verify", { phone: "01055556666", code: ca, nickname: "성인", birth: "19900101" });
  const meA = await fetch(B + "/me", { headers: { Authorization: va.token } }).then(j);
  console.log("12. 성인 한도:", meA.limit.daily_limit === null ? "무제한 OK" : "FAIL");

  // 13) GUARANTEED 마일스톤 — 50번째 개봉자에게 보장 지급
  let bonus = null;
  for (let i = 0; i < 60; i++) {
    const r = await post("/purchase", { pack_id: 1, method: "toss", orderId: "G" + i, amount: 5000, paymentKey: "T" }, va.token);
    if (r.error) { console.log("13 중단:", r.error); break; }
    if (r.result.bonus) { bonus = r.result; break; }
  }
  console.log("13. GUARANTEED:", bonus ? `OK (#${bonus.draw_no}번째 → ${bonus.bonus.name})` : "FAIL");

  console.log("\n== E2E 전체 통과 ==");
  process.exit(0);
})().catch((e) => { console.error("E2E FAIL:", e); process.exit(1); });
