// test-face.js — 얼굴 비율 점수(face/score.js)와 /face 정적 서빙 검증
const fs = require("fs");
for (const f of ["data.db", "data.db-shm", "data.db-wal"])
  try { fs.unlinkSync(__dirname + "/" + f); } catch {}
let pass = 0, fail = 0;
const check = (l, ok, x) => { if (ok) { pass++; console.log("✓ " + l); }
  else { fail++; console.log("✗ " + l, x != null ? JSON.stringify(x) : ""); } };

// 이상 비율을 정확히 따르는 좌우 대칭 얼굴을 합성한다 (중심선 x=500)
function idealFace(M) {
  const p = Array.from({ length: 468 }, () => ({ x: 500, y: 500 }));
  const set = (i, x, y) => { p[i] = { x, y }; };
  const pair = (a, b, dx, y) => { set(a, 500 - dx, y); set(b, 500 + dx, y); };
  for (const [i, k] of M.MIDLINE.entries()) set(k, 500, 200 + i * 20);
  // 눈: 너비 60, 간격 60 → 1:1
  pair(243, 463, 30, 400); pair(130, 359, 90, 400);
  set(9, 500, 350); set(2, 500, 500); set(152, 500, 650);   // 3등분 150:150
  set(13, 500, 548); set(14, 500, 552);                       // 코밑~입 50, 입~턱 100
  pair(64, 294, 50, 490); pair(61, 291, 80.9, 550);           // 코 100, 입 161.8
  pair(234, 454, 150, 450);
  for (const [a, b] of M.PAIRS) if (p[a].x === 500 && p[b].x === 500) pair(a, b, 70, 460);
  return p;
}

(async () => {
  const M = await import("./face/score.js");

  check("ratioScore: 이상값이면 100", M.ratioScore(1.618, 1.618, 0.25) === 100);
  check("ratioScore: tol만큼 벗어나면 50", M.ratioScore(1.25, 1, 0.25) === 50);
  check("ratioScore: 크게/작게 벗어남을 같게 본다", M.ratioScore(1.25, 1, 0.25) === M.ratioScore(0.8, 1, 0.25));

  const L = { o: { x: 500, y: 0 }, d: { x: 0, y: 1 } };
  const r = M.reflect({ x: 420, y: 77 }, L);
  check("reflect: 세로 중심선 반사", Math.abs(r.x - 580) < 1e-9 && Math.abs(r.y - 77) < 1e-9, r);

  const face = idealFace(M);
  const res = M.analyze(face);
  const by = Object.fromEntries(res.metrics.map((m) => [m.key, m.score]));
  check("이상 얼굴: 대칭 100", by.symmetry === 100, by);
  check("이상 얼굴: 모든 항목 100", res.metrics.every((m) => m.score === 100), by);
  check("이상 얼굴: 총점 100, 경고 없음", res.total === 100 && res.warnings.length === 0, res);

  // 한쪽 입꼬리만 옮기면 대칭 점수가 떨어진다
  const skew = idealFace(M); skew[291] = { x: skew[291].x + 25, y: skew[291].y + 15 };
  check("비대칭이면 대칭 점수 하락", M.analyze(skew).metrics[0].score < 100);

  // 얼굴 전체를 회전시키면 점수는 그대로, 기울기 경고만 나온다
  const rot = (q, t) => ({ x: 500 + (q.x - 500) * Math.cos(t) - (q.y - 500) * Math.sin(t),
                           y: 500 + (q.x - 500) * Math.sin(t) + (q.y - 500) * Math.cos(t) });
  const tilted = M.analyze(face.map((q) => rot(q, 20 * Math.PI / 180)));
  check("회전 불변: 총점 유지", tilted.total === 100, tilted.total);
  check("20° 기울면 경고", tilted.warnings.some((w) => w.includes("기울")), tilted.warnings);

  // 서버가 /face를 DB와 무관하게 정적으로 서빙한다
  const app = require("./index.js");
  const srv = app.listen(4810);
  const html = await fetch("http://localhost:4810/face/").then((x) => x.text());
  check("GET /face/ → 앱 페이지", html.includes("얼굴 비율 평가"));
  const js = await fetch("http://localhost:4810/face/score.js");
  check("GET /face/score.js → JS", js.ok && /javascript/.test(js.headers.get("content-type")));
  srv.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
