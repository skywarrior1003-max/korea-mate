import { supabase } from "./supabase";
import { applyVisibility, type VisibilityScope } from "@/lib/city-spots-visibility";
import { collectAllKeyset, chunk, ID_LOOKUP_CHUNK, uniqueNumericIds } from "@/lib/city-spots-paging";
import type { CitySpot, LocalizedText } from "@/data/cities/types";

// ── 카테고리 타입 가드 ────────────────────────────────────────────────────────

const VALID_CATEGORIES = ["attraction", "restaurant", "nature", "event", "accommodation"] as const;
type ValidCategory = typeof VALID_CATEGORIES[number];

function toCategory(raw: string): ValidCategory {
  if ((VALID_CATEGORIES as readonly string[]).includes(raw)) return raw as ValidCategory;
  return "attraction"; // DB CHECK constraint으로 실제 도달 불가
}

// ── Supabase row 타입 ─────────────────────────────────────────────────────────

export interface CitySpotRow {
  /** Gate B(migration 056) — 컬럼이 아직 없으면 undefined. 발견 표면에서만 의미가 있다 */
  is_published?: boolean | null;
  id: number;
  city: string;
  name: string;
  name_l10n: LocalizedText | null;
  category: string;
  subcategory: string | null;
  district: string | null;
  address: string | null;
  description: string | null;
  desc_l10n: LocalizedText | null;
  why_it_matters: string | null;
  why_l10n: LocalizedText | null;
  image_url: string | null;
  map_url: string | null;
  naver_map_url: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  best_time_slot: string | null;
  opening_hours: { open: string; close: string } | null;
  tags: string[] | null;
  solo_friendly: boolean;
  foreign_card_accepted: boolean;
  cash_only: boolean;
  source_type: "manual" | "tourapi" | "google" | "user";
  external_id: string | null;
  rating: number | null;
  official_url: string | null;
  affiliate_url: string | null;
  affiliate_provider: string | null;
  entry_fee: string | null;
  difficulty: string | null;
  created_at: string;
  updated_at: string;
}

// ── Row → CitySpot 어댑터 ─────────────────────────────────────────────────────

export function rowToCitySpot(row: CitySpotRow): CitySpot {
  return {
    id:                   row.id,
    name:                 row.name,
    category:             toCategory(row.category),
    city:                 row.city,
    district:             row.district ?? undefined,
    address:              row.address ?? "",
    description:          row.description ?? "",
    whyItMatters:         row.why_it_matters ?? undefined,
    mapUrl:               row.map_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name)}`,
    naverMapUrl:          row.naver_map_url ?? undefined,
    durationMinutes:      row.duration_minutes ?? undefined,
    bestTimeSlot:         row.best_time_slot ?? undefined,
    openingHours:         row.opening_hours ?? null,
    tags:                 row.tags ?? [],
    relatedSurvivalGuides: [],
    soloFriendly:         row.solo_friendly,
    foreignCardAccepted:  row.foreign_card_accepted,
    cashOnly:             row.cash_only,
    image:                row.image_url ?? undefined,
    lat:                  row.lat ?? undefined,
    lng:                  row.lng ?? undefined,
    nameL10n:             row.name_l10n ?? undefined,
    descriptionL10n:      row.desc_l10n ?? undefined,
    whyItMattersL10n:     row.why_l10n ?? undefined,
    officialUrl:          row.official_url ?? undefined,
    affiliateUrl:         row.affiliate_url ?? undefined,
    affiliateProvider:    row.affiliate_provider ?? undefined,
    entryFee:             row.entry_fee ?? undefined,
    difficulty:           (row.difficulty as CitySpot["difficulty"]) ?? undefined,
    subcategory:          row.subcategory ?? undefined,
  };
}

// ── Trip-Flow 공개 projection ────────────────────────────────────────────────
//
// Product Constitution v1.1 §14-1-A — Trip-Flow 경로에는 상업 문맥이 들어가지
// 않는다. 여기서 반환하는 데이터는 Explore·일정·지도가 쓰는 Trip-Flow 데이터다.
//
// 왜 select("*") 를 쓰지 않는가
//   전체 컬럼을 받으면 affiliate_url·affiliate_provider 가 브라우저 메모리와
//   네트워크 응답에 그대로 들어온다. 렌더 게이트만으로 막으면 데이터는 이미
//   클라이언트에 도착해 있다. 조회 단계에서 빼는 것이 이중 방어의 바깥층이다.
//
// 허용 목록 방식인 이유
//   DB 에 컬럼이 추가돼도 자동으로 노출되지 않는다. 새 필드가 필요하면 여기에
//   명시적으로 추가해야 하며, 그 시점에 Trip-Flow 적합성을 판단하게 된다.
//
// 제외 — affiliate_url · affiliate_provider (상업 문맥)
//        source_type · external_id · rating · created_at · updated_at (미사용 내부 필드)
const EXPLORE_SELECT = [
  "id", "city", "name", "name_l10n",
  "category", "subcategory", "district", "address",
  "description", "desc_l10n", "why_it_matters", "why_l10n",
  "image_url", "map_url", "naver_map_url", "official_url",
  "lat", "lng",
  "duration_minutes", "best_time_slot", "opening_hours",
  "tags", "solo_friendly", "foreign_card_accepted", "cash_only",
  "entry_fee", "difficulty",
].join(",");

/** EXPLORE_SELECT 로 조회했을 때 실제로 존재하는 컬럼만 가진 행 */
export type PublicCitySpotRow = Omit<
  CitySpotRow,
  "affiliate_url" | "affiliate_provider" | "source_type" | "external_id"
  | "rating" | "created_at" | "updated_at"
>;

/**
 * Trip-Flow 용 어댑터. rowToCitySpot 과 달리 affiliateUrl·affiliateProvider 를
 * **아예 설정하지 않는다.** CitySpot 에서 두 필드는 optional 이므로 undefined 로
 * 남고, 소비처(SpotCard·ExploreCity)는 값이 없으면 상업 CTA 를 만들지 않는다.
 */
export function rowToPublicCitySpot(row: PublicCitySpotRow): CitySpot {
  return {
    id:                    row.id,
    name:                  row.name,
    category:              toCategory(row.category),
    city:                  row.city,
    district:              row.district ?? undefined,
    address:               row.address ?? "",
    description:           row.description ?? "",
    whyItMatters:          row.why_it_matters ?? undefined,
    mapUrl:                row.map_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name)}`,
    naverMapUrl:           row.naver_map_url ?? undefined,
    durationMinutes:       row.duration_minutes ?? undefined,
    bestTimeSlot:          row.best_time_slot ?? undefined,
    openingHours:          row.opening_hours ?? null,
    tags:                  row.tags ?? [],
    relatedSurvivalGuides: [],
    soloFriendly:          row.solo_friendly,
    foreignCardAccepted:   row.foreign_card_accepted,
    cashOnly:              row.cash_only,
    image:                 row.image_url ?? undefined,
    lat:                   row.lat ?? undefined,
    lng:                   row.lng ?? undefined,
    nameL10n:              row.name_l10n ?? undefined,
    descriptionL10n:       row.desc_l10n ?? undefined,
    whyItMattersL10n:      row.why_l10n ?? undefined,
    officialUrl:           row.official_url ?? undefined,
    entryFee:              row.entry_fee ?? undefined,
    difficulty:            (row.difficulty as CitySpot["difficulty"]) ?? undefined,
    subcategory:           row.subcategory ?? undefined,
    // affiliateUrl · affiliateProvider 를 의도적으로 설정하지 않는다 (§14-1-A)
  };
}

// ── Fetch 함수 ────────────────────────────────────────────────────────────────
//
// 호출부는 전부 Trip-Flow 다 — ExploreCity · itinerary · ItineraryDayMap.
// 따라서 별도 함수를 만들지 않고 이 함수들이 곧 Trip-Flow 조회다.
// Editorial 표면은 city_spots 를 읽지 않는다.
//
// Gate B (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1) — scope 로 두 조회를 구분한다.
//   "discovery"(기본) : Explore 목록처럼 사용자가 새 장소를 **발견**하는 경우 → 게이트가 켜지면 is_published=true 만
//   "reference"       : itinerary / ItineraryDayMap 처럼 사용자가 **이미 가진 place_id** 를 다시 찾는 경우 →
//                       숨긴 legacy 라도 과거 일정이 깨지지 않도록 필터하지 않는다

// R1 SCALE: 도시 전량 조회는 keyset(id ASC · id>last) 으로 끝까지 읽는다 — PostgREST 1,000행 상한에 조용히 잘리지 않는다.
//   이 함수는 FULL COLLECTION 성격(도시 단위)이다. 장기적으로 Explore 는 city+bbox+category 범위 query 로 옮긴다(SCALE_BACKLOG).
export async function fetchCitySpots(city: string, scope: VisibilityScope = "discovery"): Promise<CitySpot[]> {
  try {
    const rows = await collectAllKeyset<PublicCitySpotRow>(async (afterId, pageSize) => {
      const { data, error } = await applyVisibility(
        supabase
          .from("city_spots")
          .select(EXPLORE_SELECT)
          .eq("city", city),
        scope,
      ).gt("id", afterId).order("id", { ascending: true }).limit(pageSize);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PublicCitySpotRow[];
    });
    return rows.map(rowToPublicCitySpot);
  } catch (e) {
    console.error("[city-spots] fetch error:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * R1 §7 — reference 조회: 일정이 실제로 참조하는 place_id 만 읽는다(도시 전량 스캔 금지).
 * 숨긴 legacy 도 그대로 해석되도록 visibility 필터는 없다(reference scope). ID 는 chunk 로 나눠 URL 길이를 제한한다.
 */
export async function fetchCitySpotsByIds(ids: ReadonlyArray<string | number | null | undefined>): Promise<CitySpot[]> {
  const numeric = uniqueNumericIds(ids);
  if (numeric.length === 0) return [];
  const out: CitySpot[] = [];
  for (const part of chunk(numeric, ID_LOOKUP_CHUNK)) {
    const { data, error } = await supabase.from("city_spots").select(EXPLORE_SELECT).in("id", part).order("id");
    if (error) { console.error("[city-spots] byIds fetch error:", error.message); continue; }
    out.push(...((data ?? []) as unknown as PublicCitySpotRow[]).map(rowToPublicCitySpot));
  }
  return out;
}

export async function fetchCitySpotsByCategory(
  city: string,
  category: string,
  scope: VisibilityScope = "discovery"
): Promise<CitySpot[]> {
  try {
    const rows = await collectAllKeyset<PublicCitySpotRow>(async (afterId, pageSize) => {
      const { data, error } = await applyVisibility(
        supabase
          .from("city_spots")
          .select(EXPLORE_SELECT)
          .eq("city", city)
          .eq("category", category),
        scope,
      ).gt("id", afterId).order("id", { ascending: true }).limit(pageSize);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PublicCitySpotRow[];
    });
    return rows.map(rowToPublicCitySpot);
  } catch (e) {
    console.error("[city-spots] category fetch error:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

// Security-0: 브라우저 anon 클라이언트로 city_spots 에 쓰던 upsertCitySpot /
// bulkUpsertCitySpots 를 제거했다. 호출부가 0 이었고 RLS 에 INSERT/UPDATE 정책이
// 없어 실행되지도 않았다. 이 파일은 읽기 전용이며, 대량 적재·갱신은 서버 전용
// importer(service_role)가 담당한다. anon write 경로를 다시 만들지 않는다.

// ── 장소명 정규화 매칭 ────────────────────────────────────────────────────────
// 구현은 city-spots-match.ts (순수 함수 · supabase 의존 없음) 로 옮겼다 — 기존 import 경로는 그대로 유지한다.
export { matchCitySpot } from "./city-spots-match";
