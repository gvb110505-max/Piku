// gacha.js — 추첨 코어 (async, 어댑터 기반)
const db = require("./db");
const pay = require("./pay");

// 여러 팩을 한 번에 조회할 때 쓰는 그룹핑 도우미
const groupBy = (rows, key) =>
  rows.reduce((m, r) => ((m[r[key]] = m[r[key]] || []).push(r), m), {});
const HIT_ORDER = (a, b) =>
  (a.tier === "heavy" ? 0 : 1) - (b.tier === "heavy" ? 0 : 1) ||
  b.point_value - a.point_value || a.id - b.id;

// 조회해 온 행들로 응답을 조립한다. 쿼리는 하지 않는다 —
// 단건(getOdds)과 여러 건(getOddsMany)이 같은 규칙을 쓰게 하려고 분리했다.
function buildOdds(pack, hitRows, guarRows, poolRows, reserved) {
  const hits = hitRows.map((h) => ({ ...h, tier: h.tier || "hit" })).sort(HIT_ORDER);
  const remainingSlots = pack.total_slots - pack.sold_slots;
  const hitRemaining = hits.reduce((s, h) => s + h.remaining, 0);
  const soldOut = hitRemaining === 0 || remainingSlots <= 0;

  const rows = guarRows
    .map((g) => ({ ...g, kind: g.kind || "guaranteed", awarded: !!g.awarded_user, next: false }))
    .sort((a, b) => a.slot_no - b.slot_no);
  // 라스트원은 마지막 1구를 여는 사람 몫이라 보장 목록과 따로 내려준다
  const lastOne = rows.find((g) => g.kind === "last_one") || null;
  const guaranteed = rows.filter((g) => g.kind !== "last_one");
  const nextG = guaranteed.find((g) => !g.awarded && g.slot_no > pack.sold_slots);
  if (nextG) nextG.next = true;

  // 일반 한 장이 나올 확률 = (HIT이 아닐 확률) × (그 카드 가중치 / 전체 가중치)
  const pool = [...poolRows].sort((a, b) => b.weight - a.weight || a.id - b.id);
  const totalW = pool.reduce((s, x) => s + Number(x.weight || 0), 0);
  const pointP = remainingSlots > 0 ? (remainingSlots - hitRemaining) / remainingSlots : 0;

  const strip = ({ awarded_user, pack_id, ...rest }) => rest;
  return {
    pack: { id: pack.id, name: pack.name, price: pack.price, list_price: pack.list_price || null,
            point_price: pack.point_price,
            is_welcome: !!pack.is_welcome, image: pack.image,
            total_slots: pack.total_slots, sold_slots: pack.sold_slots,
            remaining_slots: remainingSlots, sold_out: soldOut, active: !!pack.active && !soldOut,
            // 결제 대기로 잡힌 몫. 확률에는 반영하지 않는다 —
            // 표시 확률은 언제나 실제 추첨 확률과 같아야 하고, 추첨은 sold_slots만 본다.
            reserved_slots: reserved, available_slots: Math.max(0, remainingSlots - reserved) },
    hits: hits.map((h) => ({ ...strip(h), probability: remainingSlots > 0 ? h.remaining / remainingSlots : 0 })),
    point_probability: pointP,
    point_remaining: remainingSlots - hitRemaining,
    pool: pool.map((x) => ({ ...strip(x), probability: totalW > 0 ? pointP * (Number(x.weight) / totalW) : 0 })),
    guaranteed: guaranteed.map(strip),
    last_one: lastOne ? strip(lastOne) : null,
  };
}

const HIT_COLS = "id, pack_id, name, image, total_qty, remaining, point_value, COALESCE(tier,'hit') AS tier";
const GUAR_COLS = "id, pack_id, slot_no, name, image, point_value, kind, awarded_user";
const POOL_COLS = "id, pack_id, name, rarity, image, weight";

// 단건. 팩 상세에서 쓴다.
async function getOdds(packId) {
  const pack = await db.get("SELECT * FROM packs WHERE id=?", [packId]);
  if (!pack) return null;
  const [hits, guar, pool, reserved] = await Promise.all([
    db.all(`SELECT ${HIT_COLS} FROM hits WHERE pack_id=?`, [packId]),
    db.all(`SELECT ${GUAR_COLS} FROM guaranteed WHERE pack_id=?`, [packId]),
    db.all(`SELECT ${POOL_COLS} FROM point_pool WHERE pack_id=?`, [packId]),
    pay.reservedSlots(packId),
  ]);
  return buildOdds(pack, hits, guar, pool, reserved);
}

// 여러 건. 목록(/packs)은 팩이 몇 개든 쿼리 4번으로 끝낸다 —
// 팩마다 6번씩 돌리면 홈 한 번 여는 데 수십 개가 나가고, 그게 그대로 DB 한계가 된다.
async function getOddsMany(packIds) {
  if (!packIds.length) return [];
  const ids = packIds.map(Number);
  const list = ids.join(",");   // 숫자만 넣으므로 주입 위험이 없다
  const [packs, hits, guar, pool, reserved] = await Promise.all([
    db.all(`SELECT * FROM packs WHERE id IN (${list})`),
    db.all(`SELECT ${HIT_COLS} FROM hits WHERE pack_id IN (${list})`),
    db.all(`SELECT ${GUAR_COLS} FROM guaranteed WHERE pack_id IN (${list})`),
    db.all(`SELECT ${POOL_COLS} FROM point_pool WHERE pack_id IN (${list})`),
    pay.reservedSlotsMany(ids),
  ]);
  const hitsBy = groupBy(hits, "pack_id"), guarBy = groupBy(guar, "pack_id"), poolBy = groupBy(pool, "pack_id");
  const byId = new Map(packs.map((p) => [Number(p.id), p]));
  // 호출한 쪽이 넘긴 순서를 그대로 지킨다
  return ids.filter((id) => byId.has(id)).map((id) =>
    buildOdds(byId.get(id), hitsBy[id] || [], guarBy[id] || [], poolBy[id] || [], reserved.get(id) || 0));
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
  // 라스트원(slot_no = 총 슬롯)도 같은 규칙으로 지급된다 — 마지막 1구를 연 사람 몫.
  const newCount = pack.sold_slots + 1;
  const g = await c.get(
    `SELECT * FROM guaranteed WHERE pack_id=? AND slot_no=? AND awarded_user IS NULL
     ORDER BY (CASE WHEN kind='last_one' THEN 0 ELSE 1 END)`, [packId, newCount]);
  let bonus = null;
  if (g) {
    const kind = g.kind || "guaranteed";
    const suffix = kind === "last_one" ? " (LAST ONE)" : " (GUARANTEED)";
    await c.run("UPDATE guaranteed SET awarded_user=? WHERE id=?", [userId, g.id]);
    await c.run("INSERT INTO owned_cards (user_id, name, grade, image, point_value, pack_name, created_at) VALUES (?,?,'HIT',?,?,?,?)",
      [userId, g.name + suffix, g.image, g.point_value, pack.name, db.NOW()]);
    bonus = { name: g.name, slot_no: g.slot_no, point_value: g.point_value, kind };
  }

  const left = await c.get("SELECT COALESCE(SUM(remaining),0) AS s FROM hits WHERE pack_id=?", [packId]);
  if (Number(left.s) === 0) await c.run("UPDATE packs SET active=0 WHERE id=?", [packId]);

  const cardId = await c.insert(
    "INSERT INTO owned_cards (user_id, name, grade, image, point_value, pack_name, created_at) VALUES (?,?,?,?,?,?,?)",
    [userId, result.name, result.grade, result.image, result.point_value, pack.name, db.NOW()]);

  return { ...result, card_id: cardId, draw_no: newCount, bonus };
}

module.exports = { getOdds, getOddsMany, draw };
