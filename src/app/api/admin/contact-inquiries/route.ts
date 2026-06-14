// Admin API — local Next.js dev route (mirrors functions/api/admin/contact-inquiries.ts)
// Uses Supabase REST API directly via fetch (no @supabase/supabase-js) so this file
// remains compatible with `output: "export"` static builds.
//
// force-static: Next.js static export requires all GET routes to declare this.
// In production (Cloudflare Pages), the CF Function at functions/api/admin/contact-inquiries.ts
// takes priority over any static asset, so this declaration only affects the build process.
export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_STATUSES = new Set<string>([
  "new", "reviewing", "waiting_user", "resolved", "archived", "spam",
]);

function checkAuth(req: NextRequest): { ok: boolean; status: 401 | 503 } {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    console.error("[admin API] ADMIN_KEY env var is not set. Admin endpoints are disabled.");
    return { ok: false, status: 503 };
  }
  const key = req.headers.get("x-admin-key");
  return key === adminKey ? { ok: true, status: 401 } : { ok: false, status: 401 };
}

function dbHeaders(): Record<string, string> {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
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
    status:           (r.status as string)   ?? "new",
    priority:         (r.priority as string) ?? "normal",
    aiCategory:       r.ai_category       || undefined,
    aiSummary:        r.ai_summary        || undefined,
    adminNote:        r.admin_note        || undefined,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}

// GET /api/admin/contact-inquiries           → list all (newest first)
// GET /api/admin/contact-inquiries?id=xxx   → single inquiry
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    const msg = auth.status === 503
      ? "Admin key not configured on server."
      : "Unauthorized.";
    return NextResponse.json({ error: msg }, { status: auth.status });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/contact_inquiries?id=eq.${encodeURIComponent(id)}&limit=1`,
      { headers: dbHeaders() }
    );
    if (!res.ok) {
      console.error("[admin API] Supabase select error:", await res.text());
      return NextResponse.json({ error: "Database error." }, { status: 500 });
    }
    const rows = await res.json() as Record<string, unknown>[];
    if (!rows.length) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(mapRow(rows[0]!));
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/contact_inquiries?order=created_at.desc&limit=200`,
    { headers: dbHeaders() }
  );
  if (!res.ok) {
    console.error("[admin API] Supabase list error:", await res.text());
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
  const rows = await res.json() as Record<string, unknown>[];
  return NextResponse.json(rows.map(mapRow));
}

// PATCH /api/admin/contact-inquiries  → update status / priority / adminNote
export async function PATCH(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    const msg = auth.status === 503
      ? "Admin key not configured on server."
      : "Unauthorized.";
    return NextResponse.json({ error: msg }, { status: auth.status });
  }

  const body = await req.json() as {
    id?: string;
    status?: string;
    priority?: string;
    adminNote?: string;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.priority !== undefined) {
    if (body.priority !== "normal" && body.priority !== "high") {
      return NextResponse.json({ error: "Invalid priority value." }, { status: 400 });
    }
    patch.priority = body.priority;
  }
  if (body.adminNote !== undefined) {
    patch.admin_note = String(body.adminNote).slice(0, 2000) || null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const res = await fetch(
    `${supabaseUrl}/rest/v1/contact_inquiries?id=eq.${encodeURIComponent(body.id)}`,
    {
      method: "PATCH",
      headers: { ...dbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    console.error("[admin API] Supabase update error:", await res.text());
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
