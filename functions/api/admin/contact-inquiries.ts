// Cloudflare Pages Function — GET/PATCH /api/admin/contact-inquiries
// Admin-only: list/single inquiry (GET), update status/priority/note (PATCH).
// Auth: x-admin-key header validated against ADMIN_KEY env var (server-side only).
// Runtime: Cloudflare Workers (edge). No Node.js APIs.

interface Env {
  ADMIN_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string; // fallback if service role key absent
}

type Ctx = {
  request: Request;
  env: Env;
};

const ALLOWED_STATUSES = new Set([
  "new", "reviewing", "waiting_user", "resolved", "archived", "spam",
]);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function checkAuth(request: Request, env: Env): { ok: boolean; status: 401 | 503 } {
  const adminKey = env.ADMIN_KEY;
  if (!adminKey) {
    console.error("[admin fn] ADMIN_KEY env var is not set. Admin endpoints are disabled.");
    return { ok: false, status: 503 };
  }
  const key = request.headers.get("x-admin-key");
  return key === adminKey ? { ok: true, status: 401 } : { ok: false, status: 401 };
}

function dbHeaders(env: Env): Record<string, string> {
  // Service role key bypasses RLS — use only on server-side (never expose to client)
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    apikey:         key,
    Authorization:  `Bearer ${key}`,
  };
}

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
  const auth = checkAuth(request, env);
  if (!auth.ok) {
    return json(
      { error: auth.status === 503 ? "Admin API disabled — ADMIN_KEY not configured." : "Unauthorized." },
      auth.status
    );
  }

  const url = new URL(request.url);
  const id  = url.searchParams.get("id");
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const headers     = dbHeaders(env);

  if (id) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/contact_inquiries?id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers }
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
    { headers }
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
  const auth = checkAuth(request, env);
  if (!auth.ok) {
    return json(
      { error: auth.status === 503 ? "Admin API disabled — ADMIN_KEY not configured." : "Unauthorized." },
      auth.status
    );
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
  const headers     = dbHeaders(env);

  const res = await fetch(
    `${supabaseUrl}/rest/v1/contact_inquiries?id=eq.${encodeURIComponent(id)}`,
    {
      method:  "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body:    JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    console.error("[admin fn] Supabase update error:", await res.text());
    return json({ error: "Update failed." }, 500);
  }

  return json({ success: true });
};

// ── Other methods → 405 ───────────────────────────────────────────────────────

export const onRequest: (context: Ctx) => Promise<Response> =
  async () => json({ error: "Method not allowed." }, 405);
