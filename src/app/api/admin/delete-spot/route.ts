import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const { place_id } = body;

  if (!place_id || !/^[a-zA-Z0-9\-_]+$/.test(place_id)) {
    return NextResponse.json({ error: "Invalid place_id" }, { status: 400 });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Admin DB client not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, { status: 503 });
  }

  // spot_reactions 먼저 삭제 (FK 의존성 순서)
  const { error: reactErr } = await db
    .from("spot_reactions")
    .delete()
    .eq("place_id", place_id);

  if (reactErr) {
    return NextResponse.json(
      { error: `reactions 삭제 실패: ${reactErr.message}` },
      { status: 500 }
    );
  }

  // spots 삭제
  const { error: spotErr } = await db
    .from("spots")
    .delete()
    .eq("place_id", place_id);

  if (spotErr) {
    return NextResponse.json(
      { error: `spot 삭제 실패: ${spotErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
