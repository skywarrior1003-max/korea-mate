// 여행 1건 완전 삭제 cascade (Storage-first) — 공용 모듈
//
// 원본은 functions/api/itinerary/[id].ts 의 DELETE 2~6단계다. ACCOUNT-DELETE-V1
// 이 계정 소유 여행 전체에 같은 계약을 적용해야 해서 이 파일로 추출했다 —
// 두 경로가 서로 다른 삭제 규칙을 갖게 두지 않는다(순서·실패 계약 동일).
//
// 계약(원본 그대로):
//  · 사진 경로 수집 실패 = 중단(불완전 목록으로 지우면 고아 파일이 남는다)
//  · Storage-first — Storage 실패 시 DB 미삭제
//  · content_likes/dislikes(target itinerary·story)·story_submissions →
//    trip_moments → itineraries 순. 각 단계 멱등(재호출 안전).
//  · 다른 사용자의 독립 복사본(copy_of)은 건드리지 않는다 — 018 FK 가
//    원본 삭제 시 copy_of 를 NULL 로 만들 뿐 복사본 행은 남는다.
//
// 소유권 검증은 호출자가 한다(단건 API 는 resolveOwnership + device scope,
// 계정 삭제는 계정 device 목록으로 대상 id 를 먼저 확정).

import { collectItineraryPhotoPaths, removeItineraryStorage } from "../../src/lib/photo-delete";

// supabase-js 클라이언트의 이 모듈이 쓰는 최소 표면 (adminClient 반환형과 구조적 호환)
type Q = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  storage: Parameters<typeof removeItineraryStorage>[0];
};

export type PurgeResult = { ok: true } | { ok: false; stage: string; status: number };

export async function purgeItineraryCascade(admin: Q, id: string): Promise<PurgeResult> {
  // 사진 경로 수집 — 첫 장 slot(trip_moments.storage_path) + 자식(trip_moment_photos)
  const collected = await collectItineraryPhotoPaths({
    legacy: async () => {
      const { data, error } = await admin
        .from("trip_moments").select("storage_path")
        .eq("itinerary_id", id).not("storage_path", "is", null);
      return { ok: !error, rows: (data ?? []) as { storage_path: string | null }[] };
    },
    child: async () => {
      const { data, error } = await admin
        .from("trip_moment_photos").select("storage_path")
        .eq("itinerary_id", id);
      return { ok: !error, rows: (data ?? []) as { storage_path: string | null }[] };
    },
  }, id);
  if (!collected.ok) {
    console.error("[itinerary purge] photo path collect failed:", collected.stage);
    return { ok: false, stage: "photo_collect", status: 500 };
  }

  // Storage-first
  if (collected.paths.length > 0) {
    const storageErr = await removeItineraryStorage(admin.storage, collected.paths);
    if (storageErr) {
      console.error("[itinerary purge] storage remove failed:", storageErr, { count: collected.paths.length });
      return { ok: false, stage: "storage", status: 500 };
    }
  }

  // 귀속 레코드 — UGC-DELETE-PROPAGATION-V1 계약 그대로
  const targetKey = id.toLowerCase();
  // 도움됨 투표·조회 중복 방지·AI 생성 기록도 이 여행 id 에만 매인 귀속 레코드다
  // (FK 없음 — 행을 지워도 남는다). AI 생성 기록은 여행 내용으로 만든 문구
  // 원문(result)을 담고 있어 여행과 함께 사라져야 한다(DELETION-COVERAGE-V1).
  // helpful_count 집계 자체는 익명 수치라 되돌리지 않는다(place_usage 와 같은 계약).
  for (const [table, col, val] of [
    ["content_likes",           "target_key",   targetKey],
    ["content_dislikes",        "target_key",   targetKey],
    ["story_submissions",       "itinerary_id", id],
    ["itinerary_helpful_votes", "itinerary_id", id],
    ["itinerary_view_dedup",    "itinerary_id", id],
    ["mytrip_ai_generations",   "itinerary_id", id],
  ] as const) {
    let q = admin.from(table).delete();
    q = col === "target_key"
      ? q.in("target_type", ["itinerary", "story"]).eq("target_key", val)
      : q.eq(col, val);
    const { error } = await q;
    if (error) {
      console.error("[itinerary purge] orphan cleanup failed", { step: table, code: error.code });
      return { ok: false, stage: table, status: 500 };
    }
  }

  // trip_moments 명시 삭제(자식 사진 행은 FK CASCADE)
  const { error: momErr } = await admin.from("trip_moments").delete().eq("itinerary_id", id);
  if (momErr) {
    console.error("[itinerary purge] CRITICAL: storage deleted but moments db delete failed", { itineraryId: id, code: momErr.code });
    return { ok: false, stage: "trip_moments", status: 500 };
  }

  // 행 삭제 — 이미 없어도(재실행) 성공으로 취급한다(멱등)
  const { error: itErr } = await admin.from("itineraries").delete().eq("id", id);
  if (itErr) {
    console.error("[itinerary purge] CRITICAL: moments deleted but itinerary db delete failed", { itineraryId: id, code: itErr.code });
    return { ok: false, stage: "itineraries", status: 500 };
  }
  return { ok: true };
}
