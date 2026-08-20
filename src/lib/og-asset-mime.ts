// gokoreamate — OG 정적 산출물 Content-Type 교정 (TASK-OG-FALLBACK-404-FIX-01)
//
// Next 정적 export 는 opengraph-image.tsx 를 확장자 없는 파일로 내보내고,
// Cloudflare Pages 는 확장자가 없으면 application/octet-stream 으로 서빙한다.
// (_headers 의 Content-Type 지정은 Pages 가 무시한다 — wrangler 실측 확인.)
// crawler 는 octet-stream 을 이미지로 인정하지 않으므로, 이 경로들만 얇은
// Pages Function 이 감싸 Content-Type 을 실제 형식(PNG)으로 바로잡는다.
//
// 안전 계약:
// - body 는 정적 산출물 그대로 — 여기서 만들거나 바꾸지 않는다
// - octet-stream 응답만 교정한다. 404·HTML(SPA fallback) 등은 그대로 통과시켜
//   HTML 에 image/png 를 찍는 사고를 막는다
// - 산출물이 진짜 PNG 인 것은 build-static.mjs 가 서명 검증으로 보장한다

/** octet-stream 으로 서빙된 OG 정적 응답의 Content-Type 을 image/png 로 교정 */
export function withPngContentType(res: Response): Response {
  const ctype = (res.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!res.ok || ctype !== "application/octet-stream") return res;
  const headers = new Headers(res.headers);
  headers.set("Content-Type", "image/png");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(res.body, { status: res.status, headers });
}
