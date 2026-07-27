// Cloudflare Pages Function: GET /img/cover/:assetId
//
// 승인 자산 전용 같은 출처 이미지 프록시.
// 목적: Canvas 오염(CORS)·Mixed Content 해결. 클라이언트는 원본 URL을 절대 보지 않는다.
//
// SECURITY CONTRACT:
// - 입력은 assetId 하나뿐. URL·호스트·경로를 클라이언트가 지정할 수 없다 (SSRF·open proxy 불가)
// - manifest(SSOT)에 존재하는 자산만 허용. 없으면 브랜드 fallback
// - 원본은 manifest 의 HTTPS URL 만 사용 — 로더가 호스트·프로토콜을 이미 검증한다
// - redirect 를 따라가되 최종 호스트를 다시 허용 목록으로 검사
// - GET·HEAD 만 허용
// - 이미지 MIME 만 통과. HTML·JSON 등은 거부
// - 응답 크기 상한 + fetch timeout
// - X-Content-Type-Options: nosniff
// - 원본 URL 을 응답 본문·헤더·오류에 노출하지 않음
// - 실패는 항상 200 브랜드 fallback (Shared 페이지가 깨지지 않도록)

import { COVER_ASSETS } from "../../../src/lib/trip-cover/assets.data";

const ALLOWED_HOSTS = new Set(["tong.visitkorea.or.kr"]);
const ALLOWED_MIME  = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES     = 3 * 1024 * 1024;   // 실측 최대 670KB — 여유 4.5배
const TIMEOUT_MS    = 8000;

interface PagesCtx {
  request: Request;
  params:  Record<string, string | string[]>;
}

/** 원본 실패 시 돌려줄 브랜드 그라데이션 SVG (외부 의존 0) */
function brandFallback(status = 200): Response {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#191C21"/><stop offset="0.55" stop-color="#2A1D1A"/>` +
    `<stop offset="1" stop-color="#FF4A2D"/></linearGradient></defs>` +
    `<rect width="1200" height="630" fill="url(#g)"/>` +
    `<rect x="0" y="0" width="10" height="630" fill="#FF4A2D"/></svg>`;
  return new Response(svg, {
    status,
    headers: {
      "Content-Type":           "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      // 실패 응답은 장기 캐시하지 않는다
      "Cache-Control":          "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const onRequest: (ctx: PagesCtx) => Promise<Response> = async ({ request, params }) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const raw     = params["assetId"];
  const assetId = typeof raw === "string" ? raw : (raw?.[0] ?? "");

  // manifest 화이트리스트 — 여기서 통과하지 못하면 외부 요청 자체를 하지 않는다
  const asset = COVER_ASSETS.find((a) => a.asset_id === assetId);
  if (!asset) return brandFallback();

  let origin: URL;
  try { origin = new URL(asset.image_url); } catch { return brandFallback(); }
  if (origin.protocol !== "https:" || !ALLOWED_HOSTS.has(origin.hostname)) {
    return brandFallback();
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);

  try {
    // 원본(tong.visitkorea.or.kr)은 HEAD 에 405 를 반환한다. 항상 GET 으로 받고
    // 클라이언트가 HEAD 를 요청했으면 본문 없이 헤더만 돌려준다.
    const upstream = await fetch(origin.toString(), {
      method:   "GET",
      redirect: "follow",
      signal:   ctl.signal,
      headers:  { "User-Agent": "GoKoreaMate/1.0 (+https://gokoreamate.com)" },
    });

    // redirect 이후 최종 호스트 재검사
    try {
      const finalHost = new URL(upstream.url || origin.toString()).hostname;
      if (!ALLOWED_HOSTS.has(finalHost)) return brandFallback();
    } catch { return brandFallback(); }

    if (!upstream.ok) return brandFallback();

    const ctype = (upstream.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(ctype)) return brandFallback();   // HTML·JSON 등 거부

    const declared = parseInt(upstream.headers.get("Content-Length") ?? "", 10);
    if (!isNaN(declared) && declared > MAX_BYTES) return brandFallback();

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: outHeaders(ctype) });
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return brandFallback();   // Content-Length 미제공 대비

    return new Response(buf, { status: 200, headers: outHeaders(ctype) });
  } catch {
    // 타임아웃·네트워크 오류 — 원본 URL 을 노출하지 않고 fallback
    return brandFallback();
  } finally {
    clearTimeout(timer);
  }
};

function outHeaders(ctype: string): HeadersInit {
  return {
    // 비표준 image/jpg 를 표준 MIME 으로 정규화
    "Content-Type":           ctype === "image/jpg" ? "image/jpeg" : ctype,
    "X-Content-Type-Options": "nosniff",
    // 승인 관광 자산이고 assetId 별로 내용이 고정이므로 장기 공개 캐시가 안전하다
    "Cache-Control":          "public, max-age=604800, immutable",
    // 같은 출처 사용이 원칙이나, Canvas 안전성을 위해 명시적으로 허용해 둔다
    "Access-Control-Allow-Origin": "*",
  };
}
