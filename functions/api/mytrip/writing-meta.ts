// POST /api/mytrip/writing-meta — AI 후보의 선택·저장 행동 메타(§E)
//
// 저장 범위(§E 허용 목록만): 어떤 문체를 골랐는지 / 그대로 썼는지·수정했는지 /
// 제목·본문 글자 수 변화 / 생성→선택→저장 여부. 사용자 문장 원문·사진은 받지도
// 저장하지도 않는다. provider 호출 0. 실패해도 사용자 흐름에 영향 없는 best-effort.
//
// 소유 검증: x-device-id 가 해당 itinerary 소유자여야 하고, generation row 가
// 그 itinerary 에 속해야 한다 — 다른 device 가 generation ID 를 추측해도
// 소유 검증에서 끊긴다(§L).

import { createClient } from "@supabase/supabase-js";
import { HEAVY_EDIT_TITLE_DELTA, HEAVY_EDIT_MEMO_DELTA } from "../../../src/lib/mytrip-writing/trend-curation";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEN_TABLE = "mytrip_ai_generations";
const TREND_TABLE = "mytrip_trend_packs";

/** §10 익명 집계 +1 — best-effort(사용자 흐름 무영향) */
async function bumpTrend(admin: ReturnType<typeof createClient>, trendId: string, col: string): Promise<void> {
  try {
    const { data } = await admin.from(TREND_TABLE).select(col).eq("id", trendId).maybeSingle();
    const cur = (data as Record<string, number> | null)?.[col];
    if (typeof cur === "number") await admin.from(TREND_TABLE).update({ [col]: cur + 1, updated_at: new Date().toISOString() }).eq("id", trendId);
  } catch { /* ignore */ }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestPost(ctx: { request: Request; env: Env }): Promise<Response> {
  const url = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ ok: false }, 503);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ ok: false }, 400);

  let body: {
    itineraryId?: unknown; generationId?: unknown; event?: unknown;
    style?: unknown; edited?: unknown; titleLenDelta?: unknown; memoLenDelta?: unknown;
  };
  try { body = await ctx.request.json() as typeof body; } catch { return json({ ok: false }, 400); }

  const itineraryId = typeof body.itineraryId === "string" && UUID_RE.test(body.itineraryId) ? body.itineraryId : null;
  const generationId = typeof body.generationId === "string" && UUID_RE.test(body.generationId) ? body.generationId : null;
  const event = body.event === "select" || body.event === "save" ? body.event : null;
  if (!itineraryId || !generationId || !event) return json({ ok: false }, 400);

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: owned } = await admin.from("itineraries").select("id").eq("id", itineraryId).eq("device_id", deviceId).maybeSingle();
  if (!owned) return json({ ok: false }, 404);

  const patch: Record<string, unknown> = {};
  if (event === "select") {
    const style = body.style === "calm" || body.style === "witty" || body.style === "warm" ? body.style : null;
    if (!style) return json({ ok: false }, 400);
    patch.chosen_style = style;
    patch.chosen_at = new Date().toISOString();
  } else {
    patch.saved = true;
    if (typeof body.edited === "boolean") patch.edited = body.edited;
    const clampDelta = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(-500, Math.min(500, Math.round(v))) : null;
    patch.title_len_delta = clampDelta(body.titleLenDelta);
    patch.memo_len_delta = clampDelta(body.memoLenDelta);
  }
  // generation 이 이 itinerary 소속일 때만 갱신된다 — 추측 ID 차단(§L)
  const { error } = await admin.from(GEN_TABLE).update(patch).eq("id", generationId).eq("itinerary_id", itineraryId);

  // §10 — 이 generation 이 trend 표현을 썼다면 익명 집계에 반영한다
  if (!error) {
    const { data: gen } = await admin.from(GEN_TABLE).select("trend_used_id").eq("id", generationId).maybeSingle();
    const trendId = (gen as { trend_used_id?: string | null } | null)?.trend_used_id;
    if (trendId) {
      if (event === "select" && patch.chosen_style === "witty") await bumpTrend(admin, trendId, "selected_count");
      if (event === "save") {
        await bumpTrend(admin, trendId, "saved_count");
        const heavy = (typeof patch.title_len_delta === "number" && Math.abs(patch.title_len_delta) >= HEAVY_EDIT_TITLE_DELTA) ||
                      (typeof patch.memo_len_delta === "number" && Math.abs(patch.memo_len_delta) >= HEAVY_EDIT_MEMO_DELTA);
        if (patch.edited === true && heavy) await bumpTrend(admin, trendId, "heavily_edited_count");
      }
    }
  }
  return json({ ok: !error });
}
