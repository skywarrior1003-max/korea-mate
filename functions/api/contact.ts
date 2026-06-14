// Cloudflare Pages Function — POST /api/contact
// Handles contact form submissions: validates, inserts into Supabase, sends Resend notification.
// Runtime: Cloudflare Workers (edge). No Node.js APIs.

interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  RESEND_API_KEY?: string;
  ADMIN_NOTIFICATION_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}

const ALLOWED_TYPES = new Set([
  "General question",
  "Wrong restaurant information",
  "Wrong map location",
  "Closed or moved place",
  "Suggest a place",
  "Partnership / business inquiry",
  "Other",
]);

// In-process rate limit: max 5 submissions per IP per 10 minutes.
// Resets on isolate replacement (same limitation as the Next.js route).
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── POST /api/contact ─────────────────────────────────────────────────────────

export const onRequestPost: (context: {
  request: Request;
  env: Env;
  waitUntil: (p: Promise<unknown>) => void;
}) => Promise<Response> = async ({ request, env, waitUntil }) => {
  // Payload size guard (8 KB)
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 8_000) {
    return json({ error: "Payload too large." }, 413);
  }

  // Rate limit by IP (Cloudflare passes real IP in cf-connecting-ip)
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return json({ error: "Too many submissions. Please wait a few minutes and try again." }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  // Honeypot — silently discard bots
  if (body._hp) return json({ success: true });

  // type
  const type = String(body.type ?? "").trim();
  if (!type || !ALLOWED_TYPES.has(type)) {
    return json({ error: "Invalid inquiry type." }, 400);
  }

  // email
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return json({ error: "Email is required." }, 400);
  if (email.length > 200) return json({ error: "Email address is too long." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email address." }, 400);
  }

  // message
  const message = String(body.message ?? "").trim();
  if (message.length < 10) return json({ error: "Message must be at least 10 characters." }, 400);
  if (message.length > 3000) return json({ error: "Message is too long (max 3000 characters)." }, 400);

  // optional fields — truncate before touching DB
  const name             = body.name            ? String(body.name).trim().slice(0, 60)            : null;
  const relatedPageUrl   = body.relatedPageUrl  ? String(body.relatedPageUrl).trim().slice(0, 500)  : null;
  const relatedPlaceId   = body.relatedPlaceId  ? String(body.relatedPlaceId).trim().slice(0, 200)  : null;
  const relatedPlaceName = body.relatedPlaceName? String(body.relatedPlaceName).trim().slice(0, 200): null;
  const language = String(request.headers.get("accept-language") ?? "").split(",")[0]?.slice(0, 20) ?? null;

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id, type, name, email, message,
    related_page_url:   relatedPageUrl,
    related_place_id:   relatedPlaceId,
    related_place_name: relatedPlaceName,
    language,
    status:      "new",
    priority:    "normal",
    ai_category: null,
    ai_summary:  null,
    admin_note:  null,
    created_at:  now,
    updated_at:  now,
  };

  // Insert via Supabase REST API (anon key — RLS allows INSERT for anon role)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey     = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/contact_inquiries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey:         anonKey,
      Authorization:  `Bearer ${anonKey}`,
      Prefer:         "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!insertRes.ok) {
    console.error("[contact fn] Supabase insert error:", await insertRes.text());
    return json({ error: "Failed to save your inquiry. Please try again later." }, 500);
  }

  // Admin email notification — best-effort via waitUntil (non-blocking)
  waitUntil(
    sendAdminEmail(env, {
      id, type,
      name:             name           ?? undefined,
      email, message,
      relatedPageUrl:   relatedPageUrl  ?? undefined,
      relatedPlaceName: relatedPlaceName ?? undefined,
    })
  );

  return json({ success: true });
};

// ── Other methods → 405 ───────────────────────────────────────────────────────

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> =
  async () => json({ error: "Method not allowed." }, 405);

// ── Resend email helper ───────────────────────────────────────────────────────

async function sendAdminEmail(
  env: Env,
  data: {
    id: string;
    type: string;
    name?: string;
    email: string;
    message: string;
    relatedPageUrl?: string;
    relatedPlaceName?: string;
  }
): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const to     = env.ADMIN_NOTIFICATION_EMAIL;
  const from   = env.CONTACT_FROM_EMAIL ?? "GoKoreaMate <noreply@gokoreamate.com>";

  if (!apiKey || !to) {
    console.warn("[contact fn] RESEND_API_KEY or ADMIN_NOTIFICATION_EMAIL not set — skipping notification");
    return;
  }

  const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "https://gokoreamate.com";
  const subject = `[GoKoreaMate Inquiry] ${data.type}`;
  const text = [
    "A new inquiry has been submitted.",
    "",
    `Type:          ${data.type}`,
    `Name:          ${data.name ?? "(anonymous)"}`,
    `Email:         ${data.email}`,
    `Related place: ${data.relatedPlaceName ?? "(none)"}`,
    `Related page:  ${data.relatedPageUrl   ?? "(none)"}`,
    "",
    "Message:",
    data.message,
    "",
    "Admin dashboard:",
    `${siteUrl}/korea-mate-admin/inquiries/detail?id=${data.id}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) console.error("[contact fn] Resend error:", await res.text());
  } catch (err) {
    console.error("[contact fn] Resend fetch error:", err);
  }
}
