// market.js — 카드 거래 마켓 (통신판매중개 + 중앙 검수 에스크로)
//
// 거래 흐름
//   1) 판매자 등록(listings)  2) 구매자 결제 → 대금은 Piku 보관(market_orders.status='paid')
//   3) 판매자 수거 신청 → inbound_code 발급 → 박스에 코드를 적어 배출 → 한진 방문 수거
//   4) 검수센터 입고(inbound) → 검수(inspecting) → 합격(passed) → 구매자 발송(shipped) → 완료(completed)
//   5) 불합격(failed) → 구매자 전액 환불(refunded) + 판매자에게 반송
//
// 금액 규칙 (주문 생성 시점의 정책값을 주문 행에 박제한다 — 이후 정책이 바뀌어도 과거 주문은 불변)
//   구매자 결제액 buyer_total  = item_price + shipping_fee
//   판매자 정산액 payout_amount = item_price - fee_amount - inspection_fee
const db = require("./db");

const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY3479"; // 0/O/1/I/S/5/B/8/2/Z 등 손글씨 혼동 문자 제외
function makeCode(n = 6) {
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return "PK" + s;
}

// 시세 집계 단위. 같은 카드/세트/등급이면 같은 키가 나오도록 정규화한다.
function productKey(title, cardSet, grade) {
  const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
  return [norm(title), norm(cardSet), norm(grade) || "raw"].join("|");
}

async function getSettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    fee_rate: Number(s.market_fee_rate ?? 0.08),
    inspection_fee: Number(s.market_inspection_fee ?? 0),
    shipping_fee: Number(s.market_shipping_fee ?? 3500),
    enabled: String(s.market_enabled ?? "1") === "1",
  };
}

// 주문 금액 계산 — 서버가 단독으로 산출한다. 클라이언트가 보낸 금액은 검증에만 쓴다.
function quote(itemPrice, st) {
  const fee = Math.floor(itemPrice * st.fee_rate);
  return {
    item_price: itemPrice,
    fee_rate: st.fee_rate,
    fee_amount: fee,
    inspection_fee: st.inspection_fee,
    shipping_fee: st.shipping_fee,
    buyer_total: itemPrice + st.shipping_fee,
    payout_amount: itemPrice - fee - st.inspection_fee,
  };
}

const parseImages = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
const listingOut = (l) => ({ ...l, images: parseImages(l.images) });

// deps: { auth, admin, h, confirmPayment } — index.js에서 주입 (인증/결제 로직 중복 방지)
function mount(app, deps) {
  const { auth, admin, h, confirmPayment, cancelPayment, assertPaymentAllowed } = deps;

  // ================= 공개 / 사용자 =================

  // 탐색·검색. 시세 비교를 위해 product_key별 최저 호가를 함께 내려준다.
  app.get("/market/listings", h(async (req, res) => {
    const { q, kind, product_key, sort } = req.query;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;
    const where = ["l.status='active'"], vals = [];
    if (kind) { where.push("l.kind=?"); vals.push(kind); }
    if (product_key) { where.push("l.product_key=?"); vals.push(product_key); }
    if (q) { where.push("(LOWER(l.title) LIKE ? OR LOWER(COALESCE(l.card_set,'')) LIKE ?)");
      const like = "%" + String(q).toLowerCase() + "%"; vals.push(like, like); }
    const order = sort === "price_desc" ? "l.ask_price DESC"
      : sort === "price_asc" ? "l.ask_price ASC" : "l.id DESC";
    const rows = await db.all(
      `SELECT l.*, u.nickname AS seller_nickname FROM listings l JOIN users u ON u.id=l.seller_id
       WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, vals);
    res.json({ items: rows.map(listingOut), limit, offset });
  }));

  app.get("/market/listings/:id", h(async (req, res) => {
    const l = await db.get(
      "SELECT l.*, u.nickname AS seller_nickname FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=?",
      [Number(req.params.id)]);
    if (!l) return res.status(404).json({ error: "NOT_FOUND" });
    const st = await getSettings();
    res.json({ listing: listingOut(l), quote: quote(l.ask_price, st) });
  }));

  // 시세 — 체결가(완료 주문) 기준. 표시 확률과 마찬가지로 실제 체결된 값만 사용한다.
  app.get("/market/quotes", h(async (req, res) => {
    const key = req.query.product_key;
    if (!key) return res.status(400).json({ error: "PRODUCT_KEY_REQUIRED" });
    const trades = await db.all(
      `SELECT item_price, substr(created_at,1,10) AS d FROM market_orders
       WHERE product_key=? AND status IN ('shipped','completed') ORDER BY id DESC LIMIT 100`, [key]);
    const asks = await db.all(
      "SELECT MIN(ask_price) AS lowest, COUNT(*) AS c FROM listings WHERE product_key=? AND status='active'", [key]);
    const prices = trades.map((t) => Number(t.item_price));
    const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
    res.json({
      product_key: key,
      last_price: prices.length ? prices[0] : null,
      avg_price: avg,
      min_price: prices.length ? Math.min(...prices) : null,
      max_price: prices.length ? Math.max(...prices) : null,
      trade_count: prices.length,
      lowest_ask: asks[0] && asks[0].lowest != null ? Number(asks[0].lowest) : null,
      active_listings: Number((asks[0] || {}).c || 0),
      series: trades.map((t) => ({ date: t.d, price: Number(t.item_price) })).reverse(),
    });
  }));

  // 판매 등록
  app.post("/market/listings", auth, h(async (req, res) => {
    const st = await getSettings();
    if (!st.enabled) return res.status(503).json({ error: "MARKET_DISABLED" });
    const { kind = "single", title, card_set, grade, condition, images, ask_price, description } = req.body;
    if (!title || !ask_price) return res.status(400).json({ error: "BAD_REQUEST" });
    if (!["single", "box"].includes(kind)) return res.status(400).json({ error: "BAD_KIND" });
    const price = Number(ask_price);
    if (!Number.isInteger(price) || price < 1000 || price > 50000000)
      return res.status(400).json({ error: "BAD_PRICE", message: "1,000원 ~ 50,000,000원 사이로 등록해주세요." });
    const id = await db.insert(
      `INSERT INTO listings (seller_id, kind, title, card_set, grade, condition, product_key, images,
        ask_price, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, kind, title, card_set || null, grade || null, condition || null,
       productKey(title, card_set, grade), JSON.stringify(Array.isArray(images) ? images.slice(0, 10) : []),
       price, description || null, db.NOW(), db.NOW()]);
    res.json({ id, quote: quote(price, st) });
  }));

  app.post("/market/listings/:id/cancel", auth, h(async (req, res) => {
    const r = await db.run(
      "UPDATE listings SET status='cancelled', updated_at=? WHERE id=? AND seller_id=? AND status='active'",
      [db.NOW(), Number(req.params.id), req.userId]);
    if (!r.changes) return res.status(400).json({ error: "NOT_CANCELLABLE" });
    res.json({ ok: true });
  }));

  // 구매 — 결제 승인 후 대금은 Piku가 보관(에스크로). 판매자에게는 아직 지급되지 않는다.
  app.post("/market/orders", auth, h(async (req, res) => {
    const st = await getSettings();
    if (!st.enabled) return res.status(503).json({ error: "MARKET_DISABLED" });
    const { listing_id, address, paymentKey, orderId, amount } = req.body;
    if (!address) return res.status(400).json({ error: "ADDRESS_REQUIRED" });

    const listing = await db.get("SELECT * FROM listings WHERE id=?", [Number(listing_id)]);
    if (!listing || listing.status !== "active") return res.status(400).json({ error: "LISTING_UNAVAILABLE" });
    if (listing.seller_id === req.userId) return res.status(400).json({ error: "SELF_PURCHASE" });

    const q = quote(listing.ask_price, st);
    if (Number(amount) !== q.buyer_total)
      return res.status(400).json({ error: "AMOUNT_MISMATCH", expected: q.buyer_total });

    // 미성년자 일 결제 한도 — PG 승인 "전"에 차단 (랜덤팩과 합산)
    const blocked = await assertPaymentAllowed(req.userId, q.buyer_total);
    if (blocked) return res.status(403).json(blocked);

    const uid = "MK" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
    const pay = await confirmPayment({ paymentKey, orderId: orderId || uid, amount: q.buyer_total });
    if (!pay.ok) return res.status(402).json({ error: "PAYMENT_FAILED", detail: pay.detail });

    try {
      const out = await db.tx(async (c) => {
        // 동시 구매 경합 보호 — active인 행을 sold로 바꾸는 데 성공한 요청만 주문을 만든다
        const upd = await c.run("UPDATE listings SET status='sold', updated_at=? WHERE id=? AND status='active'",
          [db.NOW(), listing.id]);
        if (!upd.changes) throw new Error("LISTING_UNAVAILABLE");
        const oid = await c.insert(
          `INSERT INTO market_orders (order_uid, listing_id, buyer_id, seller_id, product_key, title,
            item_price, fee_rate, fee_amount, inspection_fee, shipping_fee, buyer_total, payout_amount,
            status, pg_key, buyer_address, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'paid',?,?,?,?)`,
          [uid, listing.id, req.userId, listing.seller_id, listing.product_key, listing.title,
           q.item_price, q.fee_rate, q.fee_amount, q.inspection_fee, q.shipping_fee, q.buyer_total,
           q.payout_amount, pay.key || "DEV", address, db.NOW(), db.NOW()]);
        return oid;
      });
      res.json({ order_id: out, order_uid: uid, ...q, status: "paid",
        notice: "결제 대금은 검수 통과 시까지 Piku가 보관합니다." });
    } catch (e) {
      // 결제는 승인됐는데 다른 구매자가 먼저 채간 경우 — 즉시 자동 취소
      const rf = await cancelPayment({ kind: "market", orderRef: uid, pgKey: pay.key,
        amount: q.buyer_total, reason: "구매 경합 실패 자동 환불" });
      res.status(409).json({ error: e.message, refunded: rf.ok, refund_id: rf.refund_id,
        message: rf.ok ? "다른 구매자가 먼저 구매해 결제가 자동 취소되었습니다."
          : "결제 취소에 실패했습니다. 고객센터에서 확인 후 환불해드립니다." });
    }
  }));

  // 내 거래 (구매 + 판매)
  app.get("/market/orders/mine", auth, h(async (req, res) => {
    const bought = await db.all(
      `SELECT o.*, u.nickname AS seller_nickname FROM market_orders o JOIN users u ON u.id=o.seller_id
       WHERE o.buyer_id=? ORDER BY o.id DESC LIMIT 100`, [req.userId]);
    const sold = await db.all(
      `SELECT o.*, u.nickname AS buyer_nickname FROM market_orders o JOIN users u ON u.id=o.buyer_id
       WHERE o.seller_id=? ORDER BY o.id DESC LIMIT 100`, [req.userId]);
    const inbounds = await db.all(
      "SELECT * FROM inbound_shipments WHERE seller_id=? ORDER BY id DESC LIMIT 100", [req.userId]);
    const listings = await db.all(
      "SELECT * FROM listings WHERE seller_id=? ORDER BY id DESC LIMIT 100", [req.userId]);
    const byOrder = Object.fromEntries(inbounds.map((i) => [i.order_id, i]));
    res.json({
      bought, sold: sold.map((o) => ({ ...o, inbound: byOrder[o.id] || null })),
      listings: listings.map(listingOut),
    });
  }));

  // 수거 신청 — 판매자는 택배사에 직접 접수하지 않는다. 집 앞에 박스를 두면 한진이 계약 단가로 방문 수거.
  // 발급된 inbound_code(또는 Piku 아이디)를 박스 위에 크게 적어야 검수센터에서 매칭된다.
  app.post("/market/orders/:id/pickup", auth, h(async (req, res) => {
    const { pickup_address, pickup_phone, pickup_date } = req.body;
    if (!pickup_address || !pickup_phone) return res.status(400).json({ error: "PICKUP_INFO_REQUIRED" });
    const o = await db.get("SELECT * FROM market_orders WHERE id=? AND seller_id=?",
      [Number(req.params.id), req.userId]);
    if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (!["paid", "awaiting_inbound"].includes(o.status))
      return res.status(400).json({ error: "BAD_STATUS", status: o.status });

    const exist = await db.get("SELECT * FROM inbound_shipments WHERE order_id=? AND status!='discarded'", [o.id]);
    if (exist) return res.json({ inbound: exist, reused: true, ...pickupGuide(exist.inbound_code) });

    let code = makeCode();
    for (let i = 0; i < 5; i++) {
      const dup = await db.get("SELECT id FROM inbound_shipments WHERE inbound_code=?", [code]);
      if (!dup) break;
      code = makeCode();
    }
    const id = await db.insert(
      `INSERT INTO inbound_shipments (order_id, seller_id, inbound_code, carrier, pickup_address,
        pickup_phone, pickup_date, created_at, updated_at) VALUES (?,?,?,'hanjin',?,?,?,?,?)`,
      [o.id, req.userId, code, pickup_address, pickup_phone, pickup_date || null, db.NOW(), db.NOW()]);
    await db.run("UPDATE market_orders SET status='awaiting_inbound', updated_at=? WHERE id=?", [db.NOW(), o.id]);
    res.json({ inbound_id: id, inbound_code: code, ...pickupGuide(code) });
  }));

  function pickupGuide(code) {
    return {
      carrier: "한진택배 계약 방문 수거",
      steps: [
        `박스 윗면에 접수번호 "${code}" 를 유성펜으로 크게 적어주세요.`,
        "집 앞(문 앞)에 박스를 두시면 한진택배가 방문 수거합니다. 택배사에 따로 접수하실 필요 없습니다.",
        "수거비는 Piku 계약 단가로 처리되며 판매자님께 청구되지 않습니다.",
        "카드는 슬리브 + 탑로더 + 완충재로 포장해주세요. 파손은 검수 불합격 사유가 됩니다.",
      ],
      warning: "접수번호가 없거나 알아볼 수 없으면 미매칭 처리되어 검수가 지연됩니다.",
    };
  }

  // 정산 계좌
  app.get("/market/seller-profile", auth, h(async (req, res) => {
    res.json(await db.get("SELECT * FROM seller_profiles WHERE user_id=?", [req.userId]) || null);
  }));
  app.post("/market/seller-profile", auth, h(async (req, res) => {
    const { bank, account, holder, return_address, return_phone } = req.body;
    if (!bank || !account || !holder) return res.status(400).json({ error: "BAD_REQUEST" });
    const exist = await db.get("SELECT user_id FROM seller_profiles WHERE user_id=?", [req.userId]);
    if (exist) {
      await db.run(`UPDATE seller_profiles SET bank=?, account=?, holder=?, return_address=?,
        return_phone=?, updated_at=? WHERE user_id=?`,
        [bank, account, holder, return_address || null, return_phone || null, db.NOW(), req.userId]);
    } else {
      await db.run(`INSERT INTO seller_profiles (user_id, bank, account, holder, return_address,
        return_phone, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        [req.userId, bank, account, holder, return_address || null, return_phone || null, db.NOW(), db.NOW()]);
    }
    res.json({ ok: true });
  }));

  // 중개자 지위 고지 — 랜덤팩(직접 판매)과 분리해서 앱에 표기해야 한다.
  app.get("/market/policy", h(async (req, res) => {
    const st = await getSettings();
    res.json({
      role: "통신판매중개자",
      notice: "Piku는 통신판매중개자로서 마켓 상품의 거래 당사자가 아니며, 상품·거래 정보 및 거래에 대한 책임은 판매 회원에게 있습니다. (랜덤팩은 Piku가 직접 판매하는 상품으로 별도 적용됩니다.)",
      escrow: "구매 대금은 검수 통과 시까지 Piku가 보관하며, 검수 불합격 시 전액 환불됩니다.",
      fee_rate: st.fee_rate, inspection_fee: st.inspection_fee, shipping_fee: st.shipping_fee,
      fee_bearer: { sale_fee: "판매자", inspection_fee: "판매자", delivery_to_buyer: "구매자", pickup_from_seller: "Piku" },
    });
  }));

  // ================= 관리자 =================

  app.get("/admin/market/overview", admin, h(async (req, res) => {
    const [st, cnt, gmv, pend] = await Promise.all([
      getSettings(),
      db.all("SELECT status, COUNT(*) AS c FROM market_orders GROUP BY status"),
      db.get(`SELECT COALESCE(SUM(item_price),0) AS gmv, COALESCE(SUM(fee_amount),0) AS fee
              FROM market_orders WHERE status IN ('shipped','completed')`),
      db.get("SELECT COUNT(*) AS c FROM inbound_shipments WHERE status='unmatched'"),
    ]);
    res.json({
      settings: st,
      by_status: Object.fromEntries(cnt.map((r) => [r.status, Number(r.c)])),
      gmv: Number(gmv.gmv), fee_revenue: Number(gmv.fee),
      unmatched_inbound: Number(pend.c),
      active_listings: Number((await db.get("SELECT COUNT(*) AS c FROM listings WHERE status='active'")).c),
    });
  }));

  app.get("/admin/market/orders", admin, h(async (req, res) => {
    const where = [], vals = [];
    if (req.query.status) { where.push("o.status=?"); vals.push(req.query.status); }
    const rows = await db.all(
      `SELECT o.*, b.nickname AS buyer_nickname, b.phone AS buyer_phone,
              s.nickname AS seller_nickname, s.phone AS seller_phone,
              i.inbound_code, i.status AS inbound_status
       FROM market_orders o
       JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.seller_id
       LEFT JOIN inbound_shipments i ON i.order_id=o.id AND i.status!='discarded'
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY o.id DESC LIMIT 200`, vals);
    res.json(rows);
  }));

  app.get("/admin/market/inbound", admin, h(async (req, res) => {
    const rows = await db.all(
      `SELECT i.*, u.nickname AS seller_nickname, u.phone AS seller_phone,
              o.order_uid, o.title, o.status AS order_status
       FROM inbound_shipments i
       LEFT JOIN users u ON u.id=i.seller_id
       LEFT JOIN market_orders o ON o.id=i.order_id
       ORDER BY (CASE WHEN i.status='unmatched' THEN 0 ELSE 1 END), i.id DESC LIMIT 200`);
    res.json(rows);
  }));

  // 입고 스캔 — 박스에 적힌 문자열 하나로 매칭한다.
  // 접수번호(PK____) → 유저 ID → 전화번호 → 닉네임 순으로 시도하고, 실패하면 미매칭함으로 보낸다.
  app.post("/admin/market/inbound/receive", admin, h(async (req, res) => {
    const raw = String(req.body.code || "").trim();
    if (!raw) return res.status(400).json({ error: "CODE_REQUIRED" });
    const code = raw.toUpperCase().replace(/\s+/g, "");

    // 1) 접수번호 직매칭
    let inb = await db.get(
      "SELECT * FROM inbound_shipments WHERE UPPER(inbound_code)=? AND status!='discarded'", [code]);
    if (inb) return res.json(await receiveInbound(inb));

    // 2) Piku 아이디로 판매자 특정 → 그 판매자의 입고 대기 건
    const digits = raw.replace(/[^0-9]/g, "");
    let seller = null;
    if (/^\d+$/.test(raw)) seller = await db.get("SELECT * FROM users WHERE id=?", [Number(raw)]);
    if (!seller && digits.length >= 10) seller = await db.get("SELECT * FROM users WHERE phone=?", [digits]);
    if (!seller) seller = await db.get("SELECT * FROM users WHERE LOWER(nickname)=?", [raw.toLowerCase()]);

    if (seller) {
      const waiting = await db.all(
        `SELECT i.*, o.order_uid, o.title FROM inbound_shipments i
         JOIN market_orders o ON o.id=i.order_id
         WHERE i.seller_id=? AND i.status IN ('requested','picked_up')`, [seller.id]);
      if (waiting.length === 1) return res.json(await receiveInbound(waiting[0]));
      if (waiting.length > 1)
        return res.status(409).json({ error: "MULTIPLE_CANDIDATES", seller:
          { id: seller.id, nickname: seller.nickname }, candidates: waiting });
    }

    // 3) 매칭 실패 → 미매칭 입고함
    const id = await db.insert(
      `INSERT INTO inbound_shipments (seller_id, inbound_code, status, note, received_at, created_at, updated_at)
       VALUES (?,?,'unmatched',?,?,?,?)`,
      [seller ? seller.id : null, raw, req.body.note || null, db.NOW(), db.NOW(), db.NOW()]);
    res.status(404).json({ error: "UNMATCHED", inbound_id: id,
      message: "매칭되는 판매 건을 찾지 못해 미매칭 입고함에 등록했습니다." });
  }));

  async function receiveInbound(inb) {
    await db.run("UPDATE inbound_shipments SET status='received', received_at=?, updated_at=? WHERE id=?",
      [db.NOW(), db.NOW(), inb.id]);
    if (inb.order_id)
      await db.run("UPDATE market_orders SET status='inspecting', updated_at=? WHERE id=? AND status IN ('paid','awaiting_inbound')",
        [db.NOW(), inb.order_id]);
    const order = inb.order_id ? await db.get("SELECT * FROM market_orders WHERE id=?", [inb.order_id]) : null;
    return { ok: true, matched: true, inbound_id: inb.id, order };
  }

  // 미매칭 박스를 나중에 주문에 붙이기
  app.post("/admin/market/inbound/:id/match", admin, h(async (req, res) => {
    const orderId = Number(req.body.order_id);
    const inb = await db.get("SELECT * FROM inbound_shipments WHERE id=?", [Number(req.params.id)]);
    if (!inb) return res.status(404).json({ error: "INBOUND_NOT_FOUND" });
    const o = await db.get("SELECT * FROM market_orders WHERE id=?", [orderId]);
    if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    // 이 주문에 이미 걸려 있던 다른 수거 신청 건은 폐기 처리한다.
    // 남겨두면 같은 주문이 입고 대기 목록에 중복으로 뜨고, 판매자 아이디로 스캔할 때
    // 후보가 부풀려져 매칭이 막힌다.
    await db.run(`UPDATE inbound_shipments SET status='discarded', note=COALESCE(note,'') || ?, updated_at=?
                  WHERE order_id=? AND id<>? AND status IN ('requested','picked_up')`,
      [` [#${inb.id} 박스로 대체됨]`, db.NOW(), o.id, inb.id]);
    await db.run("UPDATE inbound_shipments SET order_id=?, seller_id=?, updated_at=? WHERE id=?",
      [o.id, o.seller_id, db.NOW(), inb.id]);
    res.json(await receiveInbound({ ...inb, order_id: o.id }));
  }));

  // 검수 처리 — 합격이면 정산 대기(payouts) 생성, 불합격이면 환불 대상으로 전환
  app.post("/admin/market/orders/:id/inspect", admin, h(async (req, res) => {
    const { result, reason, inspector, photos } = req.body;
    if (!["pass", "fail"].includes(result)) return res.status(400).json({ error: "BAD_RESULT" });
    if (result === "fail" && !reason) return res.status(400).json({ error: "REASON_REQUIRED" });
    const id = Number(req.params.id);
    try {
      const out = await db.tx(async (c) => {
        const o = await c.get("SELECT * FROM market_orders WHERE id=?" + db.FOR_UPDATE, [id]);
        if (!o) throw new Error("ORDER_NOT_FOUND");
        if (!["inbound", "inspecting"].includes(o.status)) throw new Error("BAD_STATUS:" + o.status);
        await c.run("INSERT INTO inspections (order_id, inspector, result, reason, photos, created_at) VALUES (?,?,?,?,?,?)",
          [id, inspector || "admin", result, reason || null,
           JSON.stringify(Array.isArray(photos) ? photos : []), db.NOW()]);
        if (result === "pass") {
          await c.run("UPDATE market_orders SET status='passed', updated_at=? WHERE id=?", [db.NOW(), id]);
          const p = await c.get("SELECT * FROM seller_profiles WHERE user_id=?", [o.seller_id]);
          await c.run(`INSERT INTO payouts (order_id, seller_id, amount, bank, account, holder, created_at)
                       VALUES (?,?,?,?,?,?,?)`,
            [id, o.seller_id, o.payout_amount, p ? p.bank : null, p ? p.account : null,
             p ? p.holder : null, db.NOW()]);
          return { status: "passed", payout_amount: o.payout_amount };
        }
        await c.run("UPDATE market_orders SET status='failed', fail_reason=?, updated_at=? WHERE id=?",
          [reason, db.NOW(), id]);
        return { status: "failed", refund_due: o.buyer_total };
      });
      res.json({ ok: true, ...out });
    } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  // 구매자 발송 (합격 건)
  app.post("/admin/market/orders/:id/ship", admin, h(async (req, res) => {
    const { tracking } = req.body;
    if (!tracking) return res.status(400).json({ error: "TRACKING_REQUIRED" });
    const r = await db.run(
      "UPDATE market_orders SET status='shipped', out_tracking=?, updated_at=? WHERE id=? AND status='passed'",
      [tracking, db.NOW(), Number(req.params.id)]);
    if (!r.changes) return res.status(400).json({ error: "NOT_SHIPPABLE" });
    res.json({ ok: true });
  }));

  app.post("/admin/market/orders/:id/complete", admin, h(async (req, res) => {
    const r = await db.run("UPDATE market_orders SET status='completed', updated_at=? WHERE id=? AND status='shipped'",
      [db.NOW(), Number(req.params.id)]);
    if (!r.changes) return res.status(400).json({ error: "NOT_COMPLETABLE" });
    res.json({ ok: true });
  }));

  // 환불 확정 — PG 취소가 성공한 뒤에만 주문 상태를 바꾼다.
  // 취소 실패인데 refunded로 적으면 돈은 안 나갔는데 장부만 맞는 상태가 되어 대사(對査)가 깨진다.
  app.post("/admin/market/orders/:id/refund", admin, h(async (req, res) => {
    const id = Number(req.params.id);
    const o = await db.get("SELECT * FROM market_orders WHERE id=?", [id]);
    if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    // 'passed'(검수 합격, 출고 전)도 환불 대상이다 — 출고 직전 취소·분실은 실제로 발생한다.
    // 'shipped'/'completed'는 물건이 구매자에게 간 뒤라 반품 절차가 따로 필요하므로 여기서 막는다.
    if (!["paid", "awaiting_inbound", "inbound", "inspecting", "passed", "failed"].includes(o.status))
      return res.status(400).json({ error: "NOT_REFUNDABLE", status: o.status,
        message: o.status === "shipped" || o.status === "completed"
          ? "이미 구매자에게 발송된 건입니다. 반품 절차로 처리하세요." : undefined });

    // 이미 정산이 진행된 건은 환불하면 이중 손실이 난다 — 정산을 먼저 보류시켜야 한다
    const pay = await db.get("SELECT * FROM payouts WHERE order_id=? AND status IN ('approved','paid')", [id]);
    if (pay) return res.status(409).json({ error: "PAYOUT_ALREADY_PROCESSED",
      message: "이미 정산이 승인/지급된 건입니다. 정산을 보류로 되돌린 뒤 환불하세요.", payout_id: pay.id });

    const rf = await cancelPayment({ kind: "market", orderId: id, orderRef: o.order_uid,
      pgKey: o.pg_key, amount: o.buyer_total,
      reason: req.body.reason || o.fail_reason || "검수 불합격 환불" });
    if (!rf.ok)
      return res.status(502).json({ error: "PG_CANCEL_FAILED", refund_id: rf.refund_id,
        detail: rf.detail, message: "PG 취소에 실패해 주문 상태를 바꾸지 않았습니다. 환불 원장에서 재시도하세요." });

    await db.run("UPDATE market_orders SET status='refunded', updated_at=? WHERE id=?", [db.NOW(), id]);
    await db.run("UPDATE listings SET status='active', updated_at=? WHERE id=? AND status='sold'",
      [db.NOW(), o.listing_id]);                                    // 재판매 가능하도록 원복
    await db.run("UPDATE payouts SET status='cancelled' WHERE order_id=? AND status='pending'", [id]);
    res.json({ ok: true, refund_amount: o.buyer_total, refund_id: rf.refund_id, dev: !!rf.dev });
  }));

  // 실패한 환불 재시도 — PG 장애·일시 오류로 실패한 건을 관리자가 다시 시도한다
  app.post("/admin/market/orders/:id/refund/retry", admin, h(async (req, res) => {
    const id = Number(req.params.id);
    const o = await db.get("SELECT * FROM market_orders WHERE id=?", [id]);
    if (!o) return res.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (o.status === "refunded") return res.json({ ok: true, already: true });
    const rf = await cancelPayment({ kind: "market", orderId: id, orderRef: o.order_uid,
      pgKey: o.pg_key, amount: o.buyer_total, reason: "환불 재시도" });
    if (!rf.ok) return res.status(502).json({ error: "PG_CANCEL_FAILED", detail: rf.detail });
    await db.run("UPDATE market_orders SET status='refunded', updated_at=? WHERE id=?", [db.NOW(), id]);
    await db.run("UPDATE listings SET status='active', updated_at=? WHERE id=? AND status='sold'",
      [db.NOW(), o.listing_id]);
    res.json({ ok: true, refund_amount: o.buyer_total, refund_id: rf.refund_id });
  }));

  app.get("/admin/market/payouts", admin, h(async (req, res) => {
    res.json(await db.all(
      `SELECT p.*, u.nickname AS seller_nickname, u.phone AS seller_phone, o.order_uid, o.title
       FROM payouts p JOIN users u ON u.id=p.seller_id JOIN market_orders o ON o.id=p.order_id
       ORDER BY (CASE WHEN p.status='pending' THEN 0 ELSE 1 END), p.id DESC LIMIT 200`));
  }));

  app.post("/admin/market/payouts/:id/:action", admin, h(async (req, res) => {
    // cancel = 보류. 이미 승인/지급된 건도 보류로 되돌릴 수 있어야 환불 처리가 가능하다.
    const map = { approve: ["approved", "approved_at"], paid: ["paid", "paid_at"], cancel: ["cancelled", null] };
    const m = map[req.params.action];
    if (!m) return res.status(400).json({ error: "BAD_ACTION" });
    const sets = ["status=?"], vals = [m[0]];
    if (m[1]) { sets.push(`${m[1]}=?`); vals.push(db.NOW()); }
    if (req.body.memo != null) { sets.push("memo=?"); vals.push(req.body.memo); }
    vals.push(Number(req.params.id));
    const r = await db.run(`UPDATE payouts SET ${sets.join(",")} WHERE id=?`, vals);
    if (!r.changes) return res.status(404).json({ error: "PAYOUT_NOT_FOUND" });
    res.json({ ok: true });
  }));

  // 수수료 정책
  app.get("/admin/settings", admin, h(async (req, res) => {
    res.json(await db.all("SELECT * FROM settings ORDER BY key"));
  }));
  app.post("/admin/settings", admin, h(async (req, res) => {
    const allowed = ["market_fee_rate", "market_inspection_fee", "market_shipping_fee", "market_enabled"];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: "NO_FIELDS" });
    for (const [k, v] of updates) {
      const val = String(v);
      if (k === "market_fee_rate" && !(Number(val) >= 0 && Number(val) <= 0.5))
        return res.status(400).json({ error: "BAD_FEE_RATE", message: "수수료율은 0 ~ 0.5 사이여야 합니다." });
      await db.run(`INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        [k, val, db.NOW()]);
    }
    res.json({ ok: true, settings: await getSettings() });
  }));
}

module.exports = { mount, getSettings, quote, productKey, makeCode };
