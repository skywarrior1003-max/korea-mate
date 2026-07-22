// Cloudflare Pages Function: POST /api/save-email
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/save-email/route.ts — security policy identical.
//
// ① user_emails 테이블에 email-device 매핑 저장 (중복 무시)
// ② 해당 device_id의 기존 일정에 email 소급 적용

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_SMALL_BODY_BYTES,
  readBodyWithLimit,
} from "../../src/lib/itinerary-validate";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as { email?: string; deviceId?: string };

  const email    = (body.email    ?? "").trim().toLowerCase();
  const deviceId = (body.deviceId ?? "").trim();

  if (!isValidEmail(email))      return json({ error: "Invalid email address" }, 400);
  if (!UUID_RE.test(deviceId))   return json({ error: "Invalid device ID" },    400);

  let supabase;
  try { supabase = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { error: emailErr } = await supabase
    .from("user_emails")
    .upsert({ email, device_id: deviceId }, { onConflict: "email,device_id", ignoreDuplicates: true });

  if (emailErr) {
    console.error("[functions/api/save-email] user_emails upsert:", emailErr.code);
    if (emailErr.code === "42P01") {
      return json({ error: "Database not initialized. Please run migration first." }, 503);
    }
    return json({ error: "Failed to save email" }, 500);
  }

  const { error: itinErr } = await supabase
    .from("itineraries")
    .update({ email })
    .eq("device_id", deviceId)
    .is("email", null);

  if (itinErr) {
    console.warn("[functions/api/save-email] itineraries email update (non-fatal):", itinErr.code);
  }

  return json({ ok: true });
}
