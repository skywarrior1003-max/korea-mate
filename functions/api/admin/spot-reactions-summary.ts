// Cloudflare Pages Function — GET /api/admin/spot-reactions-summary
//
// 관리자 "신뢰도 이슈 스팟" 목록. 예전에는 관리자 페이지가 브라우저 anon key 로
// spot_reactions 원본 행을 통째로 읽어 집계했다. 그러면 raw device_id 가 관리자
// 브라우저까지 내려온다 — 화면에 쓰지도 않는 값이다.
//
// 집계는 서버에서 하고 관리자에게는 필요한 것만 준다.
// 판정 기준(threshold·정렬·제목 폴백)은 기존 fetchFlaggedSpots 와 동일하게 둔다.
// 관리자 화면 결과가 바뀌면 안 된다.
//
// SECURITY CONTRACT:
// - 기존 x-admin-key 검증(checkAdminAuth)을 그대로 쓴다. ADMIN_KEY 없으면 503 fail-closed
// - service_role 은 서버에서만 사용
// - 응답에 raw device_id · reaction row 원문 · 내부 DB id 를 넣지 않는다
// - DB 오류 원문을 응답에 넣지 않는다

import { json, checkAdminAuth, getServiceRoleHeaders } from "../../_lib/admin-auth";

interface Env {
  ADMIN_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface Ctx { request: Request; env: Env }

const DEFAULT_THRESHOLD = 1;
const MAX_ROWS = 5000;

export const onRequestGet: (ctx: Ctx) => Promise<Response> = async ({ request, env }) => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const headers = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!headers || !url) return json({ error: "Admin DB client not configured" }, 503);

  const raw = new URL(request.url).searchParams.get("threshold");
  const parsed = raw === null ? DEFAULT_THRESHOLD : Number.parseInt(raw, 10);
  const threshold = Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_THRESHOLD;

  // device_id 는 select 하지 않는다 — 서버도 집계에 쓰지 않는다.
  let reactions: Array<{ place_id: string; created_at: string | null }>;
  try {
    const res = await fetch(
      `${url}/rest/v1/spot_reactions?select=place_id,created_at&reaction=eq.dislike&limit=${MAX_ROWS}`,
      { headers },
    );
    if (!res.ok) {
      console.error("[spot-reactions-summary] reactions query failed with status", res.status);
      return json({ error: "Failed to load reactions" }, 502);
    }
    reactions = await res.json();
  } catch {
    console.error("[spot-reactions-summary] reactions request failed");
    return json({ error: "Failed to load reactions" }, 502);
  }

  // 기존과 같은 집계: place_id 별 dislike 수 → threshold 이상 → count 내림차순
  const counts = new Map<string, { count: number; last: string | null }>();
  for (const r of reactions ?? []) {
    if (!r?.place_id) continue;
    const cur = counts.get(r.place_id) ?? { count: 0, last: null };
    cur.count += 1;
    if (r.created_at && (!cur.last || r.created_at > cur.last)) cur.last = r.created_at;
    counts.set(r.place_id, cur);
  }
  const filtered = [...counts.entries()]
    .filter(([, v]) => v.count >= threshold)
    .sort((a, b) => b[1].count - a[1].count);

  if (filtered.length === 0) return json({ items: [] });

  // 제목은 기존과 같이 spots 에서 찾고, 없으면 place_id 를 그대로 쓴다.
  const ids = filtered.map(([id]) => id);
  const titleMap = new Map<string, string>();
  try {
    const inList = ids.map(id => `"${encodeURIComponent(id)}"`).join(",");
    const res = await fetch(
      `${url}/rest/v1/spots?select=place_id,title&place_id=in.(${inList})`,
      { headers },
    );
    if (res.ok) {
      const rows: Array<{ place_id: string; title: string }> = await res.json();
      for (const s of rows ?? []) titleMap.set(s.place_id, s.title);
    } else {
      console.error("[spot-reactions-summary] titles query failed with status", res.status);
    }
  } catch {
    console.error("[spot-reactions-summary] titles request failed");
  }

  return json({
    items: filtered.map(([place_id, v]) => ({
      place_id,
      title: titleMap.get(place_id) ?? place_id,
      count: v.count,
      last_reaction_at: v.last,
    })),
  });
};

export const onRequest: (ctx: Ctx) => Promise<Response> = async (ctx) => {
  if (ctx.request.method === "GET") return onRequestGet(ctx);
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
};
