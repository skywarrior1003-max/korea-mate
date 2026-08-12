// Cloudflare Pages Function: POST /api/user-spots/:id/enrich
//
// 개인 표시값(display_title·display_memo)을 채운다.
//
// 저장은 이미 끝난 뒤에 부른다. 여기서 무슨 일이 나도 사용자가 방금 남긴
// 장소는 그대로다 — 이 경로는 user_spots 를 만들거나 지우지 않고, 두 컬럼
// 외에는 아무것도 쓰지 않는다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 · 소유자 확인, 아니면 404
// - 사실 값은 서버가 읽는다. 클라이언트는 locale 만 보낸다.
// - provider 에게 raw 좌표·사진 경로·signed URL·device id 를 넘기지 않는다
//   (EnrichmentContext 타입에 그 필드가 없다)
// - 저장은 display_title / display_memo 두 컬럼뿐. note·city_spot_id·
//   submission_status·photo_public·related_city_spot_id 는 건드리지 않는다
// - 저장 순간에도 IS NULL 조건을 건다 — 실행 중 사용자가 쓴 값을 덮지 않는다
// - photo_storage_path 는 응답·로그에 담지 않는다
//
// mode 는 기본 off 다. Trip 쪽 스케줄러 AI 와 env 를 공유하지 않는다 —
// 거기를 켠다고 여기가 켜지면 안 된다.

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_USER_SPOT_BODY_BYTES,
  readBodyWithLimit,
} from "../../../../src/lib/itinerary-validate";
import {
  resolveMyPlaceAiMode,
  resolveEnrichLocale,
  buildEnrichmentContext,
  hasEnoughGrounding,
  validateDraftField,
  mockEnrichmentProvider,
  TITLE_MAX,
  MEMO_MAX,
  type EnrichmentProvider,
  type EnrichmentDraft,
} from "../../../../src/lib/user-spots/enrichment-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** off | mock | live. 없으면 off. */
  MY_PLACES_AI_MODE?: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  // ── mode — 켜져 있지 않으면 아무것도 하지 않는다 ────────────────────────────
  // 소유권 확인보다 먼저 끊는다. 꺼져 있을 때 DB 를 읽을 이유가 없다.
  const mode = resolveMyPlaceAiMode(ctx.env.MY_PLACES_AI_MODE);
  if (mode === "off") {
    return json({ status: "disabled", updated: { title: false, memo: false } });
  }

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_USER_SPOT_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }
  const read = await readBodyWithLimit(ctx.request, MAX_USER_SPOT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const locale = resolveEnrichLocale((read.body as Record<string, unknown>).locale);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 소유한 행 ───────────────────────────────────────────────────────────────
  const { data: spot, error: spotErr } = await admin
    .from("user_spots")
    .select("id, name, city, category, lat, lng, note, display_title, display_memo, related_city_spot_id, photo_storage_path")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (spotErr) {
    console.error("[user-spots/:id/enrich] db error:", spotErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (!spot) return json({ error: "Not found" }, 404);

  const row = spot as {
    name: string | null; city: string | null; category: string | null;
    lat: number | null; lng: number | null; note: string | null;
    display_title: string | null; display_memo: string | null;
    related_city_spot_id: number | null; photo_storage_path: string | null;
  };

  // ── 이미 값이 있으면 부르지 않는다 ──────────────────────────────────────────
  // 사용자가 쓴 것이든 지난번에 만든 것이든, 있는 값을 다시 만들 이유가 없다.
  const needTitle = (row.display_title ?? "").trim() === "";
  const needMemo  = (row.display_memo  ?? "").trim() === "";
  if (!needTitle && !needMemo) {
    return json({ status: "already_enriched", updated: { title: false, memo: false } });
  }

  // ── 사실 근거 모으기 ────────────────────────────────────────────────────────
  let canonical = null;
  if (row.related_city_spot_id !== null) {
    const { data } = await admin
      .from("city_spots")
      .select("name, city, category, subcategory, district")
      .eq("id", row.related_city_spot_id)
      .maybeSingle();
    canonical = (data ?? null) as
      | { name: string | null; city: string | null; category: string | null; subcategory: string | null; district: string | null }
      | null;
  }

  const context = buildEnrichmentContext(
    {
      name: row.name, city: row.city, category: row.category,
      lat: row.lat, lng: row.lng, note: row.note,
      hasPhoto: typeof row.photo_storage_path === "string" && row.photo_storage_path.length > 0,
    },
    canonical,
    locale,
  );

  // 사진만 있고 어디인지 모르면 만들지 않는다. 모르는 장소를 아는 척하는
  // 문장은 기록이 아니라 창작이다.
  if (!hasEnoughGrounding(context)) {
    return json({ status: "insufficient_context", updated: { title: false, memo: false } });
  }

  // ── provider ────────────────────────────────────────────────────────────────
  // live 는 아직 어디에도 연결되어 있지 않다. 켜더라도 외부로 나가지 않는다.
  let provider: EnrichmentProvider | null = null;
  if (mode === "mock") provider = mockEnrichmentProvider;
  if (!provider) {
    return json({ status: "provider_unavailable", updated: { title: false, memo: false } });
  }

  let draft: EnrichmentDraft;
  try {
    draft = await provider({ context, needTitle, needMemo });
  } catch (err) {
    // 실패는 실패일 뿐이다. 장소는 그대로 남는다.
    console.error("[user-spots/:id/enrich] provider failed:", err instanceof Error ? err.name : "unknown");
    return json({ status: "provider_failed", updated: { title: false, memo: false } }, 200);
  }

  const title = needTitle ? validateDraftField(draft.title, TITLE_MAX) : null;
  const memo  = needMemo  ? validateDraftField(draft.memo,  MEMO_MAX)  : null;

  // ── 저장 — 두 컬럼을 따로, 그리고 저장 순간에도 NULL 조건을 건다 ────────────
  // 읽을 때 비어 있었다는 사실만으로 UPDATE 하면, 그 사이에 사용자가 쓴 값을
  // 덮는다. 제목과 메모를 따로 거는 이유도 같다 — 사용자가 제목만 쓰고 메모는
  // 비워 두었다면 제목은 지키고 메모만 채워야 한다.
  const updated = { title: false, memo: false };

  if (title) {
    const { data, error } = await admin
      .from("user_spots")
      .update({ display_title: title, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("device_id", deviceId)
      .is("display_title", null)
      .select("id");
    if (error) console.error("[user-spots/:id/enrich] title write error:", error.code);
    else updated.title = (data?.length ?? 0) > 0;
  }

  if (memo) {
    const { data, error } = await admin
      .from("user_spots")
      .update({ display_memo: memo, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("device_id", deviceId)
      .is("display_memo", null)
      .select("id");
    if (error) console.error("[user-spots/:id/enrich] memo write error:", error.code);
    else updated.memo = (data?.length ?? 0) > 0;
  }

  return json({ status: "ok", updated });
}
