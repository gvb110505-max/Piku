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

  // 카탈로그가 바뀌어도 깨지지 않게 팩은 가격으로 찾는다
  const catalog = await get("/packs");
  const byPrice = (won) => {
    const o = catalog.find((x) => x.pack.price === won && !x.pack.is_welcome);
    if (!o) throw new Error("가격 " + won + "원 팩이 카탈로그에 없습니다");
    return o.pack.id;
  };
  const P5 = byPrice(5000);

  // 링크 결제는 2단계다 — 링크 발급(/checkout) 후 입금 확인(/confirm-dev)에서 개봉된다.
  const buy = async (packId, amount, tok) => {
    const co = await post("/checkout", { pack_id: packId, amount }, tok);
    if (co.error) return co;
    return post(`/checkout/${co.uid}/confirm-dev`, {}, tok);
  };

  // 1) 가입 + 1000P
  const { dev_code } = await post("/auth/request-code", { phone: "01012345678" });
  const v = await post("/auth/verify", { phone: "01012345678", code: dev_code, nickname: "세현" });
  console.log("1. 가입:", v.is_new, "| 포인트:", v.user.points);
  const T = v.token;

  // 2) 중복가입 방지 (같은 번호 재인증 → 기존 계정)
  const { dev_code: c2 } = await post("/auth/request-code", { phone: "01012345678" });
  const v2 = await post("/auth/verify", { phone: "01012345678", code: c2 });
  console.log("2. 중복가입 방지:", v2.is_new === false ? "OK(기존계정 로그인)" : "FAIL");

  // 3) 웰컴팩 1회 + 2회차 거부
  const w1 = await post("/purchase/welcome", {}, T);
  const w2 = await post("/purchase/welcome", {}, T);
  console.log("3. 웰컴팩:", w1.result?.name, "| 2회차:", w2.error === "WELCOME_ALREADY_USED" ? "차단 OK" : "FAIL");

  // 4) 유료팩 구매 (테스트 모드)
  const p1 = await buy(P5, 5000, T);
  console.log("4. 구매/추첨:", p1.result.result.grade, p1.result.result.name);

  // 5) 금액 조작 차단
  const bad = await post("/checkout", { pack_id: P5, amount: 100 }, T);
  console.log("5. 금액조작:", bad.error === "AMOUNT_MISMATCH" ? "차단 OK" : "FAIL");

  // 6) 확률 재계산 확인
  const odds = await get(`/packs/${P5}`);
  console.log("6. 확률 실시간:", odds.pack.remaining_slots, "슬롯 |", odds.hits.map(h => h.name + " " + (h.probability * 100).toFixed(2) + "%").join(", "));

  // 7) 포인트 교환
  const ex = await post(`/cards/${p1.result.result.card_id}/exchange`, {}, T);
  console.log("7. 포인트 교환: +" + ex.points_added + "P");

  // 8) 합배송 신청
  const p2 = await buy(P5, 5000, T);
  const p3 = await buy(P5, 5000, T);
  const sh = await post("/shipments", { card_ids: [p2.result.result.card_id, p3.result.result.card_id], address: "서울 강남구 테스트로 1" }, T);
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
    const r = await buy(P5, 5000, T);
    if (r.error === "DAILY_LIMIT_MINOR") { blocked = r; break; }
    count++;
  }
  const meL = await get("/me", T);
  console.log("11. 미성년 일한도:", blocked && meL.limit.today_spent <= 100000
    ? `OK (오늘 ${meL.limit.today_spent.toLocaleString()}원에서 차단, 잔여 ${blocked.remaining}원)` : "FAIL");

  // 12) 성인은 한도 없음
  const { dev_code: ca } = await post("/auth/request-code", { phone: "01055556666" });
  const va = await post("/auth/verify", { phone: "01055556666", code: ca, nickname: "성인" });
  // 생년월일은 가입이 아니라 본인확인에서만 받는다 (자기 입력 차단)
  await post("/identity/dev-verify", { birth: "19900101" }, va.token);
  const meA = await fetch(B + "/me", { headers: { Authorization: va.token } }).then(j);
  console.log("12. 성인 한도:", meA.limit.daily_limit === null ? "무제한 OK" : "FAIL");

  // 13) GUARANTEED + LAST ONE — 4구짜리 전용 팩을 만들어 끝까지 소진시킨다.
  //     실제 카탈로그는 첫 보장이 수백 구 뒤라 무차별 구매로는 닿지 않는다.
  const tiny = await db.insert(
    "INSERT INTO packs (name, price, point_price, is_welcome, total_slots, image, active) VALUES ('테스트 소형팩',1000,0,0,4,'',1)");
  await db.run("INSERT INTO hits (pack_id,name,grade,image,total_qty,remaining,point_value,cost) VALUES (?,'소형 HIT','HIT','',4,4,1000,500)", [tiny]);
  await db.run("INSERT INTO point_pool (pack_id,name,rarity,image,weight) VALUES (?,'커먼','common','',1)", [tiny]);
  await db.run("INSERT INTO guaranteed (pack_id,slot_no,name,image,point_value,kind) VALUES (?,2,'보장 상품','',5000,'guaranteed')", [tiny]);
  await db.run("INSERT INTO guaranteed (pack_id,slot_no,name,image,point_value,kind) VALUES (?,4,'라스트원 상품','',99999,'last_one')", [tiny]);

  const bonuses = [];
  for (let i = 1; i <= 4; i++) {
    const r = await buy(tiny, 1000, va.token);
    if (r.error) { console.log("13 중단:", r.error); break; }
    if (r.result.result.bonus) bonuses.push({ n: i, ...r.result.result.bonus });
  }
  const gotG = bonuses.find((b) => b.kind === "guaranteed");
  const gotL = bonuses.find((b) => b.kind === "last_one");
  console.log("13. GUARANTEED:", gotG && gotG.n === 2 ? `OK (#2 → ${gotG.name})` : "FAIL " + JSON.stringify(bonuses));
  console.log("13-b. LAST ONE:", gotL && gotL.n === 4 ? `OK (마지막 4구 → ${gotL.name} ${gotL.point_value}P)` : "FAIL " + JSON.stringify(bonuses));
  const tinyOdds = await get(`/packs/${tiny}`);
  console.log("13-c. 라스트원 지급 표시:",
    tinyOdds.last_one && tinyOdds.last_one.awarded && tinyOdds.guaranteed.length === 1
      ? "OK (보장 목록과 분리됨)" : "FAIL " + JSON.stringify(tinyOdds.last_one));

  // 14) 링크 결제 — 입금 확인 전에는 아무것도 뽑히지 않고, 슬롯만 예약된다
  const before = await get(`/packs/${P5}`);
  const co = await post("/checkout", { pack_id: P5, amount: 5000 }, va.token);
  const held = await get(`/packs/${P5}`);
  const st1 = await get(`/checkout/${co.uid}`, va.token);
  const okHold = !!co.uid && st1.status === "pending"
    && held.pack.sold_slots === before.pack.sold_slots        // 아직 개봉 안 됨
    && held.pack.reserved_slots === before.pack.reserved_slots + 1
    && held.pack.remaining_slots === before.pack.remaining_slots; // 표시 확률은 그대로
  console.log("14. 결제 대기:", okHold ? `OK (${co.uid} 예약, 개봉 없음)` : "FAIL " + JSON.stringify({ co, held: held.pack }));

  const done = await post(`/checkout/${co.uid}/confirm-dev`, {}, va.token);
  const after = await get(`/packs/${P5}`);
  console.log("15. 입금 확인 후 개봉:",
    done.result?.result?.name && after.pack.sold_slots === before.pack.sold_slots + 1
      && after.pack.reserved_slots === before.pack.reserved_slots ? "OK " + done.result.result.name : "FAIL " + JSON.stringify(done));

  // 16) 이중 확정 방지 — 웹훅과 관리자 승인이 겹쳐도 한 번만 확정돼야 한다
  const again = await post(`/checkout/${co.uid}/confirm-dev`, {}, va.token);
  const after2 = await get(`/packs/${P5}`);
  console.log("16. 이중 확정 방지:",
    again.already && after2.pack.sold_slots === after.pack.sold_slots ? "OK" : "FAIL " + JSON.stringify(again));

  // 17) 취소한 결제는 확정되지 않고 예약도 풀린다
  const co2 = await post("/checkout", { pack_id: P5, amount: 5000 }, va.token);
  await post(`/checkout/${co2.uid}/cancel`, {}, va.token);
  const dead = await post(`/checkout/${co2.uid}/confirm-dev`, {}, va.token);
  const after3 = await get(`/packs/${P5}`);
  console.log("17. 취소 결제:",
    dead.error === "PAYMENT_NOT_PENDING" && after3.pack.reserved_slots === 0 ? "차단 OK" : "FAIL " + JSON.stringify(dead));

  // 18) 남의 결제는 조회도 확정도 못 한다
  const co3 = await post("/checkout", { pack_id: P5, amount: 5000 }, va.token);
  const peek = await get(`/checkout/${co3.uid}`, T);
  const steal = await post(`/checkout/${co3.uid}/confirm-dev`, {}, T);
  await post(`/checkout/${co3.uid}/cancel`, {}, va.token);
  console.log("18. 타인 결제 접근:",
    peek.error === "PAYMENT_NOT_FOUND" && steal.error === "PAYMENT_NOT_FOUND" ? "차단 OK" : "FAIL");

  // 19) 결제 만료 — 예전에 expires_at을 ISO("...T...Z")로 저장해서 db.NOW()와
  //     문자열 비교가 항상 false가 됐고, 버려진 결제가 슬롯을 영원히 붙잡았다.
  const before19 = await get(`/packs/${P5}`);
  const coE = await post("/checkout", { pack_id: P5, amount: 5000 }, va.token);
  const held19 = await get(`/packs/${P5}`);
  console.log("19. 만료 전 예약:", held19.pack.reserved_slots === before19.pack.reserved_slots + 1
    ? "OK (1구 잡힘)" : "FAIL " + held19.pack.reserved_slots);

  // 만료 시각을 과거로 돌린다 — 20분을 기다릴 수는 없으니
  await db.run("UPDATE payment_links SET expires_at=? WHERE uid=?",
    [db.AT(Date.now() - 60 * 1000), coE.uid]);
  const afterExp = await get(`/packs/${P5}`);
  console.log("19-b. 만료되면 예약 해제:",
    afterExp.pack.reserved_slots === before19.pack.reserved_slots ? "OK" : "FAIL " + afterExp.pack.reserved_slots);
  const st19 = await get(`/checkout/${coE.uid}`, va.token);
  console.log("19-c. 조회 시 만료로 보임:", st19.status === "expired" ? "OK" : "FAIL " + st19.status);

  // 20) 만료됐어도 실제로 입금된 건은 확정돼야 한다 — 돈은 이미 움직였다
  const late = await fetch(B + `/admin/payments/${coE.uid}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": "dev-admin" },
    body: JSON.stringify({ payer_name: "늦은입금" }),
  }).then(j);
  console.log("20. 만료 후 입금 확인:",
    late.result?.result?.name ? "OK 개봉됨 " + late.result.result.name : "FAIL " + JSON.stringify(late));

  // 21) 저장 형식이 섞이지 않는지 — 이게 어긋나면 위 판정이 통째로 무너진다
  const row = await db.get("SELECT expires_at FROM payment_links WHERE uid=?", [coE.uid]);
  console.log("21. 시각 저장 형식:",
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.expires_at) ? "OK " + row.expires_at : "FAIL " + row.expires_at);

  console.log("\n== E2E 완료 ==");
  process.exit(0);
})().catch((e) => { console.error("E2E FAIL:", e); process.exit(1); });
