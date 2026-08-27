// catalog.js — 판매 카탈로그 정의.
//
// 시드(빈 DB)와 관리자 리셋이 같은 정의를 쓰도록 한 곳에 모아둔다.
// 두 군데에 나눠 적으면 반드시 어긋난다.
//
// 설계 규칙
//   · 원가율 약 35% — HIT 원가 합 ≈ 판매가 × 총 슬롯 × 0.35
//   · 보장(GUARANTEED) 10개는 균등 배치하고, 마지막 슬롯은 라스트원 몫으로 비워둔다
//   · 라스트원 = 마지막 1구를 여는 사람이 받는 상품. 슬롯이 소진되는 순간 확정된다

// 보장 10개를 균등 배치. 마지막 슬롯(라스트원)과 겹치지 않게 11등분한다.
function milestones(slots) {
  const unit = slots >= 5000 ? 100 : slots >= 1000 ? 50 : 10;
  const out = [];
  for (let i = 1; i <= 10; i++) {
    let n = Math.round((slots * i) / 11 / unit) * unit;
    n = Math.max(unit, Math.min(slots - 1, n));
    if (out.length && n <= out[out.length - 1]) n = out[out.length - 1] + unit;  // 반올림 충돌
    out.push(n);
  }
  return out;
}

// price × slots × 0.35 ≈ hits 원가 합 이 되도록 잡아둔 카탈로그.
// tier: premium = 상단 큰 화면(히어로), normal = 가로 슬라이드
const PACKS = [
  {
    name: "리자몽 SAR 마스터", price: 100000, list_price: 130000, slots: 300, tier: "premium",
    hits: [
      ["리자몽 SAR (PSA10)", 1, 4000000, 4500000],
      ["리자몽 UR", 2, 1000000, 1200000],
      ["뮤츠 SAR", 3, 500000, 600000],
      ["리자몽 AR", 8, 120000, 150000],
    ],
    guaranteed: ["[JP] 메가 하이클래스팩 박스", 120000],
    last_one: ["리자몽 SAR 라스트원 슬랩", 2500000],
  },
  {
    name: "원종 3신조 하이엔드", price: 50000, list_price: 65000, slots: 300, tier: "premium",
    hits: [
      ["파이어 SAR", 1, 1300000, 1500000],
      ["프리져 SAR", 1, 1200000, 1400000],
      ["썬더 SAR", 1, 1100000, 1300000],
      ["원종 3신조 AR", 6, 100000, 120000],
    ],
    guaranteed: ["[JP] 하이클래스팩 박스 ×2", 100000],
    last_one: ["원종 3신조 SAR 3종 세트", 3600000],
  },
  {
    name: "뮤츠 컬렉터", price: 30000, list_price: 39000, slots: 500, tier: "premium",
    hits: [
      ["뮤츠 UR (PSA10)", 1, 1800000, 2000000],
      ["뮤츠 SAR", 2, 620000, 700000],
      ["뮤 SAR", 3, 350000, 400000],
      ["뮤츠 AR", 10, 55000, 65000],
    ],
    guaranteed: ["[JP] 초코 상자 세트", 80000],
    last_one: ["뮤츠 UR 라스트원 슬랩", 1800000],
  },
  {
    name: "이브이 프리미엄", price: 20000, list_price: 26000, slots: 800, tier: "normal",
    hits: [
      ["이브이즈 SAR", 2, 1050000, 1200000],
      ["님피아 SR", 4, 350000, 400000],
      ["이브이 AR", 12, 70000, 80000],
      ["부스터 SR", 8, 70000, 80000],
    ],
    guaranteed: ["이브이 히어로즈 박스", 70000],
    last_one: ["이브이즈 SAR 라스트원", 1200000],
  },
  {
    name: "피카츄 데일리", price: 10000, list_price: 13000, slots: 1500, tier: "normal",
    hits: [
      ["피카츄 프로모 (PSA10)", 1, 1300000, 1500000],
      ["피카츄 SAR", 3, 520000, 600000],
      ["피카츄 AR", 12, 70000, 80000],
      ["라이츄 SR", 15, 50000, 60000],
    ],
    guaranteed: ["[JP] 하이클래스팩 박스", 60000],
    last_one: ["피카츄 SAR 라스트원", 900000],
  },
  {
    name: "테라스탈 챌린지", price: 5000, list_price: 6500, slots: 3000, tier: "normal",
    hits: [
      ["테라스탈 리자몽", 2, 880000, 1000000],
      ["테라스탈 SAR", 5, 260000, 300000],
      ["테라스탈 SR", 20, 42000, 50000],
      ["테라스탈 AR", 30, 20000, 25000],
    ],
    guaranteed: ["테라스탈 페스타 박스", 45000],
    last_one: ["테라스탈 리자몽 라스트원", 900000],
  },
  {
    name: "스타터 부스터", price: 3000, list_price: 4000, slots: 5000, tier: "normal",
    hits: [
      ["이상해꽃 SAR", 3, 520000, 600000],
      ["꼬부기 계열 SR", 15, 85000, 100000],
      ["스타터 AR", 40, 25000, 30000],
      ["스타터 프로모", 50, 12000, 15000],
    ],
    guaranteed: ["스타터 덱 세트", 35000],
    last_one: ["이상해꽃 SAR 라스트원", 600000],
  },
  {
    name: "럭키 드로우", price: 2000, list_price: 2600, slots: 8000, tier: "normal",
    hits: [
      ["뮤 SAR", 2, 700000, 800000],
      ["럭키 SR", 20, 70000, 80000],
      ["럭키 AR", 60, 20000, 25000],
      ["럭키 프로모", 60, 12000, 15000],
    ],
    guaranteed: ["부스터팩 10팩 묶음", 30000],
    last_one: ["뮤 SAR 라스트원", 700000],
  },
  {
    name: "원코인 데일리", price: 1000, list_price: 1300, slots: 10000, tier: "normal",
    hits: [
      ["리자몽 AR", 1, 880000, 1000000],
      ["데일리 SR", 10, 70000, 80000],
      ["데일리 AR", 40, 16000, 20000],
      ["데일리 프로모", 90, 8000, 10000],
    ],
    guaranteed: ["부스터팩 5팩 묶음", 15000],
    last_one: ["리자몽 AR 라스트원", 880000],
  },
  {
    name: "미니 원코인", price: 500, list_price: 700, slots: 12000, tier: "normal",
    hits: [
      ["피카츄 AR", 1, 260000, 300000],
      ["미니 SR", 10, 42000, 50000],
      ["미니 AR", 30, 13000, 15000],
      ["미니 프로모", 120, 6000, 7000],
    ],
    guaranteed: ["부스터팩 3팩 묶음", 9000],
    last_one: ["피카츄 AR 라스트원", 260000],
  },
];

const WELCOME = {
  name: "웰컴 팩", price: 0, point_price: 1000, slots: 2000,
  hits: [["피카츄 프로모(웰컴)", 60, 5000, 3000]],
};

const POOL = [
  ["꼬부기", "common", 30], ["파이리", "common", 30], ["이상해씨", "common", 30],
  ["피카츄", "uncommon", 15], ["이브이", "uncommon", 15],
  ["망나뇽", "rare", 5], ["갸라도스", "rare", 5],
];

// c = 트랜잭션 컨텍스트 또는 루트 어댑터. NOW는 db.NOW.
async function insertCatalog(c) {
  const ids = [];
  for (const p of PACKS) {
    const pid = await c.insert(
      "INSERT INTO packs (name, price, point_price, is_welcome, total_slots, image, list_price) VALUES (?,?,0,0,?,'',?)",
      [p.name, p.price, p.slots, p.list_price || null]);
    ids.push(pid);
    for (const [name, qty, pv, cost] of p.hits) {
      await c.run(
        "INSERT INTO hits (pack_id, name, grade, image, total_qty, remaining, point_value, cost) VALUES (?,?,'HIT','',?,?,?,?)",
        [pid, name, qty, qty, pv, cost]);
    }
    // 이름에 "(보장 N)"을 붙이면 목록에서 잘려서 상품명이 안 보인다 — 순번은 slot_no가 말해준다
    const [gName, gValue] = p.guaranteed;
    for (const slot of milestones(p.slots)) {
      await c.run(
        "INSERT INTO guaranteed (pack_id, slot_no, name, image, point_value, kind) VALUES (?,?,?,'',?,'guaranteed')",
        [pid, slot, gName, gValue]);
    }
    const [lName, lValue] = p.last_one;
    await c.run(
      "INSERT INTO guaranteed (pack_id, slot_no, name, image, point_value, kind) VALUES (?,?,?,'',?,'last_one')",
      [pid, p.slots, lName, lValue]);
  }

  const wid = await c.insert(
    "INSERT INTO packs (name, price, point_price, is_welcome, total_slots, image, list_price) VALUES (?,?,?,1,?,'',NULL)",
    [WELCOME.name, WELCOME.price, WELCOME.point_price, WELCOME.slots]);
  for (const [name, qty, pv, cost] of WELCOME.hits) {
    await c.run(
      "INSERT INTO hits (pack_id, name, grade, image, total_qty, remaining, point_value, cost) VALUES (?,?,'HIT','',?,?,?,?)",
      [wid, name, qty, qty, pv, cost]);
  }

  for (const pid of [...ids, wid]) {
    for (const [name, rarity, weight] of POOL) {
      await c.run("INSERT INTO point_pool (pack_id, name, rarity, image, weight) VALUES (?,?,?,'',?)",
        [pid, name, rarity, weight]);
    }
  }
  return { pack_ids: ids, welcome_id: wid };
}

module.exports = { PACKS, WELCOME, POOL, milestones, insertCatalog };
