// GoKoreaMate / gokoreamate.com — Events Adapter
// TASK-016: Explore & Events API
// RawEvent → EventResult / GeoEventResult / FixedEventItem 변환

import type {
  RawEvent,
  EventResult,
  GeoEventResult,
  EventCommerce,
  Coordinate,
} from "./types";
import type { FixedEventItem, ZoneId } from "../scheduler/types";
import { haversineDistance, timeToMinutes, minutesToTime } from "../scheduler/utils";
import { assignZoneId } from "../near-me/zone-classifier";

// ─── Commerce Adapter ─────────────────────────────────────────────────────────

function toCommerce(raw: RawEvent): EventCommerce {
  return {
    has_affiliate: raw.commerce.hasAffiliate,
    affiliate_url: raw.commerce.affiliateUrl ?? undefined,
    has_ticketing: raw.commerce.hasTicketing,
    booking_url:   raw.commerce.bookingUrl   ?? undefined,
  };
}

// ─── Base EventResult ─────────────────────────────────────────────────────────

export function toEventResult(raw: RawEvent): EventResult {
  return {
    event_id:            raw.id,
    name:                raw.name,
    short_name:          raw.shortName,
    type:                raw.type,
    stage:               raw.stage,
    journey_cluster:     raw.journeyCluster,
    is_anchor:           raw.isAnchor,
    city:                raw.city,
    district:            raw.district,
    opening_hours:       raw.openingHours ?? undefined,
    recommended_minutes: raw.recommendedDurationMinutes,
    best_time_slot:      raw.bestTimeSlot,
    has_coordinates:     raw.lat !== undefined && raw.lng !== undefined,
    tags:                raw.tags,
    is_trending:         raw.isTrending,
    safety_notice:       raw.notice,
    commerce:            toCommerce(raw),
  };
}

// ─── FixedEventItem Adapter ───────────────────────────────────────────────────
// 조건: openingHours 필수 (openingHours가 없으면 undefined 반환)
// end_time = min(open + recommendedDurationMinutes, close) — 자정 초과 원천 차단

function toFixedEventItem(
  raw:        RawEvent,
  coordinate: Coordinate,
  zoneId:     ZoneId,
): FixedEventItem | undefined {
  if (!raw.openingHours) return undefined;

  const startMins  = timeToMinutes(raw.openingHours.open);
  const closeMins  = timeToMinutes(raw.openingHours.close);
  const rawEndMins = startMins + raw.recommendedDurationMinutes;
  const endMins    = Math.min(rawEndMins, closeMins);  // 영업 종료 시각으로 자동 캡

  return {
    event_id:   raw.id,
    start_time: raw.openingHours.open,
    end_time:   minutesToTime(endMins),
    coordinate,
    zone_id:    zoneId,
  };
}

// ─── GeoEventResult ───────────────────────────────────────────────────────────
// lat/lng 보유 이벤트 전용. userCoord 없으면 distance_m = undefined, zone_id = 3(기본)

export function toGeoEventResult(
  raw:        RawEvent,
  userCoord?: Coordinate,
): GeoEventResult {
  const coordinate: Coordinate = { lat: raw.lat!, lng: raw.lng! };

  const distanceM = userCoord
    ? haversineDistance(userCoord, coordinate)
    : undefined;

  const rawZoneId = distanceM !== undefined ? assignZoneId(distanceM) : null;
  const zoneId: ZoneId = rawZoneId ?? 3;  // Zone 3 기본 (위치 미제공 시 가장 광역)

  return {
    ...toEventResult(raw),
    coordinate,
    distance_m:     distanceM,
    zone_id:        zoneId,
    as_fixed_event: toFixedEventItem(raw, coordinate, zoneId),
  };
}
