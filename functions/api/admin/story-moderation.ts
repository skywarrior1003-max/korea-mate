// Cloudflare Pages Function: POST /api/admin/story-moderation
//
// 관리자가 공개 Story 를 가리거나 푼다.
//
// 가리는 것은 지우는 것이 아니다
//   사용자의 My Trip·Memory·사진·메모·동의 기록은 그대로 둔다. 바깥으로
//   나가는 길만 닫는다. 신고가 잘못된 것으로 밝혀지면 그대로 되돌릴 수 있어야
//   하고, 되돌릴 수 없는 조작은 관리자에게도 주지 않는다.
//
// 가릴 때 공개도 함께 내린다
//   기존 공개 경로가 전부 `is_public` 을 보고 있다. 그것까지 내려야 Story·
//   사진 프록시·Copy·OG 가 한꺼번에 닫힌다.
//
// 풀 때는 공개를 켜 주지 않는다
//   막힌 것만 푼다. 다시 공개할지는 만든 사람이 정한다 — 관리자가 남의 여행을
//   대신 공개해 주는 일은 없다.
//
// SECURITY CONTRACT:
// - 기존 관리자 인증(`checkAdminAuth` + ADMIN_KEY)을 그대로 쓴다. 미설정이면 503
// - Memory 의 공개 선택(`trip_moments.is_public`)을 건드리지 않는다 —
//   그건 만든 사람이 무엇을 넣기로 골랐는지의 기록이다
// - 응답에 device_id·저장 경로·좌표를 담지 않는다

import { json, checkAdminAuth } from "../../_lib/admin-auth";
import { buildModerationPatch } from "../../../src/lib/moderation/story-moderation-core";
import { UUID_RE, readBodyWithLimit, MAX_SMALL_BODY_BYTES } from "../../../src/lib/itinerary-validate";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_KEY?: string;
}

interface Ctx {
  request: Request;
  env:     Env;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const authErr = checkAdminAuth(ctx.request, ctx.env.ADMIN_KEY);
  if (authErr) return authErr;

  const url = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: "Server configuration error" }, 503);

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  const id = typeof body.itinerary_id === "string" ? body.itinerary_id.trim() : "";
  if (!UUID_RE.test(id)) return json({ error: "Invalid itinerary_id" }, 400);
  if (typeof body.hidden !== "boolean") return json({ error: "hidden must be boolean" }, 400);

  const patch = buildModerationPatch(body.hidden, new Date().toISOString());

  const res = await fetch(
    `${url}/rest/v1/itineraries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey:         key,
        Authorization:  `Bearer ${key}`,
        Prefer:         "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) {
    console.error("[story-moderation] patch failed:", res.status);
    return json({ error: "Failed to update" }, 500);
  }

  return json({ hidden: body.hidden });
}
