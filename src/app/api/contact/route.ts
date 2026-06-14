import { NextRequest, NextResponse } from "next/server";
import { createInquiry, sendAdminNotification } from "@/lib/contact";

const ALLOWED_TYPES = new Set([
  "General question",
  "Wrong restaurant information",
  "Wrong map location",
  "Closed or moved place",
  "Suggest a place",
  "Partnership / business inquiry",
  "Other",
]);

// Simple in-process rate limit: max 5 submissions per IP per 10 minutes.
// Note: this resets on each serverless cold start and does not persist across
// instances. For production, use a Redis/Supabase-backed rate limiter.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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

export async function POST(req: NextRequest) {
  try {
    // Payload size guard (Next.js default is 4MB; we enforce a much tighter limit here)
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 8_000) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }

    const body = await req.json() as Record<string, unknown>;

    // Honeypot — silently discard bots
    if (body._hp) {
      return NextResponse.json({ success: true });
    }

    // Rate limit by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ??
      "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many submissions. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const { type, name, email, message, relatedPageUrl, relatedPlaceId, relatedPlaceName } = body;

    // type — must be one of the allowed values
    if (!type || typeof type !== "string" || !ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "Invalid inquiry type." }, { status: 400 });
    }

    // email
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    const emailStr = String(email).trim().toLowerCase();
    if (emailStr.length > 200) {
      return NextResponse.json({ error: "Email address is too long." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    // message
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    const messageStr = String(message).trim();
    if (messageStr.length < 10) {
      return NextResponse.json({ error: "Message must be at least 10 characters." }, { status: 400 });
    }
    if (messageStr.length > 3000) {
      return NextResponse.json({ error: "Message is too long (max 3000 characters)." }, { status: 400 });
    }

    // optional fields — length-limit everything before touching DB
    const nameStr           = name            ? String(name).slice(0, 60)            : undefined;
    const relatedPageStr    = relatedPageUrl  ? String(relatedPageUrl).slice(0, 500) : undefined;
    const relatedPlaceIdStr = relatedPlaceId  ? String(relatedPlaceId).slice(0, 200) : undefined;
    const relatedPlaceStr   = relatedPlaceName? String(relatedPlaceName).slice(0, 200): undefined;

    const inquiry = await createInquiry({
      type:              String(type),
      name:              nameStr,
      email:             emailStr,
      message:           messageStr,
      relatedPageUrl:    relatedPageStr,
      relatedPlaceId:    relatedPlaceIdStr,
      relatedPlaceName:  relatedPlaceStr,
      language:          req.headers.get("accept-language")?.split(",")[0]?.slice(0, 20) ?? undefined,
      status:            "new",
      priority:          "normal",
    });

    if (!inquiry) {
      return NextResponse.json(
        { error: "Failed to save inquiry. Please try again later." },
        { status: 500 }
      );
    }

    // Email notification — best-effort, never blocks the user response
    sendAdminNotification(inquiry).catch((err) =>
      console.error("[contact API] email notification error:", err)
    );

    return NextResponse.json({ success: true, id: inquiry.id });
  } catch (err) {
    console.error("[contact API] error:", err);
    return NextResponse.json(
      { error: "Server error. Please try again later." },
      { status: 500 }
    );
  }
}
