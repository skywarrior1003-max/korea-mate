// Cloudflare Pages Function — POST /api/spots/reactions
//
// 사용자 dislike 기록. 예전에는 브라우저가 anon key 로 spot_reactions 에 직접
// INSERT 했다. 그러면 정책이 `WITH CHECK (true)` 라 아무나 같은 장소에 무한히
// 넣을 수 있고, device_id 도 클라이언트가 보내는 값이라 위조가 가능했다.
// 관리자 화면이 이 행 수로 "신뢰도 이슈 스팟"을 판정하므로 집계 조작이 곧
// 관리자 판단 오염이 된다. 그래서 쓰기를 서버로 옮긴다.
//
// SECURITY CONTRACT:
// - service_role 키는 서버에서만 쓴다. 브라우저로 절대 나가지 않는다
// - 입력은 place_id / reaction / x-device-id 뿐. SQL 문자열 조합 없음(PostgREST)
// - reaction 은 현재 실제로 존재하는 값만 허용한다(운영 실측: 'dislike' 1종)
// - 응답에 raw device_id · 내부 DB id · row 원문 · DB 오류 원문을 넣지 않는다
// - 로그에도 raw device_id 를 남기지 않는다
// - unique 위반(23505)은 오류가 아니라 "이미 반영됨"이다 — 038 적용 전에도
//   적용 후에도 클라이언트 계약이 동일해야 한다

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface Ctx { request: Request; env: Env }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// 운영 spot_reactions 실측 계약 (2026-08-05):
//   place_id  varchar(255) NOT NULL · 실데이터 12~18자 · 전부 [A-Za-z0-9_.:-]
//   reaction  varchar(20)  NOT NULL · 실데이터 'dislike' 1종
//   device_id varchar(255) NULL     · 실데이터 전부 36자 UUID
const ALLOWED_REACTIONS = new Set(["dislike"]);
const PLACE_ID_MAX = 128;
const PLACE_ID_RE  = /^[A-Za-z0-9_.:-]+$/;
const DEVICE_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_BODY_BYTES = 2 * 1024;

// 한 기기가 짧은 시간에 여러 장소를 쏟아붓는 것만 막는다. isolate 안에서만
// 유지되므로 완전한 방어가 아니다 — contact.ts 가 쓰는 방식과 같은 한계다.
// 새 패키지나 테이블을 만들지 않기 위한 선택이며, 남은 위험으로 보고한다.
const RATE_MAX = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (hit.count >= RATE_MAX) return false;
  hit.count++;
  return true;
}

export const onRequestPost: (ctx: Ctx) => Promise<Response> = async ({ request, env }) => {
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!DEVICE_ID_RE.test(deviceId)) return json({ error: "invalid device id" }, 400);

  // 본문이 커지면 파싱 전에 끊는다
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  let body: { place_id?: unknown; reaction?: unknown };
  try { body = JSON.parse(raw) as typeof body; }
  catch { return json({ error: "invalid json" }, 400); }

  const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
  if (!placeId || placeId.length > PLACE_ID_MAX || !PLACE_ID_RE.test(placeId)) {
    return json({ error: "invalid place_id" }, 400);
  }

  const reaction = typeof body.reaction === "string" ? body.reaction.trim().toLowerCase() : "";
  if (!ALLOWED_REACTIONS.has(reaction)) return json({ error: "unsupported reaction" }, 400);

  if (!underRateLimit(deviceId)) return json({ error: "too many requests" }, 429);

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[spot-reactions] service role not configured");
    return json({ error: "not configured" }, 503);
  }

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/spot_reactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ place_id: placeId, reaction, device_id: deviceId }),
    });
  } catch {
    console.error("[spot-reactions] upstream request failed");
    return json({ error: "server error" }, 502);
  }

  if (res.status === 201 || res.status === 200 || res.status === 204) {
    return json({ status: "recorded" }, 201);
  }

  // 038 적용 후 같은 (device, place, reaction) 재시도는 여기로 온다.
  // 사용자 입장에서는 이미 반영된 것이므로 성공으로 답한다.
  if (res.status === 409) {
    const detail = await res.text();
    if (detail.includes("23505")) return json({ status: "already_recorded" }, 200);
  }

  // 원문에 컬럼·제약·키 정보가 섞여 있어 그대로 내보내지 않는다
  console.error("[spot-reactions] insert failed with status", res.status);
  return json({ error: "server error" }, 502);
};

// POST 외 method 는 405. 라우트 자체가 없는 것처럼 보이지 않게 한다.
export const onRequest: (ctx: Ctx) => Promise<Response> = async (ctx) => {
  if (ctx.request.method === "POST") return onRequestPost(ctx);
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
};
