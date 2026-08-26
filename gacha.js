// gacha.js — 추첨 코어 (async, 어댑터 기반)
const db = require("./db");
const pay = require("./pay");

// 현재 확률표 (표시용 = 실제 추첨 확률과 동일)
async function getOdds(packId) {
  const pack = await db.get("SELECT * FROM packs WHERE id=?", [packId]);
  if (!pack) return null;
  const hits = await db.all(
    "SELECT id, name, image, total_qty, remaining, point_value FROM hits WHERE pack_id=? ORDER BY id", [packId]);
  const remainingSlots = pack.total_slots - pack.sold_slots;
  const hitRemaining = hits.reduce((s, h) => s + h.remaining, 0);
  const soldOut = hitRemaining === 0 || remainingSlots <= 0;
  // 결제 대기 중이라 잡혀 있는 몫. 확률에는 반영하지 않는다 —
  // 표시 확률은 언제나 실제 추첨 확률과 같아야 하고, 추첨은 sold_slots만 본다.
  const reserved = await pay.reservedSlots(packId);
  const guaranteed = (await db.all(
    "SELECT id, slot_no, name, image, (awarded_user IS NOT NULL) AS awarded FROM guaranteed WHERE pack_id=? ORDER BY slot_no", [packId]))
    .map((g) => ({ ...g, awarded: !!g.awarded, next: false }));
  const nextG = guaranteed.find((g) => !g.awarded && g.slot_no > pack.sold_slots);
  if (nextG) nextG.next = true;
  return {
    pack: { id: pack.id, name: pack.name, price: pack.price, list_price: pack.list_price || null,
            point_price: pack.point_price,
            is_welcome: !!pack.is_welcome, image: pack.image,
            total_slots: pack.total_slots, sold_slots: pack.sold_slots,
            remaining_slots: remainingSlots, sold_out: soldOut, active: !!pack.active && !soldOut,
            reserved_slots: reserved, available_slots: Math.max(0, remainingSlots - reserved) },
    hits: hits.map((h) => ({ ...h, probability: remainingSlots > 0 ? h.remaining / remainingSlots : 0 })),
    point_probability: remainingSlots > 0 ? (remainingSlots - hitRemaining) / remainingSlots : 0,
    point_remaining: remainingSlots - hitRemaining,
    guaranteed,
  };
}

// 단일 뽑기 — 반드시 db.tx 내부에서 호출 (c = 트랜잭션 컨텍스트)
async function draw(c, userId, packId) {
  const pack = await c.get("SELECT * FROM packs WHERE id=?" + db.FOR_UPDATE, [packId]); // pg: 행 잠금
  if (!pack || !pack.active) throw new Error("PACK_INACTIVE");
  const remainingSlots = pack.total_slots - pack.sold_slots;
  if (remainingSlots <= 0) throw new Error("SOLD_OUT");

  const hits = await c.all("SELECT * FROM hits WHERE pack_id=? AND remaining>0 ORDER BY id", [packId]);
  const hitRemaining = hits.reduce((s, h) => s + h.remaining, 0);
  if (hitRemaining === 0) {
    await c.run("UPDATE packs SET active=0 WHERE id=?", [packId]); // HIT 전량 소진 → 판매 자동 중단
    throw new Error("SOLD_OUT");
  }

  // 1..remainingSlots 균등 추첨 → 앞쪽 hitRemaining 구간이면 HIT
  const roll = Math.floor(Math.random() * remainingSlots) + 1;
  let result;
  if (roll <= hitRemaining) {
    let acc = 0, chosen = null;
    for (const h of hits) { acc += h.remaining; if (roll <= acc) { chosen = h; break; } }
    const r = await c.run("UPDATE hits SET remaining = remaining-1 WHERE id=? AND remaining>0", [chosen.id]);
    if (!r.changes) throw new Error("SOLD_OUT"); // 경합 보호
    result = { grade: "HIT", name: chosen.name, image: chosen.image, point_value: chosen.point_value };
  } else {
    const pool = await c.all("SELECT * FROM point_pool WHERE pack_id=?", [packId]);
    const totalW = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * totalW, chosen = pool[0];
    for (const x of pool) { r -= x.weight; if (r <= 0) { chosen = x; break; } }
    result = { grade: chosen.rarity, name: chosen.name, image: chosen.image, point_value: 100 };
  }

  await c.run("UPDATE packs SET sold_slots = sold_slots+1 WHERE id=?", [packId]);

  // GUARANTEED: 방금 뽑기가 N번째면 보장 상품 추가 지급
  const newCount = pack.sold_slots + 1;
  const g = await c.get("SELECT * FROM guaranteed WHERE pack_id=? AND slot_no=? AND awarded_user IS NULL", [packId, newCount]);
  let bonus = null;
  if (g) {
    await c.run("UPDATE guaranteed SET awarded_user=? WHERE id=?", [userId, g.id]);
    await c.run("INSERT INTO owned_cards (user_id, name, grade, image, point_value, pack_name, created_at) VALUES (?,?,'HIT',?,?,?,?)",
      [userId, g.name + " (GUARANTEED)", g.image, g.point_value, pack.name, db.NOW()]);
    bonus = { name: g.name, slot_no: g.slot_no, point_value: g.point_value };
  }

  const left = await c.get("SELECT COALESCE(SUM(remaining),0) AS s FROM hits WHERE pack_id=?", [packId]);
  if (Number(left.s) === 0) await c.run("UPDATE packs SET active=0 WHERE id=?", [packId]);

  const cardId = await c.insert(
    "INSERT INTO owned_cards (user_id, name, grade, image, point_value, pack_name, created_at) VALUES (?,?,?,?,?,?,?)",
    [userId, result.name, result.grade, result.image, result.point_value, pack.name, db.NOW()]);

  return { ...result, card_id: cardId, draw_no: newCount, bonus };
}

module.exports = { getOdds, draw };
