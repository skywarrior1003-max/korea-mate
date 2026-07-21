import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { UUID_RE, MAX_SMALL_BODY_BYTES, readBodyWithLimit } from "@/lib/itinerary-validate";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(request: NextRequest) {
  const cl = request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  const read = await readBodyWithLimit(request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body as { email?: string; deviceId?: string };

  const email    = (body.email ?? "").trim().toLowerCase();
  const deviceId = (body.deviceId ?? "").trim();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (!deviceId || !UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "Invalid device ID" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  // ① user_emails 테이블에 email-device 매핑 저장 (중복 무시)
  const { error: emailErr } = await supabase
    .from("user_emails")
    .upsert({ email, device_id: deviceId }, { onConflict: "email,device_id", ignoreDuplicates: true });

  if (emailErr) {
    console.error("[save-email] user_emails upsert:", emailErr.code);
    if (emailErr.code === "42P01") {
      return NextResponse.json(
        { error: "Database not initialized. Please run migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }

  // ② 이 device_id로 저장된 일정에 email 컬럼 업데이트 (소급 적용, service_role 사용)
  const { error: itinErr } = await supabase
    .from("itineraries")
    .update({ email })
    .eq("device_id", deviceId)
    .is("email", null);

  if (itinErr) {
    // 치명적이지 않음 — user_emails는 이미 저장됨
    console.warn("[save-email] itineraries email update (non-fatal):", itinErr.code);
  }

  return NextResponse.json({ ok: true });
}
