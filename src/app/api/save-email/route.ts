import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(request: NextRequest) {
  let body: { email?: string; deviceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email    = (body.email ?? "").trim().toLowerCase();
  const deviceId = (body.deviceId ?? "").trim();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (!deviceId) {
    return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );

  // ① user_emails 테이블에 email-device 매핑 저장 (중복 무시)
  const { error: emailErr } = await supabase
    .from("user_emails")
    .upsert({ email, device_id: deviceId }, { onConflict: "email,device_id", ignoreDuplicates: true });

  if (emailErr) {
    console.error("[save-email] user_emails upsert:", emailErr.message);
    // 테이블이 아직 없는 경우 graceful 처리 — 마이그레이션 안내
    if (emailErr.message?.includes("does not exist") || emailErr.code === "42P01") {
      return NextResponse.json(
        { error: "Database not initialized. Please run migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: emailErr.message }, { status: 500 });
  }

  // ② 이 device_id로 저장된 일정에 email 컬럼 업데이트 (소급 적용)
  const { error: itinErr } = await supabase
    .from("itineraries")
    .update({ email })
    .eq("device_id", deviceId)
    .is("email", null); // 이미 이메일이 있는 레코드는 덮어쓰지 않음

  if (itinErr) {
    // 이 단계 실패는 치명적이지 않음 — user_emails는 이미 저장됨
    console.warn("[save-email] itineraries email update (non-fatal):", itinErr.message);
  }

  return NextResponse.json({ ok: true });
}
