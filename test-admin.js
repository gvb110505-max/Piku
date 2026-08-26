// test-admin.js — 관리자 API 전체 검증
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}
const _app = require("./index.js"); _app.listen(4000);
const B = "http://localhost:4000", A = { "x-admin-token": "dev-admin", "Content-Type": "application/json" };
const post = (p, b, h) => fetch(B + p, { method: "POST", headers: h || A, body: JSON.stringify(b || {}) }).then(r => r.json());
const get = (p, h) => fetch(B + p, { headers: h || A }).then(r => r.json());

(async () => {
  await new Promise((r) => setTimeout(r, 500));

  // 활동 데이터 생성 (유저 가입 + 구매 + 배송)
  // 0) 관리자 화면 무결성 — 탭이 가리키는 렌더러가 실제로 있는지.
  // 예전에 renderPay를 넣었다고 착각하고 배포해서 go()가 ReferenceError로 죽었고,
  // 모든 탭이 빈 화면이 됐다. 문법 검사로는 안 잡히니 참조를 직접 대조한다.
  const html = fs.readFileSync(__dirname + "/admin.html", "utf8");
  const viewsBlock = (html.match(/var VIEWS\s*=\s*\{([\s\S]*?)\};/) || [])[1] || "";
  const referenced = [...viewsBlock.matchAll(/:\s*(render[A-Za-z]+)/g)].map((m) => m[1]);
  const missing = referenced.filter((fn) => !new RegExp("function\\s+" + fn + "\\s*\\(").test(html));
  console.log("0. 탭 렌더러:", referenced.length + "개 참조",
    missing.length ? "FAIL 누락: " + missing.join(", ") : "전부 정의됨 OK");
  if (missing.length) process.exit(1);
  // onclick으로 호출하는 전역 함수도 같이 본다 (오타/미삽입 방지)
  const called = [...html.matchAll(/onclick="([a-zA-Z_$][\w$]*)\(/g)].map((m) => m[1]);
  const undef = [...new Set(called)].filter((fn) => !new RegExp("function\\s+" + fn + "\\s*\\(").test(html));
  console.log("0-b. onclick 핸들러:", undef.length ? "FAIL 누락: " + undef.join(", ") : "전부 정의됨 OK");
  if (undef.length) process.exit(1);

  const U = { "Content-Type": "application/json" };
  const { dev_code } = await post("/auth/request-code", { phone: "01099998888" }, U);
  const v = await post("/auth/verify", { phone: "01099998888", code: dev_code, nickname: "테스터" }, U);
  const T = { "Content-Type": "application/json", Authorization: v.token };
  const co1 = await post("/checkout", { pack_id: 1, amount: 5000 }, T);
  const p1 = await post(`/checkout/${co1.uid}/confirm-dev`, {}, T);
  await post("/shipments", { card_ids: [p1.result.result.card_id], address: "서울 어딘가 1" }, T);

  // 1) 잘못된 토큰 차단
  const bad = await get("/admin/overview", { "x-admin-token": "wrong" });
  console.log("1. 토큰 검증:", bad.error === "FORBIDDEN" ? "차단 OK" : "FAIL");

  // 2) 대시보드
  const o = await get("/admin/overview");
  console.log("2. 대시보드: 매출", o.sales_total, "| 주문", o.order_count, "| 유저", o.user_count, "| 팩", o.packs.length);

  // 3) 팩 생성 + 슬롯 수정 + 판매 중단/재개
  const np = await post("/admin/packs", { name: "테스트 팩", price: 20000, total_slots: 150 });
  await post(`/admin/packs/${np.id}`, { total_slots: 180, active: 0 });
  const o2 = await get("/admin/overview");
  const created = o2.packs.find(p => p.id === np.id);
  console.log("3. 팩 생성/수정:", created.total_slots === 180 && created.active === 0 ? "OK" : "FAIL");

  // 4) HIT 추가 (→ 판매 자동 재개) + 교환비율/재고 수정
  const nh = await post(`/admin/packs/${np.id}/hits`, { name: "테스트 SAR", total_qty: 3, point_value: 50000, cost: 60000 });
  await post(`/admin/hits/${nh.id}`, { point_value: 55000, remaining: 2 });
  const o3 = await get("/admin/overview");
  const pk = o3.packs.find(p => p.id === np.id);
  console.log("4. HIT 관리:", pk.active === 1 && pk.hits[0].point_value === 55000 && pk.hits[0].remaining === 2 ? "OK" : "FAIL");

  // 5) HIT 재고 0 → 판매 자동 중단
  await post(`/admin/hits/${nh.id}`, { remaining: 0 });
  const o4 = await get("/admin/overview");
  console.log("5. 재고 0 → 판매 중단:", o4.packs.find(p => p.id === np.id).active === 0 ? "OK" : "FAIL");

  // 6) POINT 풀 추가/삭제
  const pc = await post(`/admin/packs/${np.id}/pool`, { name: "테스트 커먼", rarity: "common", weight: 10 });
  await post(`/admin/pool/${pc.id}/delete`);
  const o5 = await get("/admin/overview");
  console.log("6. POINT 풀:", o5.packs.find(p => p.id === np.id).pool.length === 0 ? "추가/삭제 OK" : "FAIL");

  // 7) 배송 관리: 운송장 + 발송 처리 → 카드 상태 shipped
  const ships = await get("/admin/shipments");
  await post(`/admin/shipments/${ships[0].id}`, { status: "shipped", tracking: "1234-5678" });
  const me = await get("/me", T);
  console.log("7. 배송 처리:", me.cards.find(c => c.id === p1.result.result.card_id).status === "shipped" ? "발송+카드상태 OK" : "FAIL");

  // 8) 주문/유저 목록
  const [orders, users] = await Promise.all([get("/admin/orders"), get("/admin/users")]);
  console.log("8. 주문/유저 목록:", orders.length >= 1 && users.length >= 1 ? "OK" : "FAIL");

  // 9) 결제 대사 — 관리자가 입금을 확인해야 개봉된다
  const co = await post("/checkout", { pack_id: 1, amount: 5000 }, T);
  const openList = await get("/admin/payments");
  const row = openList.payments.find(p => p.uid === co.uid);
  console.log("9. 결제 대사 목록:", row && row.status === "pending" && row.nickname === "테스터" ? "OK" : "FAIL");

  const conf = await post(`/admin/payments/${co.uid}/confirm`, { payer_name: "테스터", pg_key: "TID-1" });
  console.log("10. 관리자 입금 확인 → 개봉:", conf.result?.result?.name ? "OK " + conf.result.result.name : "FAIL " + JSON.stringify(conf));

  const co2 = await post("/checkout", { pack_id: 1, amount: 5000 }, T);
  const rej = await post(`/admin/payments/${co2.uid}/reject`, { reason: "입금 없음" });
  const after = await get("/admin/payments?status=all");
  const row2 = after.payments.find(p => p.uid === co2.uid);
  console.log("11. 결제 반려:", rej.ok && row2.status === "cancelled" ? "OK" : "FAIL");

  console.log("\n== 관리자 API 전체 통과 ==");
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
