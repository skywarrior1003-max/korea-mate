// 추천 장소 제안 진입점 자격 판정 (RANKING-UX-HOTFIX §5) — UI 없는 순수 로직.
// 진입점: Picks > My Places(기본)·본인 Story user_spot(보조). City Hub 진입점 없음.

import { resolveCitySlug } from "../../data/cities/identity.ts";
import { isValidCoordinate } from "../geo.ts";

export interface SuggestableSpot {
  name?: string | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  relatedCitySpotId?: number | null;
}

/**
 * §5-1 자격: 이름 존재 · canonical city 식별(sp.city → fallbackCity) ·
 * 주소 또는 유효 좌표 · city_spots 연결(related) 아님.
 * 통과 시 canonical slug, 아니면 null. 중복 pending 은 서버(409)가 판정한다.
 */
export function suggestEligibleCity(sp: SuggestableSpot, fallbackCity?: string | null): string | null {
  if (!(sp.name ?? "").trim()) return null;
  if (sp.relatedCitySpotId !== null && sp.relatedCitySpotId !== undefined) return null;
  const city = resolveCitySlug(sp.city ?? null) ?? resolveCitySlug(fallbackCity ?? null);
  if (!city) return null;
  const hasAddress = Boolean((sp.address ?? "").trim());
  const hasCoords = isValidCoordinate(sp.lat, sp.lng);
  if (!hasAddress && !hasCoords) return null;
  return city;
}

/** §5-2 — days 에서 user_spot uuid 만 수집(canonical 숫자 id 는 대상 아님) */
export function userSpotIdsFromDays(days: unknown): string[] {
  const out = new Set<string>();
  if (!Array.isArray(days)) return [];
  for (const d of days) {
    const places = (d && typeof d === "object") ? (d as { places?: unknown }).places : null;
    if (!Array.isArray(places)) continue;
    for (const p of places) {
      const pid = (p && typeof p === "object") ? (p as { place_id?: unknown }).place_id : null;
      if (typeof pid === "string" && pid.startsWith("user_spot:")) {
        const id = pid.slice("user_spot:".length).trim();
        if (id) out.add(id);
      }
    }
  }
  return [...out];
}
