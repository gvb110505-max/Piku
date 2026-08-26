// test-refund.js — 링크 결제의 환불/실패 처리 검증
//
// 링크 결제는 돈이 앱 밖(주문서 링크·계좌이체)에서 오간다. API로 되돌릴 수 없으므로
// 환불은 두 단계로 나뉜다: 원장에 requested로 접수 → 관리자가 실제로 돈을 돌려준 뒤 done.
// 여기서 확인하는 것은 "주문 상태(거래가 무효인가)"와 "원장 상태(돈이 나갔는가)"가
// 따로 관리되고, 사람이 처리해야 할 건이 반드시 원장에 남는가다.
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}

process.env.PAY_MODE = "live";   // 운영 모드 — 개발용 자동승인/자가 본인확인이 닫힌다

const app = require("./index.js"); app.listen(4700);
const B = "http://localhost:4700";
const A = { "x-admin-token": "dev-admin", "Content-Type": "application/json" };
const post = (p, b, h) => fetch(B + p, { method: "POST", headers: h || A, body: JSON.stringify(b || {}) }).then((r) => r.json());
const get = (p, h) => fetch(B + p, { headers: h || A }).then((r) => r.json());

let pass = 0, fail = 0;
const check = (l, ok, x) => { if (ok) { pass++; console.log("✓ " + l); }
  else { fail++; console.log("✗ " + l, x != null ? JSON.stringify(x) : ""); } };

// 운영 모드에서는 인증번호를 응답에 내려주지 않으므로 DB에서 직접 읽는다
const db = require("./db");
async function signup(phone, nick) {
  const U = { "Content-Type": "application/json" };
  await post("/auth/request-code", { phone }, U);
  const row = await db.get("SELECT code FROM phone_codes WHERE phone=?", [phone]);
  const v = await post("/auth/verify", { phone, code: row.code, nickname: nick }, U);
  const H = { "Content-Type": "application/json", Authorization: v.token };
  // 운영 모드라 dev 본인확인이 닫혀 있으므로 관리자 경로로 성인 인증을 등록한다
  await post(`/admin/users/${v.user.id}/verify`, { birth: "19900101", memo: "테스트" });
  return { id: v.user.id, H };
}

// 운영에서 입금 확인은 관리자 대사로 이뤄진다 — 그 경로를 그대로 탄다.
async function buyListing(body, H) {
  const co = await post("/market/orders", body, H);
  if (co.error || !co.uid) return co;
  const done = await post(`/admin/payments/${co.uid}/confirm`, { payer_name: "구매왕" });
  return done.error ? { ...co, ...done } : { ...co, ...(done.result || {}) };
}

(async () => {
  await new Promise((r) => setTimeout(r, 600));
  const S = await signup("01011112222", "판매왕");
  const Bu = await signup("01033334444", "구매왕");

  // ---- 0. 운영 모드에서 개발용 경로가 닫혔는지 ----
  const devId = await post("/identity/dev-verify", { birth: "19900101" }, Bu.H);
  check("0-a. 운영 모드에서 dev 본인확인 차단", devId.error === "DEV_VERIFY_DISABLED"
    || devId.error === "NOT_FOUND" || !!devId.error, devId);

  // ---- 1. 랜덤팩: 입금은 확인됐는데 확정(추첨)에 실패한 경우 ----
  // HIT 재고를 0으로 만들어 SOLD_OUT을 유도한다. 링크 결제는 자동 환불이 불가능하므로
  // 결제를 되돌리는 대신 payment_links를 failed로 못 박고 환불 원장을 자동 접수해야 한다.
  const ov = await get("/admin/overview");
  const p1 = ov.packs.find((p) => p.id === 1);
  const co1 = await post("/checkout", { pack_id: 1, amount: 5000 }, Bu.H);
  check("1-a. 결제 링크 발급", !!co1.uid && co1.status === "pending", co1);

  const devConfirm = await post(`/checkout/${co1.uid}/confirm-dev`, {}, Bu.H);
  check("1-b. 운영 모드에서 개발용 자동승인 차단", devConfirm.error === "DEV_CONFIRM_DISABLED", devConfirm);

  for (const hit of p1.hits) await post(`/admin/hits/${hit.id}`, { remaining: 0 });
  await post("/admin/packs/1", { active: 1 }); // 판매중으로 되돌려 확정까지 도달시킨다

  const settled = await post(`/admin/payments/${co1.uid}/confirm`, { payer_name: "구매왕" });
  check("1-c. 확정 실패 시 환불 요청 접수", settled.error === "SOLD_OUT" && settled.refund_requested === true, settled);
  const link1 = (await get("/admin/payments?status=all")).payments.find((p) => p.uid === co1.uid);
  check("1-d. 결제는 failed로 못 박음 (재확정 불가)", link1.status === "failed", link1 && link1.status);
  const rl = await get("/admin/refunds");
  check("1-e. 환불 원장에 requested 기록", rl[0].status === "requested" && rl[0].kind === "pack"
    && rl[0].amount === 5000 && rl[0].order_ref === co1.uid, rl[0]);
  const packSlots = await get("/packs/1");
  check("1-f. 확정 실패분은 슬롯을 먹지 않음", packSlots.pack.sold_slots === 0
    && packSlots.pack.reserved_slots === 0, packSlots.pack);

  // ---- 2. 마켓: 검수 불합격 → 환불 ----
  const L = await post("/market/listings", { title: "환불 테스트", ask_price: 100000 }, S.H);
  const O = await buyListing({ listing_id: L.id, address: "서울", amount: 103500 }, Bu.H);
  check("2-a. 관리자 대사로 주문 확정", O.status === "paid" && !!O.order_id, O);
  const PU = await post(`/market/orders/${O.order_id}/pickup`,
    { pickup_address: "부산", pickup_phone: "01011112222" }, S.H);
  await post("/admin/market/inbound/receive", { code: PU.inbound_code });
  await post(`/admin/market/orders/${O.order_id}/inspect`, { result: "fail", reason: "위조" });

  const rf = await post(`/admin/market/orders/${O.order_id}/refund`, {});
  check("2-b. 환불 접수", rf.ok && rf.refund_amount === 103500 && !!rf.refund_id, rf);
  const o2 = (await get("/admin/market/orders")).find((o) => o.id === O.order_id);
  check("2-c. 주문 상태 refunded", o2.status === "refunded", o2.status);
  const l2 = await get(`/market/listings/${L.id}`);
  check("2-d. 상품 재판매 원복", l2.listing.status === "active", l2.listing.status);

  // ---- 3. 돈은 아직 안 나갔다 — 원장을 닫아야 환불이 끝난다 ----
  const led = await get("/admin/refunds");
  const mine = led.find((r) => r.id === rf.refund_id);
  check("3-a. 접수 직후 원장은 requested", mine.status === "requested" && !mine.done_at, mine);
  const done = await post(`/admin/refunds/${rf.refund_id}/done`, { memo: "블로그페이 관리자에서 취소 처리" });
  check("3-b. 관리자 완료 처리", done.ok && done.status === "done", done);
  const led2 = await get("/admin/refunds");
  const mine2 = led2.find((r) => r.id === rf.refund_id);
  check("3-c. 완료 시각과 메모 기록", mine2.status === "done" && !!mine2.done_at
    && /블로그페이/.test(mine2.pg_response || ""), mine2);
  const stillOpen = led2.filter((r) => r.status === "requested").length;
  check("3-d. 미처리 환불이 목록 상단에 남음", stillOpen === 1 && led2[0].status === "requested", led2[0]);

  // ---- 4. 정산 승인된 건은 환불 차단 ----
  const L5 = await post("/market/listings", { title: "정산완료 건", ask_price: 70000 }, S.H);
  const O5 = await buyListing({ listing_id: L5.id, address: "서울", amount: 73500 }, Bu.H);
  const PU5 = await post(`/market/orders/${O5.order_id}/pickup`,
    { pickup_address: "부산", pickup_phone: "01011112222" }, S.H);
  await post("/admin/market/inbound/receive", { code: PU5.inbound_code });
  await post(`/admin/market/orders/${O5.order_id}/inspect`, { result: "pass" });
  const po = (await get("/admin/market/payouts")).find((p) => p.order_id === O5.order_id);
  await post(`/admin/market/payouts/${po.id}/approve`, {});
  const blocked = await post(`/admin/market/orders/${O5.order_id}/refund`, {});
  check("4-a. 정산 승인 건 환불 차단", blocked.error === "PAYOUT_ALREADY_PROCESSED", blocked);
  await post(`/admin/market/payouts/${po.id}/cancel`, {});
  const afterHold = await post(`/admin/market/orders/${O5.order_id}/refund`, {});
  check("4-b. 정산 보류 후에는 환불 가능", afterHold.ok === true, afterHold);

  // ---- 5. 웹훅은 공유 비밀 없이는 열리지 않는다 ----
  const L6 = await post("/market/listings", { title: "웹훅 건", ask_price: 30000 }, S.H);
  const co6 = await post("/market/orders", { listing_id: L6.id, address: "서울", amount: 33500 }, Bu.H);
  const noSecret = await post("/pay/webhook/blogpay", { uid: co6.uid, status: "paid" });
  check("5-a. 시크릿 미설정이면 웹훅 비활성", noSecret.error === "WEBHOOK_DISABLED", noSecret);

  await post("/admin/settings", { pay_webhook_secret: "s3cr3t-hook" });
  const wrong = await post("/pay/webhook/blogpay", { uid: co6.uid, status: "paid" },
    { "Content-Type": "application/json", "x-pay-secret": "nope" });
  check("5-b. 잘못된 시크릿 거부", wrong.error === "BAD_SECRET", wrong);

  const hook = await post("/pay/webhook/blogpay",
    { uid: co6.uid, status: "paid", pg_key: "TID-999", payer_name: "구매왕" },
    { "Content-Type": "application/json", "x-pay-secret": "s3cr3t-hook" });
  check("5-c. 올바른 웹훅으로 주문 확정", hook.ok && hook.result && hook.result.status === "paid", hook);
  const o6 = (await get("/admin/market/orders")).find((o) => o.order_uid === co6.uid);
  check("5-d. 제공자 거래번호 보관 (환불 대조용)", o6 && o6.pg_key === "TID-999", o6 && o6.pg_key);

  const dupHook = await post("/pay/webhook/blogpay",
    { uid: co6.uid, status: "paid", pg_key: "TID-999" },
    { "Content-Type": "application/json", "x-pay-secret": "s3cr3t-hook" });
  const orders6 = (await get("/admin/market/orders")).filter((o) => o.order_uid === co6.uid);
  check("5-e. 웹훅 재전송에도 주문은 한 건", dupHook.already === true && orders6.length === 1, dupHook);

  console.log(`\n== 환불/결제확정 테스트: ${pass}건 통과, ${fail}건 실패 ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("테스트 중단:", e); process.exit(1); });
