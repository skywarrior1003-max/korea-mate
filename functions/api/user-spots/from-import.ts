// Cloudflare Pages Function: POST /api/user-spots/from-import
// (GOKOREAMATE-EXTERNAL-TRIP-IMPORT-AND-GUIDED-JOURNEY-V2 · 2026-09-30)
//
// 사용자가 가져온 글·링크에 적힌 장소 중 서비스 장소(city_spots)와 확실히 맞지 않는 것을
// **버리지 않고** 내 장소(user_spots)로 보존한다. 5개 도시 밖 장소도 같다.
//
// 계약
//  · 근거 = 가져온 출처(import_source: 'text' 또는 링크 host). 좌표·주소를 지어내지 않는다 —
//    위치는 사용자가 나중에 기존 지도 확인 흐름으로 정한다. 수동 등록(POST /api/user-spots)의
//    "좌표 필수" 규칙은 그대로다 — 이 경로는 가져오기에서만 쓴다.
//  · 외부 원문의 평점·영업시간·이미지 URL 은 받지 않는다(이름·짧은 설명·도시만).
//  · 같은 출처에서 같은 이름을 다시 가져오면 새 행을 만들지 않고 기존 행을 돌려준다.
//  · 소유권은 공통 판정기(resolveOwnership) — device + 선택적 로그인.
//
// body: { source: string, items: [{ name: string, note?: string, city?: string }] }  (최대 40)
// 200:  { items: [{ name, id, reused }] }

import { createClient } from "@supabase/supabase-js";
import { MAX_USER_SPOT_BODY_BYTES, readBodyWithLimit, str, optStr } from "../../../src/lib/itinerary-validate";
import { resolveOwnership, type OwnershipEnv } from "../../_lib/ownership.ts";
import { tripCityKey } from "../../../src/data/cities/trip-city.ts";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MAX_ITEMS = 40;
/** 'text'(붙여넣은 글) 또는 링크의 host — 전체 URL·경로·질의는 싣지 않는다 */
const SOURCE_RE = /^(text|[a-z0-9-]+(\.[a-z0-9-]+)+)$/;

export async function onRequestPost(ctx: { request: Request; env: Env }): Promise<Response> {
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;

  const read = await readBodyWithLimit(ctx.request, MAX_USER_SPOT_BODY_BYTES * 4);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as { source?: unknown; items?: unknown };

  const source = typeof body.source === "string" ? body.source.trim().toLowerCase() : "";
  if (!SOURCE_RE.test(source) || source.length > 120) return json({ error: "invalid source" }, 400);
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    return json({ error: "invalid items" }, 400);
  }

  // 이름 정리·중복 제거(대소문자·공백 무시)
  const wanted: { name: string; note: string | null; city: string | null; key: string }[] = [];
  const seen = new Set<string>();
  for (const raw of body.items as Record<string, unknown>[]) {
    const name = str(raw?.name, 120);
    if (!name || name.trim().length < 2) continue;
    const key = name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    wanted.push({ name: name.replace(/\s+/g, " ").trim(), note: optStr(raw?.note, 300) ?? null, city: tripCityKey(optStr(raw?.city, 100) ?? null) || null, key }); // 같은 도시는 한 값(강릉·gangneung → gangneung)
  }
  if (wanted.length === 0) return json({ error: "invalid items" }, 400);

  let admin;
  try {
    admin = createClient(ctx.env.NEXT_PUBLIC_SUPABASE_URL, ctx.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  } catch { return json({ error: "Server configuration error" }, 503); }

  // 같은 출처에서 이미 보존한 장소 — 다시 만들지 않는다
  const { data: existing, error: exErr } = await admin
    .from("user_spots")
    .select("id, name")
    .in("device_id", own.devices)
    .eq("import_source", source)
    .limit(500);
  if (exErr) {
    console.error("[user-spots from-import] lookup error:", exErr.code);
    return json({ error: "Failed to save places" }, 500);
  }
  const byKey = new Map<string, string>();
  for (const r of (existing ?? []) as { id: string; name: string | null }[]) {
    if (r.name) byKey.set(r.name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(), r.id);
  }

  const out: { name: string; id: string; reused: boolean }[] = [];
  const toInsert = wanted.filter(w => !byKey.has(w.key));
  if (toInsert.length > 0) {
    const now = new Date().toISOString();
    const { data: inserted, error: insErr } = await admin
      .from("user_spots")
      .insert(toInsert.map(w => ({
        device_id: own.currentDevice,
        name: w.name,
        category: "attraction",
        import_source: source,
        ...(w.note ? { note: w.note } : {}),
        ...(w.city ? { city: w.city } : {}),
        updated_at: now,
      })))
      .select("id, name");
    if (insErr) {
      console.error("[user-spots from-import] insert error:", insErr.code);
      return json({ error: "Failed to save places" }, 500);
    }
    for (const r of (inserted ?? []) as { id: string; name: string }[]) {
      byKey.set(r.name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(), r.id);
    }
  }
  for (const w of wanted) {
    const id = byKey.get(w.key);
    if (id) out.push({ name: w.name, id, reused: !toInsert.includes(w) });
  }
  return json({ items: out });
}
