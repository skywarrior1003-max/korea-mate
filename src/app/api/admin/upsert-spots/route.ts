import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SpotRow } from "@/lib/spots";

// NOTE: 프로덕션(Cloudflare Pages)에서 이 엔드포인트는 CF Function이 필요합니다.
// functions/api/admin/upsert-spots.ts 를 별도로 생성해야 합니다. (TASK-SEC-01-B2)
// 현재는 개발 모드(next dev)에서만 동작합니다.

const CHUNK = 50;

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null) as { spots?: SpotRow[] } | null;
  if (!body?.spots || !Array.isArray(body.spots) || body.spots.length === 0) {
    return NextResponse.json({ error: "spots 배열이 필요합니다" }, { status: 400 });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Admin DB client not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, { status: 503 });
  }

  const rows: SpotRow[] = body.spots;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db
      .from("spots")
      .upsert(chunk, { onConflict: "place_id" });
    if (error) {
      failed += chunk.length;
      errors.push(`Chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
    } else {
      success += chunk.length;
    }
  }

  return NextResponse.json({ success, failed, errors });
}
