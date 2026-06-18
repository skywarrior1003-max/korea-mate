// GoKoreaMate / gokoreamate.com — Events Engine (Orchestrator)
// TASK-016: Explore & Events API
// Pipeline: loadRawEvents → filterEvents → toGeoEventResult/toEventResult → sort → EventsResponse

import type { EventsInput, EventsResponse, EventResult, GeoEventResult } from "./types";
import { loadRawEvents } from "./event-loader";
import { filterEvents } from "./event-filter";
import { toEventResult, toGeoEventResult } from "./event-adapter";

const DEFAULT_LIMIT     = 30;
const DEFAULT_RADIUS_KM = 100;

export function runEventsQuery(input: EventsInput): EventsResponse {
  // ── Step 1: Load + Filter ─────────────────────────────────────────────────
  const allRaw   = loadRawEvents();
  const filtered = filterEvents(allRaw, input);

  // ── Step 2: Partition geo vs non-geo ─────────────────────────────────────
  const geoRaw    = filtered.filter((e) => e.lat !== undefined && e.lng !== undefined);
  const nonGeoRaw = filtered.filter((e) => e.lat === undefined || e.lng === undefined);

  // ── Step 3: Build GeoEventResult[] + optional radius filter ──────────────
  const radiusM = (input.radius_km ?? DEFAULT_RADIUS_KM) * 1_000;

  let geoEvents: GeoEventResult[] = geoRaw
    .map((e) => toGeoEventResult(e, input.coordinate))
    .filter((e) => {
      if (!input.coordinate) return true;               // 위치 미제공 → 반경 필터 없음
      return (e.distance_m ?? Infinity) <= radiusM;
    });

  // ── Step 4: Sort geo events by distance (coordinate 제공 시) ─────────────
  if (input.coordinate) {
    geoEvents = geoEvents.sort(
      (a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity),
    );
  }

  // ── Step 5: Non-geo EventResult[] ────────────────────────────────────────
  const nonGeoResults: EventResult[] = nonGeoRaw.map(toEventResult);

  // ── Step 6: Merge + limit (geo 우선) ─────────────────────────────────────
  const limit        = input.limit ?? DEFAULT_LIMIT;
  const allResults   = [...geoEvents, ...nonGeoResults].slice(0, limit);

  return {
    events:      allResults,    // Explore & Events UI용 (GeoEventResult도 EventResult로 포함)
    geo_events:  geoEvents,     // F7 bonus 좌표 풀 + 스케줄러 연동용 (전체 geo 목록)
    total_count: allResults.length,
    mock:        false,
  };
}
