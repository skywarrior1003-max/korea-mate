// Cloudflare Pages Function — GET/PATCH /api/admin/contact-inquiries
// Admin-only: list/single inquiry (GET), update status/priority/note (PATCH).
// Auth: x-admin-key 헤더를 ADMIN_KEY env var(서버 전용)로 검증.
// DB: SUPABASE_SERVICE_ROLE_KEY 필수 — anon key fallback 없음 (TASK-SEC-01-B1-2).
// Runtime: Cloudflare Workers (edge). No Node.js APIs.

import { checkAdminAuth, getServiceRoleHeaders, json } from "../../_lib/admin-auth";

interface Env {
  ADMIN_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type Ctx = {
  request: Request;
  env: Env;
};

const ALLOWED_STATUSES = new Set([
  "new", "reviewing", "waiting_user", "resolved", "archived", "spam",
]);

function mapRow(r: Record<string, unknown>) {
  return {
    id:               r.id,
    type:             r.type,
    name:             r.name             || undefined,
    email:            r.email,
    message:          r.message,
    relatedPageUrl:   r.related_page_url  || undefined,
    relatedPlaceId:   r.related_place_id  || undefined,
    relatedPlaceName: r.related_place_name || undefined,
    language:         r.language          || undefined,
    status:           r.status            ?? "new",
    priority:         r.priority          ?? "normal",
    aiCategory:       r.ai_category       || undefined,
    aiSummary:        r.ai_summary        || undefined,
    adminNote:        r.admin_note        || undefined,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}

// ── GET /api/admin/contact-inquiries          → list all (newest first, limit 200)
// ── GET /api/admin/contact-inquiries?id=xxx  → single inquiry

export const onRequestGet: (context: Ctx) => Promise<Response> = async ({ request, env }) => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) {
    return json({ error: "Admin DB client not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, 503);
  }

  const url = new URL(request.url);
  const id  = url.searchParams.get("id");
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;

  if (id) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/contact_inquiries?id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: dbHeaders }
    );
    if (!res.ok) {
      console.error("[admin fn] Supabase select error:", await res.text());
      return json({ error: "Database error." }, 500);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!rows.length) return json({ error: "Not found." }, 404);
    return json(mapRow(rows[0]!));
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/contact_inquiries?order=created_at.desc&limit=200`,
    { headers: dbHeaders }
  );
  if (!res.ok) {
    console.error("[admin fn] Supabase list error:", await res.text());
    return json({ error: "Database error." }, 500);
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  return json(rows.map(mapRow));
};

// ── PATCH /api/admin/contact-inquiries
// Body: { id: string; status?: string; priority?: string; adminNote?: string }

export const onRequestPatch: (context: Ctx) => Promise<Response> = async ({ request, env }) => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) {
    return json({ error: "Admin DB client not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id is required." }, 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    const s = String(body.status);
    if (!ALLOWED_STATUSES.has(s)) return json({ error: "Invalid status value." }, 400);
    patch.status = s;
  }
  if (body.priority !== undefined) {
    const p = String(body.priority);
    if (p !== "normal" && p !== "high") return json({ error: "Invalid priority value." }, 400);
    patch.priority = p;
  }
  if (body.adminNote !== undefined) {
    patch.admin_note = String(body.adminNote).slice(0, 2000) || null;
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/contact_inquiries?id=eq.${encodeURIComponent(id)}`,
    {
      method:  "PATCH",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body:    JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    console.error("[admin fn] Supabase update error:", await res.text());
    return json({ error: "Update failed." }, 500);
  }

  return json({ success: true });
};

// ── Other methods → 405 ──────────────────────────────────────────────────────

export const onRequest: (context: Ctx) => Promise<Response> =
  async () => json({ error: "Method not allowed." }, 405);
