// test-identity.js — 본인확인이 생년월일의 유일한 신뢰 출처인지 검증
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}
const app = require("./index.js"); app.listen(4800);
const B = "http://localhost:4800";
const A = { "x-admin-token": "dev-admin", "Content-Type": "application/json" };
const post = (p, b, h) => fetch(B + p, { method: "POST", headers: h || A, body: JSON.stringify(b || {}) }).then((r) => r.json());
const get = (p, h) => fetch(B + p, { headers: h || A }).then((r) => r.json());
let pass = 0, fail = 0;
const check = (l, ok, x) => { if (ok) { pass++; console.log("✓ " + l); }
  else { fail++; console.log("✗ " + l, x != null ? JSON.stringify(x) : ""); } };

async function signup(phone, nick, birthAttempt) {
  const U = { "Content-Type": "application/json" };
  const { dev_code } = await post("/auth/request-code", { phone }, U);
  const v = await post("/auth/verify",
    { phone, code: dev_code, nickname: nick, birth: birthAttempt }, U);
  return { id: v.user.id, user: v.user, H: { "Content-Type": "application/json", Authorization: v.token } };
}

// 링크 결제는 링크 발급 → 입금 확인 2단계다. 한도 차단은 1단계(발급)에서 걸린다.
async function buy(packId, amount, H) {
  const co = await post("/checkout", { pack_id: packId, amount }, H);
  if (co.error || !co.uid) return co;
  const done = await post(`/checkout/${co.uid}/confirm-dev`, {}, H);
  return done.error ? { ...co, ...done } : { ...co, ...(done.result || {}) };
}

(async () => {
  await new Promise((r) => setTimeout(r, 600));

  // 카탈로그가 바뀌어도 깨지지 않게 팩은 가격으로 찾는다
  const catalog = await get("/packs", { "Content-Type": "application/json" });
  const P50 = catalog.find((x) => x.pack.price === 50000 && !x.pack.is_welcome).pack.id;

  // ---- 1. 가입 시 클라이언트가 보낸 생년월일은 무시된다 (핵심) ----
  const liar = await signup("01011112222", "위조범", "19900101"); // 성인이라고 주장
  check("1-a. 가입 응답에서 미성년자 취급", liar.user.is_minor === true, liar.user);
  check("1-b. 인증 미완료 표시", liar.user.identity_verified === false, liar.user);
  const st = await get("/identity/status", liar.H);
  check("1-c. 자기 입력 생년월일이 저장되지 않음", st.verified === false && st.is_minor === true, st);

  // 실제로 한도가 걸리는지 — 자기 입력이 먹혔다면 통과했을 금액
  const over = await buy(P50, 50000, liar.H);
  check("1-d. 5만원 구매는 통과", over.order_id > 0, over);
  await buy(P50, 50000, liar.H);
  const over2 = await buy(P50, 50000, liar.H);   // 누적 15만원 → 한도 초과
  check("1-e. 누적 10만원 초과분 차단", over2.error === "DAILY_LIMIT_MINOR", over2);
  check("1-f. 차단 사유에 미인증 안내", over2.verified === false
    && over2.message.includes("본인확인"), over2.message);

  // ---- 2. 본인확인 후 한도 해제 ----
  const adult = await signup("01033334444", "성인", "20150101");
  await post("/identity/dev-verify", { birth: "19900101", name: "홍길동" }, adult.H);
  const st2 = await get("/identity/status", adult.H);
  check("2-a. 인증 후 성인 판정", st2.verified === true && st2.is_minor === false, st2);
  let ok = true;
  for (let i = 0; i < 4; i++) {
    const r = await buy(P50, 50000, adult.H);
    if (!r.order_id) { ok = false; break; }
  }
  check("2-b. 인증 성인은 한도 없음 (20만원 결제)", ok);

  // ---- 3. 인증 결과가 미성년이면 인증해도 한도 유지 ----
  const teen = await signup("01055556666", "고딩", "19900101");
  await post("/identity/dev-verify", { birth: "20100505" }, teen.H);
  const st3 = await get("/identity/status", teen.H);
  check("3-a. 인증 결과가 미성년", st3.verified === true && st3.is_minor === true, st3);
  await buy(P50, 50000, teen.H);
  await buy(P50, 50000, teen.H);
  const blocked = await buy(P50, 50000, teen.H);
  check("3-b. 인증된 미성년자도 한도 적용", blocked.error === "DAILY_LIMIT_MINOR", blocked);
  check("3-c. 차단 사유는 나이 안내", blocked.verified === true
    && blocked.message.includes("19세"), blocked.message);

  // ---- 4. 마켓도 같은 판정을 쓴다 ----
  const seller = await signup("01077778888", "판매자");
  await post("/identity/dev-verify", { birth: "19900101" }, seller.H);
  const L = await post("/market/listings", { title: "카드", ask_price: 60000 }, seller.H);
  const m1 = await post("/market/orders", { listing_id: L.id, address: "서울", amount: 63500 }, teen.H);
  check("4. 미성년 마켓 구매도 한도 차단", m1.error === "DAILY_LIMIT_MINOR", m1);

  // ---- 5. 관리자 수동 본인확인 ----
  const av = await post(`/admin/users/${liar.id}/verify`, { birth: "19850303", name: "김성인", memo: "신분증 확인" });
  check("5-a. 관리자 수동 인증", av.ok && av.verified === true && av.is_minor === false, av);
  const badBirth = await post(`/admin/users/${liar.id}/verify`, { birth: "9999" });
  check("5-b. 잘못된 생년월일 거부", badBirth.error === "INVALID_BIRTH", badBirth);
  const users = await get("/admin/users");
  check("5-c. 유저 목록에 인증 수단 노출",
    users.find((u) => u.id === liar.id).verified_by === "admin_manual", users[0]);

  // ---- 6. 강제 모드 ----
  await post("/admin/settings", { identity_required: "1" });
  const legacy = await signup("01099990000", "미인증");
  const st6 = await get("/identity/status", legacy.H);
  check("6-a. 강제 모드에서 미인증자는 미성년 취급",
    st6.is_minor === true && st6.reason === "IDENTITY_REQUIRED", st6);
  const st6b = await get("/identity/status", adult.H);
  check("6-b. 강제 모드에서도 인증자는 성인 유지", st6b.is_minor === false, st6b);
  await post("/admin/settings", { identity_required: "0" });

  // ---- 7. PASS 미연동 안내 ----
  const p = await post("/identity/pass/start", {}, adult.H);
  check("7. PASS 미연동 시 명확한 안내", p.error === "PASS_NOT_CONFIGURED" && !!p.todo, p);

  console.log(`\n== 본인확인 테스트: ${pass}건 통과, ${fail}건 실패 ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("테스트 중단:", e); process.exit(1); });
