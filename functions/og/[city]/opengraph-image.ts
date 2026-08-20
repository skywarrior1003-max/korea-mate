// Cloudflare Pages Function: /og/:city/opengraph-image — Content-Type 교정 프록시
// place-detail JSON-LD 등이 참조하는 도시별 OG 이미지(확장자 없는 PNG)의 MIME 을
// image/png 로 바로잡는다. 존재하지 않는 도시는 정적 응답(404 등)이 그대로 통과한다.
// /og/:city/opengraph-image.png 는 build 별칭 정적 파일이라 이 함수를 타지 않는다.
// 배경·안전 계약: src/lib/og-asset-mime.ts 참고 (TASK-OG-FALLBACK-404-FIX-01)

import { withPngContentType } from "../../../src/lib/og-asset-mime";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> =
  async ({ request, env }) => {
    // env.ASSETS.fetch 는 정적 자산만 조회한다 — 함수로 재진입하지 않는다(재귀 없음)
    return withPngContentType(await env.ASSETS.fetch(request));
  };
