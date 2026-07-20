// Cloudflare Pages Function — POST /api/admin/upsert-spots
// Admin CSV 업로드: city_spots 데이터를 spots 테이블에 일괄 upsert.
// Auth: x-admin-key 헤더를 ADMIN_KEY env var(서버 전용)로 검증.
// DB: Supabase REST API + SUPABASE_SERVICE_ROLE_KEY (RLS 우회).
// Runtime: Cloudflare Workers (edge). No Node.js APIs.

import { checkAdminAuth, getServiceRoleHeaders, json } from "../../_lib/admin-auth";

interface Env {
  ADMIN_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface SpotRow {
  place_id: string;
  title: string;
  category: string;
  description?: string;
  image_url?: string;
  difficulty?: string;
  duration_min?: number;
  required_gear?: string;
  affiliate_url?: string;
}

// 허용된 필드만 DB에 전달 (불필요한 필드 유입 차단)
const ALLOWED_FIELDS = new Set<keyof SpotRow>([
  "place_id", "title", "category", "description",
  "image_url", "difficulty", "duration_min", "required_gear", "affiliate_url",
]);

const CHUNK = 50;
const MAX_SPOTS = 2_000;

function sanitizeRow(raw: Record<string, unknown>): SpotRow | null {
  const place_id = String(raw.place_id ?? "").trim();
  const title    = String(raw.title    ?? "").trim();
  const category = String(raw.category ?? "").trim();

  if (!place_id || !title || !category) return null;
  if (!/^[a-zA-Z0-9\-_]+$/.test(place_id)) return null;

  const clean: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    const val = raw[key];
    if (val !== undefined && val !== null && val !== "") {
      clean[key] = val;
    }
  }
  return clean as SpotRow;
}

export const onRequestPost: (context: { request: Request; env: Env }) => Promise<Response> =
  async ({ request, env }) => {
    const authErr = checkAdminAuth(request, env.ADMIN_KEY);
    if (authErr) return authErr;

    const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!dbHeaders) {
      return json({ error: "Admin DB client not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, 503);
    }

    let body: { spots?: unknown[] };
    try {
      body = (await request.json()) as { spots?: unknown[] };
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!Array.isArray(body.spots) || body.spots.length === 0) {
      return json({ error: "spots 배열이 필요합니다" }, 400);
    }
    if (body.spots.length > MAX_SPOTS) {
      return json({ error: `최대 ${MAX_SPOTS}개까지 한 번에 업로드 가능합니다` }, 400);
    }

    const rows: SpotRow[] = [];
    const skipErrors: string[] = [];
    for (let i = 0; i < body.spots.length; i++) {
      const row = sanitizeRow(body.spots[i] as Record<string, unknown>);
      if (!row) {
        skipErrors.push(`row[${i}]: place_id/title/category 필수 또는 place_id 형식 오류`);
      } else {
        rows.push(row);
      }
    }

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    let success = 0;
    let failed = 0;
    const errors: string[] = skipErrors.map(s => `[skip] ${s}`);

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const chunkNum = Math.floor(i / CHUNK) + 1;

      const res = await fetch(
        `${supabaseUrl}/rest/v1/spots?on_conflict=place_id`,
        {
          method: "POST",
          headers: { ...dbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(chunk),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        failed += chunk.length;
        errors.push(`Chunk ${chunkNum}: ${errText}`);
      } else {
        success += chunk.length;
      }
    }

    return json({ success, failed, errors });
  };

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> =
  async () => json({ error: "Method not allowed." }, 405);
