import { NextRequest, NextResponse } from "next/server";

// TODO(long-term): x-admin-key는 긴급 임시 조치입니다.
// 장기적으로 Cloudflare Access 또는 Supabase Auth JWT 기반 인증으로 전환해야 합니다.
// 현재 방식은 API key 유출 시 즉시 교체가 필요합니다.

export function checkAdminAuth(req: NextRequest): NextResponse | null {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    console.error("[admin-auth] ADMIN_KEY env var not set — all admin endpoints disabled (fail-closed)");
    return NextResponse.json(
      { error: "Admin endpoint not configured on server" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-admin-key");
  if (!provided || provided !== adminKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null; // auth OK
}
