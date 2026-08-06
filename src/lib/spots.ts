export type SpotCategory =
  | "attraction"
  | "restaurant"
  | "cafe"
  | "hiking"
  | "activity"
  | "accommodation"
  | "cultural"
  | "market"
  | "shopping";

export type HikingDifficulty = "easy" | "moderate" | "hard";

export interface SpotRow {
  id?: number;
  place_id: string;
  title: string;
  category: SpotCategory;
  description?: string;
  image_url?: string;
  difficulty?: HikingDifficulty;
  duration_min?: number;
  required_gear?: string;
  affiliate_url?: string;
  created_at?: string;
}

// 브라우저에서 spots 를 직접 읽던 helper 4종(fetchSpotByPlaceId /
// fetchSpotsByCategory / fetchAllSpots / searchSpots)은 제거했다.
// 호출처가 0건인 dead code 였고, 번들에도 들어가지 않았다(tree-shaking).
// 남겨 두면 spots 의 anon SELECT 를 닫을 수 없다.
//
// 사용자 화면의 장소 SSOT 는 city_spots 다(src/lib/city-spots.ts).
// spots 는 관리자 CSV 업로드 대상이며 접근은 전부 service_role 서버 경로다:
//   POST /api/admin/upsert-spots            (쓰기)
//   POST /api/admin/delete-spot             (삭제)
//   GET  /api/admin/spot-reactions-summary  (제목 조회)
// 그래서 이 파일에는 더 이상 브라우저 DB 접근이 없다.

// CSV 헤더 → SpotRow 필드 매핑
// NOTE: upsertSpot / bulkUpsertSpots는 TASK-SEC-01-B1에서 제거됨.
// spots 쓰기는 /api/admin/upsert-spots (service_role) 경로를 통해서만 허용.
// 브라우저에서 anon key로 직접 upsert하는 구조가 보안 취약점이었음.
// 대체: /api/admin/upsert-spots (서버 API, service_role key 사용)
const HEADER_MAP: Record<string, keyof SpotRow> = {
  place_id:       "place_id",
  id_key:         "place_id",
  unq_key:        "place_id",
  unique_key:     "place_id",
  title:          "title",
  name:           "title",
  name_en:        "title",
  english_name:   "title",
  category:       "category",
  type:           "category",
  description:    "description",
  desc:           "description",
  about:          "description",
  image_url:      "image_url",
  photo_url:      "image_url",
  image:          "image_url",
  photo:          "image_url",
  difficulty:     "difficulty",
  level:          "difficulty",
  duration_min:   "duration_min",
  duration:       "duration_min",
  duration_minutes: "duration_min",
  time_minutes:   "duration_min",
  required_gear:  "required_gear",
  gear:           "required_gear",
  equipment:      "required_gear",
  affiliate_url:  "affiliate_url",
  affiliate:      "affiliate_url",
  booking_url:    "affiliate_url",
  buy_url:        "affiliate_url",
};

// ── 유저 Dislike 기록 ─────────────────────────────────────────
//
// 브라우저에서 spot_reactions 에 직접 INSERT 하지 않는다. 서버가 device_id 형식과
// reaction 값을 검증하고 중복을 흡수한다. 서버 호출이 실패해도 anon DB 로
// 되돌아가지 않는다 — 그러면 서버로 옮긴 의미가 없다.
//
// 반환 계약은 그대로 boolean 이다. 이미 기록된 경우도 true 로 본다. 사용자
// 입장에서는 "반영됨"이 맞고, 재클릭이 오류처럼 보이면 안 된다.
export async function dislikeSpot(placeId: string, deviceId?: string): Promise<boolean> {
  if (!deviceId) return false;
  try {
    const res = await fetch("/api/spots/reactions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body:    JSON.stringify({ place_id: placeId, reaction: "dislike" }),
    });
    // 201 recorded / 200 already_recorded 둘 다 사용자에겐 성공이다
    return res.status === 201 || res.status === 200;
  } catch {
    // 네트워크 실패. 원인을 화면에 노출하지 않고 실패로만 알린다.
    return false;
  }
}

// ── 관리자: 신뢰도 이슈 스팟 조회 ────────────────────────────
//
// 집계는 서버가 한다. 예전에는 브라우저가 reaction 원본 행을 전부 받아 세었는데,
// 그러면 화면에 쓰지도 않는 raw device_id 가 관리자 브라우저까지 내려온다.
// 판정 기준(threshold·정렬·제목 폴백)은 서버에서 그대로 유지하므로 화면 결과는
// 같다. 실패 시 anon DB 로 되돌아가지 않는다.
export async function fetchFlaggedSpots(
  adminKey: string,
  threshold = 1
): Promise<{ place_id: string; title: string; count: number }[]> {
  if (!adminKey) return [];
  try {
    const res = await fetch(
      `/api/admin/spot-reactions-summary?threshold=${encodeURIComponent(String(threshold))}`,
      { headers: { "x-admin-key": adminKey } },
    );
    if (!res.ok) { console.error("[admin] flagged spots failed:", res.status); return []; }
    const body = await res.json() as { items?: { place_id: string; title: string; count: number }[] };
    return body.items ?? [];
  } catch {
    console.error("[admin] flagged spots request failed");
    return [];
  }
}

export function csvRowToSpot(row: Record<string, string>): Partial<SpotRow> {
  const spot: Partial<SpotRow> = {};

  for (const [csvKey, rawValue] of Object.entries(row)) {
    const normalized = csvKey.toLowerCase().trim().replace(/\s+/g, "_");
    const field = HEADER_MAP[normalized];
    if (!field || !rawValue.trim()) continue;

    const v = rawValue.trim();
    if (field === "duration_min") {
      spot.duration_min = parseInt(v, 10);
    } else {
      (spot as Record<string, unknown>)[field] = v;
    }
  }

  return spot;
}
