// Cloudflare Pages Function: POST /api/itinerary/view/:id
//
// 공개 공유 일정의 조회수를 서버에서 집계한다.
//
// 왜 서버로 옮겼는가
//   예전에는 브라우저가 anon key 로 /rest/v1/rpc/increment_trip_view 를 직접 불렀다.
//   중복 방지가 sessionStorage 뿐이라 지우거나 curl 로 부르면 무제한 증가했고,
//   Popular·Trending 이 view_count 를 쓰므로 순위까지 부풀릴 수 있었다.
//   이제 집계 결정은 DB 함수 하나(record_public_itinerary_view)가 원자적으로 한다.
//
// 기기 식별
//   기존 x-device-id 계약을 그대로 쓴다(getDeviceId() = localStorage UUID).
//   **원문은 DB 에 저장하지 않는다.** 서버가 SHA-256 해시한 소문자 64 hex 만 넘긴다.
//   IP·User-Agent 는 읽지도 저장하지도 않는다. fingerprinting 없음.
//
// 응답
//   집계 여부·일정 존재 여부·공개 여부를 응답으로 구분할 수 없어야 한다.
//   정상 형식이면 결과와 무관하게 204 를 준다. 그래야 이 endpoint 로 비공개
//   일정의 존재를 탐지할 수 없다.

import { createClient } from "@supabase/supabase-js";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** device id 형식 — 기존 계약(crypto.randomUUID)에 맞춘 길이·문자 검증. */
const DEVICE_ID_MAX = 128;

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Cloudflare Web Crypto — 소문자 64자리 hex. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const itineraryId = (ctx.params.id ?? "").trim();
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary id" }, 400);

  // device id 가 없거나 형식이 이상하면 집계하지 않는다. 다만 실패를 알리지
  // 않는다 — 이 endpoint 는 조회수 집계용이지 검증 결과 통보용이 아니다.
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!deviceId || deviceId.length > DEVICE_ID_MAX || !/^[\w-]+$/.test(deviceId)) {
    return noContent();
  }

  if (!ctx.env.NEXT_PUBLIC_SUPABASE_URL || !ctx.env.SUPABASE_SERVICE_ROLE_KEY) {
    // 설정 문제로 조회수가 안 올라가는 것이 화면을 막아서는 안 된다.
    return noContent();
  }

  // 해시 원문은 device id 뿐이다. IP·UA 를 섞지 않는다 — 섞으면 같은 기기가
  // 네트워크를 바꿀 때마다 새 사람으로 집계되어 dedup 이 무력해진다.
  const viewerHash = await sha256Hex(deviceId.toLowerCase());

  try {
    const admin = createClient(ctx.env.NEXT_PUBLIC_SUPABASE_URL, ctx.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // 반환값(집계 여부)은 응답에 싣지 않는다. 실패해도 조용히 넘어간다.
    await admin.rpc("record_public_itinerary_view", {
      p_itinerary_id: itineraryId,
      p_viewer_hash:  viewerHash,
    });
  } catch {
    // service_role 오류 상세를 사용자에게 노출하지 않는다.
  }

  return noContent();
}

/** POST 외 메서드는 허용하지 않는다. */
export async function onRequest(ctx: PagesCtx): Promise<Response> {
  if (ctx.request.method === "POST") return onRequestPost(ctx);
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
