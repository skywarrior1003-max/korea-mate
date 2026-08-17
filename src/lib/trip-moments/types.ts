// gokoreamate — Trip Moments Types
// TASK-022: trip moments gps memory journal

export type MomentCategory = "food" | "scenery" | "people" | "culture" | "random";

export const MOMENT_CATEGORIES: { key: MomentCategory; emoji: string; label: string }[] = [
  { key: "food",    emoji: "🍜", label: "Food" },
  { key: "scenery", emoji: "🌿", label: "Scenery" },
  { key: "people",  emoji: "👥", label: "People" },
  { key: "culture", emoji: "🏛️", label: "Culture" },
  { key: "random",  emoji: "✨", label: "Random" },
];

export interface TripMoment {
  moment_id:    string;      // crypto.randomUUID()
  itinerary_id: string;      // 연결된 일정 ID
  device_id:    string;
  photo_data:   string | null; // canvas-compressed data URL (max 600px JPEG 75%)
  memo:         string;
  category:     MomentCategory;
  lat:          number | null;
  lng:          number | null;
  location_label: string;    // GPS → 인간 가독 힌트 ("35.1°N 129.0°E")
  captured_at:  string;      // ISO datetime
  day_number:   number | null;
  synced:       boolean;     // Supabase 메타데이터 sync 완료 여부
  /**
   * 서버 private moments 버킷에 사진이 올라가 있는지.
   * GET /api/trip-moments 가 storage_path 원문 대신 boolean 으로만 알려준다.
   * 사진 없는 텍스트 Memory 에는 의미가 없다(undefined 유지).
   */
  has_photo?:   boolean;
  /**
   * 두 번째 이후 사진들 (migration 052).
   *
   * 첫 장은 위 `photo_data` 에 그대로 둔다 — 예전에 남긴 Memory 는 이 필드가
   * 없고, 없어도 그대로 열려야 한다. 서버에서도 첫 장은
   * `trip_moments.storage_path`, 나머지는 `trip_moment_photos` 로 같은 모양이다.
   *
   * 올라간 사진은 이 목록에서 빠진다. 남아 있다는 것은 아직 못 올렸다는 뜻이다.
   */
  photo_data_extra?: string[];
}
