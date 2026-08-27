// test-market.js — 마켓(중개 + 에스크로 + 검수 + 정산) 전체 흐름 검증
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}
const app = require("./index.js"); app.listen(4500);
const B = "http://localhost:4500";
const A = { "x-admin-token": "dev-admin", "Content-Type": "application/json" };
const J = (r) => r.json();
const post = (p, b, h) => fetch(B + p, { method: "POST", headers: h || A, body: JSON.stringify(b || {}) }).then(J);
const get = (p, h) => fetch(B + p, { headers: h || A }).then(J);
const raw = (p, h) => fetch(B + p, { headers: h || A });

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log(`✓ ${label}`); }
  else { fail++; console.log(`✗ ${label}`, extra != null ? JSON.stringify(extra) : ""); }
}

// 생년월일은 가입이 아니라 본인확인(/identity/dev-verify)에서만 들어간다
async function signup(phone, nick, birth) {
  const U = { "Content-Type": "application/json" };
  const { dev_code } = await post("/auth/request-code", { phone }, U);
  const v = await post("/auth/verify", { phone, code: dev_code, nickname: nick }, U);
  const H = { "Content-Type": "application/json", Authorization: v.token };
  if (birth) await post("/identity/dev-verify", { birth }, H);
  return { token: v.token, id: v.user.id, H };
}

// 링크 결제 2단계 — 링크 발급 후 입금 확인(개발 자동승인)까지 한 번에 돌린다.
// 실패 응답(한도 초과·매물 없음 등)은 1단계에서 그대로 돌아온다.
async function buyListing(body, H) {
  const co = await post("/market/orders", body, H);
  if (co.error || !co.uid) return co;
  const done = await post(`/checkout/${co.uid}/confirm-dev`, {}, H);
  if (done.error) return { ...co, ...done };
  return { ...co, ...(done.result || {}) };
}
async function buyPack(packId, amount, H) {
  const co = await post("/checkout", { pack_id: packId, amount }, H);
  if (co.error || !co.uid) return co;
  const done = await post(`/checkout/${co.uid}/confirm-dev`, {}, H);
  return done.error ? { ...co, ...done } : { ...co, ...(done.result || {}) };
}

(async () => {
  await new Promise((r) => setTimeout(r, 600));

  const catalog = await get("/packs", { "Content-Type": "application/json" });
  const P10 = catalog.find((x) => x.pack.price === 10000 && !x.pack.is_welcome).pack.id;

  const seller = await signup("01011112222", "판매왕", "19900101");
  const buyer  = await signup("01033334444", "구매왕", "19900101");
  const minor  = await signup("01055556666", "미성년", "20120101");

  // --- 1. 판매 등록 ---
  const L = await post("/market/listings", {
    kind: "single", title: "리자몽 VMAX SSR", card_set: "샤이니스타V", grade: "PSA10",
    condition: "민트", ask_price: 500000, images: ["u1.jpg"],
  }, seller.H);
  check("1. 판매 등록", !!L.id && L.quote.fee_amount === 40000, L);
  check("1-b. 수수료 8% + 정산액 계산", L.quote.payout_amount === 460000 && L.quote.buyer_total === 503500, L.quote);

  const badPrice = await post("/market/listings", { title: "싸구려", ask_price: 100 }, seller.H);
  check("1-c. 최저가 미만 등록 차단", badPrice.error === "BAD_PRICE", badPrice);

  // --- 2. 탐색/검색 ---
  const found = await get("/market/listings?q=리자몽");
  check("2. 검색", found.items.length === 1 && found.items[0].id === L.id, found.items.length);

  // --- 3. 구매 (에스크로) ---
  const self = await buyListing({ listing_id: L.id, address: "서울 1", amount: 503500 }, seller.H);
  check("3-a. 자기 상품 구매 차단", self.error === "SELF_PURCHASE", self);

  const wrongAmt = await buyListing({ listing_id: L.id, address: "서울 1", amount: 500000 }, buyer.H);
  check("3-b. 금액 조작 차단", wrongAmt.error === "AMOUNT_MISMATCH", wrongAmt);

  const O = await buyListing({ listing_id: L.id, address: "서울시 강남구 1", amount: 503500 }, buyer.H);
  check("3-c. 구매 성공 + 에스크로 보관", O.order_id > 0 && O.status === "paid" && O.payout_amount === 460000, O);

  const dup = await buyListing({ listing_id: L.id, address: "서울 2", amount: 503500 }, buyer.H);
  check("3-d. 판매완료 상품 중복 구매 차단", dup.error === "LISTING_UNAVAILABLE", dup);

  // --- 4. 수거 신청 → 접수번호 발급 ---
  const PU = await post(`/market/orders/${O.order_id}/pickup`,
    { pickup_address: "부산 해운대 2", pickup_phone: "01011112222", pickup_date: "2026-08-26" }, seller.H);
  check("4. 수거 신청 + 접수번호 발급", /^PK[A-Z0-9]{6}$/.test(PU.inbound_code || ""), PU.inbound_code);
  check("4-b. 박스 표기 안내 제공", Array.isArray(PU.steps) && PU.steps[0].includes(PU.inbound_code), PU.steps && PU.steps[0]);

  const mine1 = await get("/market/orders/mine", seller.H);
  check("4-c. 판매자 거래 목록에 입고정보 노출",
    mine1.sold[0].inbound && mine1.sold[0].status === "awaiting_inbound", mine1.sold[0] && mine1.sold[0].status);

  // --- 5. 관리자 입고 스캔 ---
  const rcv = await post("/admin/market/inbound/receive", { code: PU.inbound_code.toLowerCase() });
  check("5. 접수번호로 입고 매칭 (대소문자 무관)", rcv.matched && rcv.order.status === "inspecting", rcv);

  // --- 6. 검수 합격 → 정산 대기 생성 ---
  await post("/market/seller-profile", { bank: "국민", account: "123-456", holder: "홍길동" }, seller.H);
  const insp = await post(`/admin/market/orders/${O.order_id}/inspect`, { result: "pass", inspector: "검수1" });
  check("6. 검수 합격", insp.status === "passed" && insp.payout_amount === 460000, insp);

  const payouts = await get("/admin/market/payouts");
  check("6-b. 정산 대기 생성 + 계좌 스냅샷",
    payouts.length === 1 && payouts[0].amount === 460000 && payouts[0].bank === "국민", payouts[0]);

  // --- 7. 출고 → 완료 ---
  const shipNo = await post(`/admin/market/orders/${O.order_id}/ship`, {});
  check("7-a. 송장 없이 출고 차단", shipNo.error === "TRACKING_REQUIRED", shipNo);
  await post(`/admin/market/orders/${O.order_id}/ship`, { tracking: "HJ123456789" });
  await post(`/admin/market/orders/${O.order_id}/complete`, {});
  const ord = (await get("/admin/market/orders")).find((o) => o.id === O.order_id);
  check("7-b. 출고 → 완료", ord.status === "completed" && ord.out_tracking === "HJ123456789", ord.status);

  await post(`/admin/market/payouts/${payouts[0].id}/approve`, {});
  await post(`/admin/market/payouts/${payouts[0].id}/paid`, { memo: "8/25 이체" });
  const paid = (await get("/admin/market/payouts"))[0];
  check("7-c. 정산 승인 → 지급 완료", paid.status === "paid" && !!paid.paid_at, paid.status);

  // --- 8. 시세 (체결가 기반) ---
  const key = found.items[0].product_key;
  const qt = await get(`/market/quotes?product_key=${encodeURIComponent(key)}`);
  check("8. 시세에 체결가 반영", qt.last_price === 500000 && qt.trade_count === 1, qt);

  // --- 9. 검수 불합격 → 환불 + 재판매 원복 ---
  const L2 = await post("/market/listings", { title: "가짜 뮤츠", ask_price: 100000 }, seller.H);
  const O2 = await buyListing({ listing_id: L2.id, address: "서울 3", amount: 103500 }, buyer.H);
  const PU2 = await post(`/market/orders/${O2.order_id}/pickup`,
    { pickup_address: "부산 2", pickup_phone: "01011112222" }, seller.H);
  await post("/admin/market/inbound/receive", { code: PU2.inbound_code });
  const noReason = await post(`/admin/market/orders/${O2.order_id}/inspect`, { result: "fail" });
  check("9-a. 불합격 사유 필수", noReason.error === "REASON_REQUIRED", noReason);
  const failed = await post(`/admin/market/orders/${O2.order_id}/inspect`, { result: "fail", reason: "위조 의심" });
  check("9-b. 검수 불합격", failed.status === "failed" && failed.refund_due === 103500, failed);
  const rf = await post(`/admin/market/orders/${O2.order_id}/refund`, {});
  check("9-c. 전액 환불 확정", rf.refund_amount === 103500, rf);
  const relisted = await get(`/market/listings/${L2.id}`);
  check("9-d. 환불 시 상품 재판매 원복", relisted.listing.status === "active", relisted.listing.status);

  // --- 10. 미매칭 입고 → 수동 매칭 ---
  const L3 = await post("/market/listings", { title: "피카츄 프로모", ask_price: 200000 }, seller.H);
  const O3 = await buyListing({ listing_id: L3.id, address: "서울 4", amount: 203500 }, buyer.H);
  await post(`/market/orders/${O3.order_id}/pickup`, { pickup_address: "부산 3", pickup_phone: "01011112222" }, seller.H);
  const r404 = await raw("/admin/market/inbound/receive", A);
  const un = await post("/admin/market/inbound/receive", { code: "알아볼수없는글씨" });
  check("10-a. 판독 불가 박스 → 미매칭함 등록", un.error === "UNMATCHED" && un.inbound_id > 0, un);
  const matched = await post(`/admin/market/inbound/${un.inbound_id}/match`, { order_id: O3.order_id });
  check("10-b. 미매칭 박스 수동 매칭", matched.matched && matched.order.status === "inspecting", matched);

  // --- 11. Piku 아이디로 입고 매칭 ---
  const L4 = await post("/market/listings", { title: "이브이 SAR", ask_price: 150000 }, seller.H);
  const O4 = await buyListing({ listing_id: L4.id, address: "서울 5", amount: 153500 }, buyer.H);
  await post(`/market/orders/${O4.order_id}/pickup`, { pickup_address: "부산 4", pickup_phone: "01011112222" }, seller.H);
  const byNick = await post("/admin/market/inbound/receive", { code: "판매왕" });
  check("11. 닉네임(Piku 아이디)으로 입고 매칭", byNick.matched && byNick.order.id === O4.order_id, byNick);

  // --- 12. 여러 건 대기 시 후보 반환 ---
  const L5 = await post("/market/listings", { title: "A", ask_price: 50000 }, seller.H);
  const L6 = await post("/market/listings", { title: "B", ask_price: 60000 }, seller.H);
  const O5 = await buyListing({ listing_id: L5.id, address: "s", amount: 53500 }, buyer.H);
  const O6 = await buyListing({ listing_id: L6.id, address: "s", amount: 63500 }, buyer.H);
  await post(`/market/orders/${O5.order_id}/pickup`, { pickup_address: "p", pickup_phone: "01011112222" }, seller.H);
  await post(`/market/orders/${O6.order_id}/pickup`, { pickup_address: "p", pickup_phone: "01011112222" }, seller.H);
  const multi = await post("/admin/market/inbound/receive", { code: "판매왕" });
  check("12. 대기 여러 건이면 후보 목록 반환", multi.error === "MULTIPLE_CANDIDATES" && multi.candidates.length === 2, multi);

  // --- 13. 미성년자 한도에 마켓 결제 합산 ---
  const big = await post("/market/listings", { title: "고가 카드", ask_price: 90000 }, seller.H);
  const m1 = await buyListing({ listing_id: big.id, address: "서울", amount: 93500 }, minor.H);
  check("13-a. 미성년 1회차 구매 통과 (93,500원)", m1.order_id > 0, m1);
  const big2 = await post("/market/listings", { title: "고가 카드2", ask_price: 90000 }, seller.H);
  const m2 = await buyListing({ listing_id: big2.id, address: "서울", amount: 93500 }, minor.H);
  check("13-b. 미성년 한도 초과 차단 (마켓 합산)", m2.error === "DAILY_LIMIT_MINOR", m2);
  // 마켓에서 93,500원을 썼으므로 10,000원 랜덤팩은 한도(100,000)를 넘겨 차단돼야 한다
  const packBuy = await buyPack(P10, 10000, minor.H);
  check("13-c. 마켓 결제가 랜덤팩 한도에도 반영", packBuy.error === "DAILY_LIMIT_MINOR", packBuy);

  // --- 14. 수수료 정책 변경 ---
  const badRate = await post("/admin/settings", { market_fee_rate: "0.9" });
  check("14-a. 비정상 수수료율 거부", badRate.error === "BAD_FEE_RATE", badRate);
  await post("/admin/settings", { market_fee_rate: "0.05" });
  const L7 = await post("/market/listings", { title: "정책변경후", ask_price: 100000 }, seller.H);
  check("14-b. 변경된 수수료율 적용", L7.quote.fee_amount === 5000, L7.quote);
  const oldOrder = (await get("/admin/market/orders")).find((o) => o.id === O.order_id);
  check("14-c. 과거 주문은 당시 수수료 유지", oldOrder.fee_amount === 40000, oldOrder.fee_amount);

  // --- 15. 중개자 지위 고지 ---
  const pol = await get("/market/policy");
  check("15. 통신판매중개자 고지 제공", pol.role === "통신판매중개자" && pol.notice.includes("거래 당사자가 아니"), pol.role);

  // --- 16. 관리자 대시보드 ---
  const ov = await get("/admin/market/overview");
  check("16. 마켓 대시보드 집계", ov.gmv > 0 && ov.by_status.completed === 1, ov);

  console.log(`\n== 마켓 테스트: ${pass}건 통과, ${fail}건 실패 ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("테스트 중단:", e); process.exit(1); });
