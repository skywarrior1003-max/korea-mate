// Cloudflare Pages Function: GET /api/shared/:id/cover-kind
//
// 공개 일정의 커버가 실제로 개인 사진인지 관광 사진인지만 알려준다.
// Shared 페이지가 KTO 출처를 붙일지 판단하는 데만 쓴다.
//
// 왜 필요한가:
//   get_shared_itinerary RPC 는 cover_kind 를 반환하지 않고, <img> 는 302 추적
//   결과를 JS 에 노출하지 않는다. 그래서 클라이언트는 개인/관광을 구분할 수단이
//   없고, 그대로 두면 사용자의 사진에 "Photo: Korea Tourism Organization" 이
//   붙는다. RPC 재생성(DROP+CREATE) 대신 이 초소형 API 로 해결한다.
//
// SECURITY CONTRACT:
// - 응답은 {"kind":"personal"|"tourism"} 뿐. cover_moment_id·storage_path·
//   device_id 등 내부 값을 일절 반환하지 않는다
// - 비공개·미존재 일정은 404 (존재 여부 누출 방지)
// - 판정은 이미지 프록시와 같은 resolveEffectiveCover 를 쓴다 —
//   "API 는 personal 이라는데 실제 이미지는 관광" 같은 불일치가 생기지 않는다
// - private Storage 파일을 다운로드하지 않는다 (메타데이터만으로 판정)
// - trip_moments.is_public 은 사용하지 않는다
// - migration 031 미적용 환경에서는 안전하게 tourism 으로 떨어진다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { resolveEffectiveCover, type CoverAdminLike } from "../../../../src/lib/trip-cover/cover-state-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string | string[]>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type":  "application/json",
      // 커버 상태는 바뀔 수 있으므로 길게 캐시하지 않는다
      "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const raw = ctx.params["id"];
  const id  = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  if (!UUID_RE.test(id)) return json({ error: "Not found" }, 404);

  const url = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: "Server configuration error" }, 503);

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as CoverAdminLike;

  const result = await resolveEffectiveCover(id, admin);
  if (result.status === 404) return json({ error: "Not found" }, 404);

  return json({ kind: result.kind });
}
