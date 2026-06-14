import { createClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────
export type ContactStatus =
  | "new" | "reviewing" | "waiting_user" | "resolved" | "archived" | "spam";
export type ContactPriority = "normal" | "high";

export type ContactInquiry = {
  id: string;
  type: string;
  name?: string;
  email: string;
  message: string;
  relatedPageUrl?: string;
  relatedPlaceId?: string;
  relatedPlaceName?: string;
  language?: string;
  status: ContactStatus;
  priority: ContactPriority;
  aiCategory?: string;
  aiSummary?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
};

// ── Supabase client (server-side: uses service role if available) ─────────
function getAdminClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "";
  // Service role key bypasses RLS — use only in server-side API routes
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
            || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            || "";
  return createClient(url, key);
}

// Anon client — for INSERT (contact form, no auth needed)
function getAnonClient() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "";
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

const TABLE = "contact_inquiries";

// ── CRUD ──────────────────────────────────────────────────────────────────
export async function createInquiry(
  data: Omit<ContactInquiry, "id" | "createdAt" | "updatedAt">
): Promise<ContactInquiry | null> {
  const now = new Date().toISOString();
  const id  = crypto.randomUUID();
  const row = {
    id,
    type: data.type,
    name: data.name ?? null,
    email: data.email,
    message: data.message,
    related_page_url:   data.relatedPageUrl   ?? null,
    related_place_id:   data.relatedPlaceId   ?? null,
    related_place_name: data.relatedPlaceName ?? null,
    language: data.language ?? null,
    status:   data.status,
    priority: data.priority,
    ai_category: null,
    ai_summary:  null,
    admin_note:  null,
    created_at: now,
    updated_at: now,
  };
  const { error } = await getAnonClient().from(TABLE).insert(row);
  if (error) {
    console.error("[contact] insert error:", error.message);
    return null;
  }
  return mapRow(row as Record<string, unknown>);
}

export async function listInquiries(): Promise<ContactInquiry[]> {
  const { data, error } = await getAdminClient()
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[contact] list error:", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function getInquiry(id: string): Promise<ContactInquiry | null> {
  const { data, error } = await getAdminClient()
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function updateInquiry(
  id: string,
  updates: Partial<Pick<ContactInquiry, "status" | "priority" | "adminNote">>
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status    !== undefined) patch.status     = updates.status;
  if (updates.priority  !== undefined) patch.priority   = updates.priority;
  if (updates.adminNote !== undefined) patch.admin_note = updates.adminNote;
  const { error } = await getAdminClient().from(TABLE).update(patch).eq("id", id);
  if (error) {
    console.error("[contact] update error:", error.message);
    return false;
  }
  return true;
}

function mapRow(r: Record<string, unknown>): ContactInquiry {
  return {
    id:               r.id as string,
    type:             r.type as string,
    name:             (r.name as string) || undefined,
    email:            r.email as string,
    message:          r.message as string,
    relatedPageUrl:   (r.related_page_url   as string) || undefined,
    relatedPlaceId:   (r.related_place_id   as string) || undefined,
    relatedPlaceName: (r.related_place_name as string) || undefined,
    language:         (r.language           as string) || undefined,
    status:           (r.status as ContactStatus)   || "new",
    priority:         (r.priority as ContactPriority) || "normal",
    aiCategory:       (r.ai_category as string) || undefined,
    aiSummary:        (r.ai_summary  as string) || undefined,
    adminNote:        (r.admin_note  as string) || undefined,
    createdAt:        r.created_at as string,
    updatedAt:        r.updated_at as string,
  };
}

// ── Email Adapter (Resend REST API — no npm package required) ─────────────
// Required env vars:
//   RESEND_API_KEY              — from resend.com
//   ADMIN_NOTIFICATION_EMAIL    — where admin alerts go
//   CONTACT_FROM_EMAIL          — verified sender in Resend (e.g. noreply@gokoreamate.com)
export async function sendAdminNotification(inquiry: ContactInquiry): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ADMIN_NOTIFICATION_EMAIL;
  const from   = process.env.CONTACT_FROM_EMAIL || "GoKoreaMate <noreply@gokoreamate.com>";

  if (!apiKey || !to) {
    console.warn(
      "[email] RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL not set — skipping email notification"
    );
    return;
  }

  const subject = `[GoKoreaMate Inquiry] ${inquiry.type}`;
  const text = [
    "A new inquiry has been submitted.",
    "",
    `Type:          ${inquiry.type}`,
    `Name:          ${inquiry.name || "(anonymous)"}`,
    `Email:         ${inquiry.email}`,
    `Related place: ${inquiry.relatedPlaceName || "(none)"}`,
    `Related page:  ${inquiry.relatedPageUrl   || "(none)"}`,
    "",
    "Message:",
    inquiry.message,
    "",
    "Admin dashboard:",
    `${process.env.NEXT_PUBLIC_SITE_URL || "https://gokoreamate.com"}/korea-mate-admin/inquiries/detail?id=${inquiry.id}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Resend API error:", body);
    }
  } catch (err) {
    console.error("[email] fetch error:", err);
  }
}

// ── Supabase table SQL (run once in Supabase Dashboard > SQL Editor) ──────
// export const CONTACT_TABLE_SQL = `
// CREATE TABLE IF NOT EXISTS contact_inquiries (
//   id                 TEXT        PRIMARY KEY,
//   type               TEXT        NOT NULL,
//   name               TEXT,
//   email              TEXT        NOT NULL,
//   message            TEXT        NOT NULL,
//   related_page_url   TEXT,
//   related_place_id   TEXT,
//   related_place_name TEXT,
//   language           TEXT,
//   status             TEXT        NOT NULL DEFAULT 'new',
//   priority           TEXT        NOT NULL DEFAULT 'normal',
//   ai_category        TEXT,
//   ai_summary         TEXT,
//   admin_note         TEXT,
//   created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
//   updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
// );
// ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;
// -- Allow anyone to INSERT (contact form)
// CREATE POLICY "contact_insert_anon" ON contact_inquiries
//   FOR INSERT TO anon WITH CHECK (true);
// -- SELECT/UPDATE require service role key (used by admin API routes)
// `;
