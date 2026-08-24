// Vercel 진입점 — vercel.json이 모든 요청을 /api/* 로 rewrite 하므로 여기서 /api 접두사를 벗겨 Express에 넘긴다.
// 플랫폼에 따라 req.url이 원본(/admin/overview)일 수도, rewrite 결과(/api/admin/overview)일 수도 있어 양쪽 다 처리한다.
const app = require("../index.js");

function normalize(url) {
  const qi = url.indexOf("?");
  let pathname = qi >= 0 ? url.slice(0, qi) : url;
  const search = qi >= 0 ? url.slice(qi) : "";
  if (pathname === "/api" || pathname === "/api/") pathname = "/";
  else if (pathname.startsWith("/api/")) pathname = pathname.slice(4);
  return pathname + search;
}

module.exports = (req, res) => {
  try {
    req.url = normalize(req.url || "/");
    return app(req, res);
  } catch (e) {
    // 여기서 던지면 Vercel이 HTML 오류 페이지를 반환해 클라이언트의 JSON 파싱이 깨진다 → 항상 JSON으로 응답
    console.error(e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "ENTRY_CRASH", detail: String((e && e.message) || e) }));
  }
};
