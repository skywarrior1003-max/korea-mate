import { supabase } from "./supabase";

// ── 공개 타입 ─────────────────────────────────────────────────────────────────
// restaurants/page.tsx의 RestaurantItem과 구조 동일 — page.tsx에서 import하여 사용

export interface RestaurantItem {
  id: string;
  source: "michelin-2026" | "busan-mat-2026" | "taegshlang-2025";
  award: string | null;
  name_ko: string;
  name_en: string;
  category_ko: string;
  category_en: string;
  district_ko: string;
  district_en: string;
  address_ko: string;
  address_en: string;
  description_ko: string;
  description_en: string;
  latitude: number;
  longitude: number;
  image: string | null;
  price_range: string | null;
  tags: string[];
  phone: string | null;
  reservation_required: boolean;
  visible?: boolean;
}

// ── Supabase places 행 타입 (내부용) ─────────────────────────────────────────

type PlaceRow = {
  place_id: string;
  name: string;
  name_ko: string | null;
  name_en: string | null;
  subcategory: string | null;
  description: string | null;
  description_ko: string | null;
  description_en: string | null;
  address: string | null;
  district: string | null;
  district_ko: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  image_url: string | null;
  images: unknown[] | null;
  source_ref: string | null;
  award: string | null;
  price_range: string | null;
  is_active: boolean;
  tags: string[] | null;
  extra: Record<string, unknown> | null;
};

// ── 매핑 ─────────────────────────────────────────────────────────────────────

const VALID_SOURCES = new Set<string>(["michelin-2026", "busan-mat-2026", "taegshlang-2025"]);

function mapPlace(p: PlaceRow): RestaurantItem {
  const srcRef = p.source_ref ?? "";
  const source = VALID_SOURCES.has(srcRef)
    ? (srcRef as RestaurantItem["source"])
    : "busan-mat-2026";

  const extra = p.extra ?? {};
  const district = p.district ?? "";
  const imgs = Array.isArray(p.images) ? p.images : [];
  const imageUrl =
    p.image_url ||
    (typeof imgs[0] === "string" ? imgs[0] : null) ||
    (typeof extra.image === "string" ? extra.image : null) ||
    (typeof extra.image_url === "string" ? extra.image_url : null) ||
    null;

  return {
    id:                   p.place_id,
    source,
    award:                p.award ?? null,
    name_ko:              p.name_ko || p.name || "",
    name_en:              p.name_en || p.name || "",
    category_ko:          p.subcategory || "",
    category_en:          p.subcategory || "",
    district_ko:          p.district_ko || "",
    district_en:          district,
    address_ko:           p.address || "",
    address_en:           district ? `${district}, Busan` : "Busan",
    description_ko:       p.description_ko || p.description || "",
    description_en:       p.description_en || "",
    latitude:             p.lat ?? 0,
    longitude:            p.lng ?? 0,
    image:                imageUrl,
    price_range:          p.price_range || null,
    tags:                 Array.isArray(p.tags) ? p.tags : [],
    phone:                p.phone ?? null,
    reservation_required: typeof extra.reservation_required === "boolean"
                            ? extra.reservation_required
                            : false,
    visible:              p.is_active,
  };
}

// ── 공개 조회 함수 ────────────────────────────────────────────────────────────

/**
 * Supabase places 테이블에서 category='restaurant' 행을 조회하여
 * RestaurantItem 배열로 반환합니다.
 * 실패 또는 0건이면 빈 배열 반환 → 호출자가 JSON fallback을 처리합니다.
 */
export async function getRestaurantPlaces(): Promise<RestaurantItem[]> {
  try {
    const { data, error } = await supabase
      .from("places")
      .select(
        "place_id, name, name_ko, name_en, subcategory, " +
        "description, description_ko, description_en, " +
        "address, district, district_ko, phone, lat, lng, " +
        "image_url, images, source_ref, award, price_range, " +
        "is_active, tags, extra"
      )
      .eq("category", "restaurant")
      .eq("is_active", true)
      .eq("admin_status", "approved")
      .order("place_id", { ascending: true });

    if (error) {
      console.error("[places] Supabase error:", error.message);
      return [];
    }

    return ((data ?? []) as unknown as PlaceRow[]).map(mapPlace);
  } catch (err) {
    console.error("[places] fetch failed:", (err as Error).message);
    return [];
  }
}
