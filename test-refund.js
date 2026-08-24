// test-refund.js — 결제 취소(환불) 실연동 검증
// 토스 API를 가로채서 승인은 통과시키고, 취소는 성공/실패를 시나리오별로 제어한다.
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}

process.env.TOSS_SECRET_KEY = "test_sk_dummy";  // PG 연동 모드로 강제

const realFetch = global.fetch;
let CANCEL_MODE = "ok";        // ok | fail
const cancelCalls = [];
global.fetch = async (url, opt) => {
  const u = String(url);
  if (u.includes("api.tosspayments.com")) {
    if (u.includes("/cancel")) {
      cancelCalls.push({ url: u, body: JSON.parse(opt.body), idem: opt.headers["Idempotency-Key"] });
      if (CANCEL_MODE === "fail")
        return new Response(JSON.stringify({ code: "NOT_CANCELABLE_AMOUNT", message: "취소 불가" }),
          { status: 400, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ status: "CANCELED" }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "DONE" }), { status: 200 }); // confirm
  }
  return realFetch(url, opt);
};

const app = require("./index.js"); app.listen(4700);
const B = "http://localhost:4700";
const A = { "x-admin-token": "dev-admin", "Content-Type": "application/json" };
const post = (p, b, h) => realFetch(B + p, { method: "POST", headers: h || A, body: JSON.stringify(b || {}) }).then((r) => r.json());
const get = (p, h) => realFetch(B + p, { headers: h || A }).then((r) => r.json());

let pass = 0, fail = 0;
const check = (l, ok, x) => { if (ok) { pass++; console.log("✓ " + l); }
  else { fail++; console.log("✗ " + l, x != null ? JSON.stringify(x) : ""); } };

// PG 연동 모드에서는 인증번호를 응답에 내려주지 않으므로 DB에서 직접 읽는다
const db = require("./db");
async function signup(phone, nick) {
  const U = { "Content-Type": "application/json" };
  await post("/auth/request-code", { phone }, U);
  const row = await db.get("SELECT code FROM phone_codes WHERE phone=?", [phone]);
  const v = await post("/auth/verify", { phone, code: row.code, nickname: nick }, U);
  const H = { "Content-Type": "application/json", Authorization: v.token };
  // PG 연동 모드라 dev 본인확인이 닫혀 있으므로 관리자 경로로 성인 인증을 등록한다
  await post(`/admin/users/${v.user.id}/verify`, { birth: "19900101", memo: "테스트" });
  return { id: v.user.id, H };
}

(async () => {
  await new Promise((r) => setTimeout(r, 600));
  const S = await signup("01011112222", "판매왕");
  const Bu = await signup("01033334444", "구매왕");

  // ---- 1. 랜덤팩: 결제 승인 후 추첨 실패 → 자동 환불 ----
  // HIT 재고를 0으로 만들어 SOLD_OUT을 유도한다 (결제는 이미 승인된 뒤 실패하는 경로)
  const ov = await get("/admin/overview");
  const p1 = ov.packs.find((p) => p.id === 1);
  for (const hit of p1.hits) await post(`/admin/hits/${hit.id}`, { remaining: 0 });
  await post("/admin/packs/1", { active: 1 }); // 판매중으로 되돌려 결제까지 도달시킨다

  const before = cancelCalls.length;
  const buy = await post("/purchase", { pack_id: 1, amount: 5000, method: "toss",
    orderId: "PACK-1", paymentKey: "pay_pack_1" }, Bu.H);
  check("1-a. 추첨 실패 시 자동 환불 응답", buy.refunded === true && !!buy.refund_id, buy);
  check("1-b. 토스 취소 API 실제 호출", cancelCalls.length === before + 1
    && cancelCalls[before].body.cancelAmount === 5000, cancelCalls[before]);
  const rl = await get("/admin/refunds");
  check("1-c. 환불 원장 기록 (done)", rl[0].status === "done" && rl[0].kind === "pack"
    && rl[0].amount === 5000, rl[0]);

  // ---- 2. 마켓: 검수 불합격 → 환불 성공 ----
  const L = await post("/market/listings", { title: "환불 테스트", ask_price: 100000 }, S.H);
  const O = await post("/market/orders", { listing_id: L.id, address: "서울",
    amount: 103500, paymentKey: "pay_mk_1", orderId: "MK-1" }, Bu.H);
  const PU = await post(`/market/orders/${O.order_id}/pickup`,
    { pickup_address: "부산", pickup_phone: "01011112222" }, S.H);
  await post("/admin/market/inbound/receive", { code: PU.inbound_code });
  await post(`/admin/market/orders/${O.order_id}/inspect`, { result: "fail", reason: "위조" });

  const n2 = cancelCalls.length;
  const rf = await post(`/admin/market/orders/${O.order_id}/refund`, {});
  check("2-a. 환불 성공", rf.ok && rf.refund_amount === 103500, rf);
  check("2-b. 토스 취소 호출 (전액)", cancelCalls.length === n2 + 1
    && cancelCalls[n2].body.cancelAmount === 103500, cancelCalls[n2]);
  const o2 = (await get("/admin/market/orders")).find((o) => o.id === O.order_id);
  check("2-c. 주문 상태 refunded", o2.status === "refunded", o2.status);
  const l2 = await get(`/market/listings/${L.id}`);
  check("2-d. 상품 재판매 원복", l2.listing.status === "active", l2.listing.status);

  // ---- 3. PG 취소 실패 → 주문 상태를 바꾸지 않는다 (핵심) ----
  CANCEL_MODE = "fail";
  const L3 = await post("/market/listings", { title: "취소실패 케이스", ask_price: 50000 }, S.H);
  const O3 = await post("/market/orders", { listing_id: L3.id, address: "서울",
    amount: 53500, paymentKey: "pay_mk_3", orderId: "MK-3" }, Bu.H);
  const PU3 = await post(`/market/orders/${O3.order_id}/pickup`,
    { pickup_address: "부산", pickup_phone: "01011112222" }, S.H);
  await post("/admin/market/inbound/receive", { code: PU3.inbound_code });
  await post(`/admin/market/orders/${O3.order_id}/inspect`, { result: "fail", reason: "손상" });

  const bad = await post(`/admin/market/orders/${O3.order_id}/refund`, {});
  check("3-a. PG 취소 실패 시 502 반환", bad.error === "PG_CANCEL_FAILED", bad);
  const o3 = (await get("/admin/market/orders")).find((o) => o.id === O3.order_id);
  check("3-b. 취소 실패면 주문 상태 유지 (refunded 아님)", o3.status === "failed", o3.status);
  const l3 = await get(`/market/listings/${L3.id}`);
  check("3-c. 취소 실패면 상품도 sold 유지", l3.listing.status === "sold", l3.listing.status);
  const led = await get("/admin/refunds");
  check("3-d. 환불 원장에 failed 기록", led[0].status === "failed" && !!led[0].pg_response, led[0].status);

  // ---- 4. 재시도 성공 ----
  CANCEL_MODE = "ok";
  const retry = await post(`/admin/market/orders/${O3.order_id}/refund/retry`, {});
  check("4-a. 재시도 성공", retry.ok && retry.refund_amount === 53500, retry);
  const o3b = (await get("/admin/market/orders")).find((o) => o.id === O3.order_id);
  check("4-b. 재시도 후 refunded", o3b.status === "refunded", o3b.status);

  // ---- 5. 정산 승인된 건은 환불 차단 ----
  const L5 = await post("/market/listings", { title: "정산완료 건", ask_price: 70000 }, S.H);
  const O5 = await post("/market/orders", { listing_id: L5.id, address: "서울",
    amount: 73500, paymentKey: "pay_mk_5", orderId: "MK-5" }, Bu.H);
  const PU5 = await post(`/market/orders/${O5.order_id}/pickup`,
    { pickup_address: "부산", pickup_phone: "01011112222" }, S.H);
  await post("/admin/market/inbound/receive", { code: PU5.inbound_code });
  await post(`/admin/market/orders/${O5.order_id}/inspect`, { result: "pass" });
  const po = (await get("/admin/market/payouts")).find((p) => p.order_id === O5.order_id);
  await post(`/admin/market/payouts/${po.id}/approve`, {});
  const blocked = await post(`/admin/market/orders/${O5.order_id}/refund`, {});
  check("5-a. 정산 승인 건 환불 차단", blocked.error === "PAYOUT_ALREADY_PROCESSED", blocked);
  await post(`/admin/market/payouts/${po.id}/cancel`, {});
  const afterHold = await post(`/admin/market/orders/${O5.order_id}/refund`, {});
  check("5-b. 정산 보류 후에는 환불 가능", afterHold.ok === true, afterHold);

  // ---- 6. 멱등키 ----
  check("6. 취소 요청에 멱등키 포함", cancelCalls.every((c) => !!c.idem),
    cancelCalls.map((c) => c.idem));

  console.log(`\n== 환불 테스트: ${pass}건 통과, ${fail}건 실패 ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("테스트 중단:", e); process.exit(1); });
