// 추가 사진 업로드 운영 정지 스위치 읽기 (2026-10-02, 추가 사진 단독 수정)
//
// ai_ops_switches 의 'moment_extra_photos' 행이 'paused' 면 정지. 행이 없거나 읽지 못하면 허용한다 —
// 정지는 비상용이고, 허용 상태에서도 공개 보호(동의 뒤 사진 비공개)는 항상 켜져 있다.
// 첫 사진 저장(/photo)·기록 열람·메모 저장에는 영향이 없다.
import { EXTRA_PHOTO_SWITCH_KEY } from "../../src/lib/trip-moments/late-photo-guard";

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }

export async function extraPhotosPaused(env: Env): Promise<boolean> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/ai_ops_switches?ops_key=eq.${EXTRA_PHOTO_SWITCH_KEY}&select=value_text`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as { value_text?: string }[];
    return Array.isArray(rows) && rows.some(r => String(r.value_text ?? "").trim().toLowerCase() === "paused");
  } catch { return false; }
}
