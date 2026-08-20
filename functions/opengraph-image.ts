// Cloudflare Pages Function: /opengraph-image — Content-Type 교정 프록시
// Next 가 페이지 head 에 주입하는 og:image URL(/opengraph-image?hash)이 이 경로다.
// 정적 산출물(확장자 없는 PNG)을 그대로 서빙하되 MIME 만 image/png 로 바로잡는다.
// /opengraph-image.png 는 build 별칭 정적 파일이라 이 함수를 타지 않는다.
// 배경·안전 계약: src/lib/og-asset-mime.ts 참고 (TASK-OG-FALLBACK-404-FIX-01)

import { withPngContentType } from "../src/lib/og-asset-mime";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> =
  async ({ request, env }) => {
    // env.ASSETS.fetch 는 정적 자산만 조회한다 — 함수로 재진입하지 않는다(재귀 없음)
    return withPngContentType(await env.ASSETS.fetch(request));
  };
