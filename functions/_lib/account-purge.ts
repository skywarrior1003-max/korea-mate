// 계정 1개의 전체 삭제 cascade — 본인 삭제(POST /api/account/delete)와 운영자 삭제
// (POST /api/admin/account-delete)가 같이 쓴다. 호출자가 인증·확인을 끝낸 뒤에만 부른다.
// 순서·멱등·성공 위장 금지 계약은 원래 delete.ts 에 있던 그대로다(ACCOUNT-LIFECYCLE·DELETION-COVERAGE-V1):
// 여행 cascade → 나의 장소(사진) → 저장·좋아요(해시 재계산) → 기기 원문 흔적 → 제보 → drafts → 기기 연결 → auth 사용자 마지막.
// 실패는 stage 와 함께 돌려주며, 같은 호출을 다시 하면 남은 단계부터 이어진다.

import { purgeItineraryCascade } from "./itinerary-purge";
import { createClient } from "@supabase/supabase-js";
import { actorKey } from "../../src/lib/social/social-actions-core";
import { removeUserSpotPhoto } from "../../src/lib/user-spots/photo-core";
import { ownerHashHmac } from "../../src/lib/mytrip-writing/generation-cache";

export interface AccountPurgeEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MYTRIP_HASH_SECRET?: string;
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const SUGGESTION_CITIES = ["busan", "seoul", "jeju", "gyeongju", "jeonju"] as const;
const PAGE = 2000; // 해시 매칭 스캔 상한(현 규모 대비 여유) — 초과분은 다음 재시도에서

async function rest(env: AccountPurgeEnv, method: string, pathQ: string, body?: unknown, prefer?: string) {
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


export async function purgeAccount(env: AccountPurgeEnv, userId: string): Promise<Response> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.MYTRIP_HASH_SECRET)
    return json({ error: "server_error" }, 500);
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
      ["place_likes",      "liker_key",    "like"],
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

  // ③-b 기기 ID 원문·기기 파생 키 — 헤더 값이 대소문자 그대로 저장되므로 두 형태 모두 매칭
  if (devices.length > 0) {
    const raw = [...new Set(devices.flatMap(d => [d.toLowerCase(), d.toUpperCase()]))];
    const inRaw = raw.map(d => `"${d}"`).join(",");
    const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
      .map(b => b.toString(16).padStart(2, "0")).join("");
    const viewerHashes = await Promise.all(devices.map(d => sha(d.toLowerCase())));
    const ownerHashes = await Promise.all(raw.map(d => ownerHashHmac(d, env.MYTRIP_HASH_SECRET!)));
    const steps: Array<[table: string, filter: string]> = [
      ["itinerary_helpful_votes", `device_id=in.(${inRaw})`],
      ["spot_reactions",          `device_id=in.(${inRaw})`],
      ["itinerary_view_dedup",    `viewer_hash=in.(${viewerHashes.map(h => `"${h}"`).join(",")})`],
      ["mytrip_ai_generations",   `owner_hash=in.(${ownerHashes.map(h => `"${h}"`).join(",")})`],
    ];
    for (const [table, filter] of steps) {
      const del = await rest(env, "DELETE", `${table}?${filter}`, undefined, "return=representation");
      if (!del.ok) return json({ error: "delete_failed", stage: table }, 503);
      deleted[table] = Array.isArray(del.data) ? del.data.length : 0;
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
