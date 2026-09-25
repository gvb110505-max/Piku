// score.js — 얼굴 랜드마크(MediaPipe Face Mesh 468점, 픽셀 좌표)로 비율 점수를 계산한다.
// 브라우저와 Node(test-face.js) 양쪽에서 쓰도록 DOM에 의존하지 않는다.
//
// 인덱스는 이미지 기준: 130/243 = 화면 왼쪽 눈 바깥/안쪽 눈꼬리, 463/359 = 오른쪽 눈 안쪽/바깥.
// 9 = 미간(눈썹 높이), 2 = 코밑, 152 = 턱끝, 64/294 = 콧볼 바깥, 61/291 = 입꼬리.

// 좌우 대칭 쌍 — 중심선에 반사했을 때 서로 겹쳐야 하는 점들
const PAIRS = [
  [33, 263], [133, 362], [159, 386], [145, 374], // 눈
  [70, 300], [105, 334], [55, 285],              // 눈썹
  [64, 294], [98, 327],                          // 콧볼
  [61, 291], [40, 270], [91, 321],               // 입
  [234, 454], [132, 361], [172, 397], [136, 365], [150, 379], // 윤곽
  [50, 280], [117, 346],                         // 광대
];
// 얼굴 세로 중심선 위의 점들 — 이마, 미간, 콧대, 코끝, 인중, 입술, 턱
const MIDLINE = [10, 151, 9, 168, 6, 197, 195, 5, 4, 1, 2, 0, 13, 14, 17, 18, 200, 199, 175, 152];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 이상값에서 벗어난 정도를 0~100으로. 로그 비율로 재서 크게/작게 벗어난 것을 똑같이 본다.
// tol만큼 벗어나면 50점.
function ratioScore(actual, ideal, tol) {
  const d = Math.abs(Math.log(actual / ideal)) / Math.log(1 + tol);
  return Math.round(100 * Math.pow(0.5, d * d));
}

// 중심선: 중심선 점들에 최소제곱으로 x = a·y + b 직선을 맞춘다 (얼굴은 세로로 길어서 y 기준이 안정적)
function fitMidline(p) {
  const pts = MIDLINE.map((i) => p[i]);
  const n = pts.length;
  const my = pts.reduce((s, q) => s + q.y, 0) / n, mx = pts.reduce((s, q) => s + q.x, 0) / n;
  let sxy = 0, syy = 0;
  for (const q of pts) { sxy += (q.y - my) * (q.x - mx); syy += (q.y - my) ** 2; }
  const a = syy ? sxy / syy : 0;
  // 방향 벡터 (a, 1)을 정규화, 기준점 (mx, my)
  const len = Math.hypot(a, 1);
  return { o: { x: mx, y: my }, d: { x: a / len, y: 1 / len } };
}
function reflect(q, L) {
  const vx = q.x - L.o.x, vy = q.y - L.o.y;
  const t = vx * L.d.x + vy * L.d.y;
  const px = L.o.x + t * L.d.x, py = L.o.y + t * L.d.y; // 직선 위 투영점
  return { x: 2 * px - q.x, y: 2 * py - q.y };
}

function analyze(p) {
  const faceW = dist(p[234], p[454]);
  const L = fitMidline(p);

  // 1) 대칭 — 반사한 점이 짝과 얼마나 떨어져 있는지, 얼굴 너비 대비 평균 오차
  const asym = PAIRS.reduce((s, [a, b]) => s + dist(reflect(p[a], L), p[b]), 0) / PAIRS.length / faceW;
  const symmetry = Math.round(100 * Math.pow(0.5, (asym / 0.035) ** 2)); // 오차 3.5%면 50점

  // 2) 중안부 : 하안부 — 미간~코밑, 코밑~턱끝. 이상 1:1
  const middle = dist(p[9], p[2]), lower = dist(p[2], p[152]);
  const thirds = ratioScore(lower / middle, 1.0, 0.25);

  // 3) 인중·입 : 턱 — 코밑~입술 사이, 입술 사이~턱끝. 이상 1:2
  const stomion = mid(p[13], p[14]);
  const upperLip = dist(p[2], stomion), chin = dist(stomion, p[152]);
  const lipChin = ratioScore(chin / upperLip, 2.0, 0.3);

  // 4) 눈 사이 간격 : 눈 너비. 이상 1:1 ("눈 하나 들어갈 간격")
  const eyeW = (dist(p[130], p[243]) + dist(p[463], p[359])) / 2;
  const eyeGap = dist(p[243], p[463]);
  const eyeSpacing = ratioScore(eyeGap / eyeW, 1.0, 0.25);

  // 5) 입 너비 : 코 너비. 이상 1.618 (황금비)
  const mouthW = dist(p[61], p[291]), noseW = dist(p[64], p[294]);
  const golden = ratioScore(mouthW / noseW, 1.618, 0.25);

  const metrics = [
    { key: "symmetry", name: "좌우 대칭", score: symmetry, weight: 30,
      desc: `좌우 특징점 평균 오차 ${(asym * 100).toFixed(1)}% (얼굴 너비 대비)` },
    { key: "thirds", name: "얼굴 3등분", score: thirds, weight: 20,
      desc: `중안부 : 하안부 = 1 : ${(lower / middle).toFixed(2)} (이상 1 : 1)` },
    { key: "lipChin", name: "인중 : 턱", score: lipChin, weight: 15,
      desc: `코밑~입 : 입~턱끝 = 1 : ${(chin / upperLip).toFixed(2)} (이상 1 : 2)` },
    { key: "eyeSpacing", name: "눈 사이 간격", score: eyeSpacing, weight: 20,
      desc: `눈 간격 : 눈 너비 = ${(eyeGap / eyeW).toFixed(2)} : 1 (이상 1 : 1)` },
    { key: "golden", name: "입 : 코 황금비", score: golden, weight: 15,
      desc: `입 너비 : 코 너비 = ${(mouthW / noseW).toFixed(2)} : 1 (이상 1.62 : 1)` },
  ];
  const wsum = metrics.reduce((s, m) => s + m.weight, 0);
  const total = Math.round(metrics.reduce((s, m) => s + m.score * m.weight, 0) / wsum);

  // 고개 돌림·기울기 — 비율이 왜곡되므로 알려준다
  const warnings = [];
  const noseOff = (p[1].x - mid(p[234], p[454]).x) / faceW; // 코끝이 얼굴 가운데서 벗어난 정도
  if (Math.abs(noseOff) > 0.06) warnings.push("고개가 옆으로 돌아가 있어 점수가 낮게 나올 수 있어요.");
  const roll = Math.atan2(p[359].y - p[130].y, p[359].x - p[130].x) * 180 / Math.PI;
  if (Math.abs(roll) > 12) warnings.push("얼굴이 기울어져 있어요. 똑바로 선 사진이 더 정확해요.");

  const best = [...metrics].sort((a, b) => b.score - a.score)[0];
  return { total, metrics, warnings, ...verdict(total), summary: `가장 돋보이는 비율은 ‘${best.name}’이에요.` };
}

function verdict(total) {
  if (total >= 90) return { title: "교과서 같은 비율" };
  if (total >= 80) return { title: "아주 균형 잡힌 얼굴" };
  if (total >= 70) return { title: "조화로운 얼굴" };
  if (total >= 60) return { title: "개성 있는 균형" };
  return { title: "개성이 뚜렷한 얼굴" };
}

export { analyze, ratioScore, fitMidline, reflect, PAIRS, MIDLINE };
