// POST /api/account/delete — 계정 영구 삭제 실행 (ACCOUNT-DELETE-V1 §2)
//
// 인증: 유효 세션(requireUser — GoTrue 서버 검증) + delete-intent 토큰(같은 계정·
// TTL 10분·HMAC). ownership(linked mapping) 을 조건으로 삼지 않는 이유:
// 중간 실패 후 재시도 시 mapping 이 이미 지워져 있어도 나머지 단계를 끝낼 수
// 있어야 한다(성공 위장 금지 — auth 사용자까지 지워져야 200).
//
// 삭제 순서(각 단계 멱등 — 같은 요청을 다시 보내도 남은 것만 지운다):
//   ① 여행: 계정의 linked 기기들이 소유한 itineraries 전부 —
//      단건 삭제와 동일한 cascade(purgeItineraryCascade: Storage-first →
//      반응/스토리 제출 → moments → 행). 타인이 만든 복사본은 018 FK 가
//      copy_of=NULL 로만 만들고 행은 남긴다(유지 계약).
//   ② 내 장소(user_spots): 사진 Storage 제거 후 행 삭제.
//   ③ 저장(place_saves)·반응(content_likes/dislikes): 키가 "기기×대상" 해시라
//      역산이 안 된다 — 행을 페이지로 읽어 각 대상에 대해 계정 기기들의 키를
//      재계산해 매칭 삭제한다(서버 내부·원문 미노출).
//   ④ 장소 제보(place_suggestions): suggester_key 는 "기기×도시" 축 —
//      계정 기기×5도시 키로 삭제. 이미 발행된 제보(publications FK)는 커뮤니티
//      자산과의 연결이 있어 개인 텍스트만 삭제 대상이며, FK 로 막히면 해당
//      행만 남기고 계속한다(보고에 잔존 수 포함).
//   ⑤ This Trip 서버 draft(trip_drafts): user 축 + 계정 기기들의 device 축.
//   ⑥ 기기 연결(account_devices): RESTRICT 의 이유가 이 순서다 — 콘텐츠를
//      먼저 지운 뒤 mapping, 마지막에 auth 사용자.
//   ⑦ auth 사용자 삭제(user_consents 는 FK CASCADE). 이 단계까지 끝나야 200.
//
// 유지(삭제하지 않음 — 계약):
//   · place_usage / share_events — 대상·연도 축 익명 집계(개인 식별 불가).
//   · 타인 계정의 모든 데이터, 타인이 만든 독립 복사본.

import { requireUser } from "../../_lib/user-auth";
import { verifyDeleteIntent, verifiedSessionClaims } from "./delete-intent";
import { purgeItineraryCascade } from "../../_lib/itinerary-purge";
import { createClient } from "@supabase/supabase-js";
import { actorKey } from "../../../src/lib/social/social-actions-core";
import { removeUserSpotPhoto } from "../../../src/lib/user-spots/photo-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MYTRIP_HASH_SECRET?: string;
}
type Ctx = { request: Request; env: Env };

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const SUGGESTION_CITIES = ["busan", "seoul", "jeju", "gyeongju", "jeonju"] as const;
const PAGE = 2000; // 해시 매칭 스캔 상한(현 규모 대비 여유) — 초과분은 다음 재시도에서

async function rest(env: Env, method: string, pathQ: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const env = ctx.env;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.MYTRIP_HASH_SECRET)
    return json({ error: "server_error" }, 500);

  const auth = await requireUser(env as never, ctx.request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let body: { intent?: unknown };
  try { body = JSON.parse(await ctx.request.text()); } catch { return json({ error: "invalid_intent" }, 400); }
  // 재인증한 **그 세션**만 실행할 수 있다 — intent 의 session_id 와 현재 토큰의
  // session_id 가 일치해야 한다(REAUTH-V1 세션 결속).
  const sess = verifiedSessionClaims(ctx.request);
  if (!sess) return json({ error: "invalid_intent" }, 403);
  const okIntent = await verifyDeleteIntent(env.MYTRIP_HASH_SECRET, String(body.intent ?? ""), userId, sess.sid);
  if (!okIntent) return json({ error: "invalid_intent" }, 403);

  // 계정 기기 목록 — 재시도 시 비어 있을 수 있다(그래도 잔여 단계는 진행)
  const dv = await rest(env, "GET", `account_devices?select=device_id&user_id=eq.${userId}&limit=200`);
  if (!dv.ok) return json({ error: "delete_failed", stage: "devices_read" }, 503);
  const devices = (dv.data as { device_id: string }[]).map(r => String(r.device_id).toLowerCase());

  const deleted: Record<string, number> = {};
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });

  // ① 여행 전부 — 단건과 동일 cascade
  if (devices.length > 0) {
    const trips = await rest(env, "GET",
      `itineraries?select=id&device_id=in.(${devices.map(d => `"${d}"`).join(",")})&limit=500`);
    if (!trips.ok) return json({ error: "delete_failed", stage: "itineraries_read" }, 503);
    const ids = (trips.data as { id: string }[]).map(r => r.id);
    for (const id of ids) {
      const purged = await purgeItineraryCascade(admin, id);
      if (!purged.ok) return json({ error: "delete_failed", stage: `itinerary_${purged.stage}` }, purged.status);
    }
    deleted.itineraries = ids.length;
  }

  // ② 내 장소 — 사진 Storage 먼저
  if (devices.length > 0) {
    const spots = await rest(env, "GET",
      `user_spots?select=id,photo_storage_path&device_id=in.(${devices.map(d => `"${d}"`).join(",")})&limit=500`);
    if (!spots.ok) return json({ error: "delete_failed", stage: "user_spots_read" }, 503);
    const rows = spots.data as { id: string; photo_storage_path: string | null }[];
    for (const s of rows) {
      if (s.photo_storage_path) {
        const err = await removeUserSpotPhoto(admin.storage, s.photo_storage_path);
        if (err) return json({ error: "delete_failed", stage: "user_spot_photo" }, 500);
      }
    }
    if (rows.length > 0) {
      const del = await rest(env, "DELETE",
        `user_spots?device_id=in.(${devices.map(d => `"${d}"`).join(",")})`, undefined, "return=minimal");
      if (!del.ok) return json({ error: "delete_failed", stage: "user_spots" }, 503);
    }
    deleted.user_spots = rows.length;
  }

  // ③ 저장·반응 — 대상별 해시 재계산 매칭(§3). 행 원문은 응답·로그에 없다.
  if (devices.length > 0) {
    const jobs: Array<[table: string, keyCol: string, prefix: "save" | "like" | "dislike"]> = [
      ["place_saves",      "saver_key",    "save"],
      ["content_likes",    "liker_key",    "like"],
      ["content_dislikes", "disliker_key", "dislike"],
    ];
    for (const [table, keyCol, prefix] of jobs) {
      const page = await rest(env, "GET", `${table}?select=${keyCol},target_type,target_key&limit=${PAGE}`);
      if (!page.ok) return json({ error: "delete_failed", stage: `${table}_read` }, 503);
      const rows = page.data as Record<string, string>[];
      const mine: string[] = [];
      // 대상(type,key) 조합별로 기기 키를 한 번만 계산한다
      const cache = new Map<string, Set<string>>();
      for (const row of rows) {
        const ck = `${row.target_type}|${row.target_key}`;
        let keys = cache.get(ck);
        if (!keys) {
          keys = new Set(await Promise.all(devices.map(d => actorKey(prefix, d, row.target_type, row.target_key))));
          cache.set(ck, keys);
        }
        if (keys.has(row[keyCol])) mine.push(row[keyCol]);
      }
      if (mine.length > 0) {
        const del = await rest(env, "DELETE",
          `${table}?${keyCol}=in.(${[...new Set(mine)].map(k => `"${k}"`).join(",")})`, undefined, "return=minimal");
        if (!del.ok) return json({ error: "delete_failed", stage: table }, 503);
      }
      deleted[table] = mine.length;
    }
  }

  // ④ 장소 제보 — 기기×도시 키. 발행 연결(FK)로 막히는 행은 남기고 계속.
  if (devices.length > 0) {
    const keys: string[] = [];
    for (const d of devices) for (const c of SUGGESTION_CITIES) keys.push(await actorKey("share", d, "place_suggestion", c));
    const del = await rest(env, "DELETE",
      `place_suggestions?suggester_key=in.(${keys.map(k => `"${k}"`).join(",")})`, undefined, "return=representation");
    if (del.ok) {
      deleted.place_suggestions = Array.isArray(del.data) ? del.data.length : 0;
    } else if (del.status === 409) {
      // published 행의 FK — pending/rejected 만 지우고 발행 연결 행은 잔존 보고
      const del2 = await rest(env, "DELETE",
        `place_suggestions?suggester_key=in.(${keys.map(k => `"${k}"`).join(",")})&status=neq.published`,
        undefined, "return=representation");
      if (!del2.ok) return json({ error: "delete_failed", stage: "place_suggestions" }, 503);
      deleted.place_suggestions = Array.isArray(del2.data) ? del2.data.length : 0;
      deleted.place_suggestions_published_kept = 1;
    } else {
      return json({ error: "delete_failed", stage: "place_suggestions" }, 503);
    }
  }

  // ⑤ This Trip 서버 draft — user 축 + 기기 축
  {
    const delU = await rest(env, "DELETE",
      `trip_drafts?owner_type=eq.user&owner_id=eq.${userId}`, undefined, "return=minimal");
    if (!delU.ok) return json({ error: "delete_failed", stage: "trip_drafts_user" }, 503);
    if (devices.length > 0) {
      const delD = await rest(env, "DELETE",
        `trip_drafts?owner_type=eq.device&owner_id=in.(${devices.map(d => `"${d}"`).join(",")})`,
        undefined, "return=minimal");
      if (!delD.ok) return json({ error: "delete_failed", stage: "trip_drafts_device" }, 503);
    }
  }

  // ⑥ 기기 연결 해제(RESTRICT 해소) → ⑦ auth 사용자(consents 는 CASCADE)
  {
    const delM = await rest(env, "DELETE", `account_devices?user_id=eq.${userId}`, undefined, "return=minimal");
    if (!delM.ok) return json({ error: "delete_failed", stage: "account_devices" }, 503);
    deleted.account_devices = devices.length;
  }
  {
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    // 404 = 이미 삭제(재시도) — 성공으로 취급
    if (!r.ok && r.status !== 404) return json({ error: "delete_failed", stage: "auth_user" }, 503);
  }

  return json({ ok: true, deleted });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}
