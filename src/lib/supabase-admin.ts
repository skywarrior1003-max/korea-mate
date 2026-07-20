import { createClient } from "@supabase/supabase-js";

// 서버 전용 — 클라이언트 컴포넌트 또는 브라우저에서 import 금지.
// SUPABASE_SERVICE_ROLE_KEY는 RLS를 우회하므로 API route 내에서만 사용.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[supabase-admin] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
