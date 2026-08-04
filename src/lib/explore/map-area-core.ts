// Explore Map 2차 — 지도 영역·반경·위치 권한 계산.
//
// 지도 SDK 없이 결정되는 계산만 여기 모은다. 지도 관련 결함(913430d)이
// 단위 테스트를 전부 통과하고도 운영에 나간 이유는 판단이 SDK 콜백 안에
// 섞여 있었기 때문이다. 같은 실수를 반복하지 않는다.
//
// 이 파일은 계산과 상태 계약만 제공한다. `이 지역 검색` 버튼·반경 선택 UI·
// 현재 영역 목록 패널은 승인 디자인이 아직 없어 만들지 않는다.

import { haversineKm, isValidCoordinate } from "../geo.ts";

export interface AreaSpot {
  id: number;
  lat: number;
  lng: number;
  sourceKey?: string;
  name?: string;
  city?: string;
  category?: string;
  description?: string;
  district?: string | null;
  tags?: string[];
}

/** 지도 화면 경계. Naver `map.getBounds()` 를 이 형태로 옮겨 담는다. */
export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function spotAreaKey(s: AreaSpot): string {
  return s.sourceKey ?? String(s.id);
}

// ── bounds ───────────────────────────────────────────────────────────────────

export function isValidBounds(b: unknown): b is MapBounds {
  if (!b || typeof b !== "object") return false;
  const x = b as MapBounds;
  for (const v of [x.south, x.west, x.north, x.east])
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  if (x.south > x.north) return false;
  if (x.south < -90 || x.north > 90) return false;
  if (x.west < -180 || x.east > 180) return false;
  return true;
}

/**
 * 경계 안인가.
 *
 * 경계선 위의 장소는 **포함**한다. 지도에 보이는 장소를 "이 지역"에서
 * 빼면 사용자가 눈으로 본 것과 결과가 어긋난다.
 *
 * 날짜변경선을 넘는 경계(west > east)도 처리한다 — 한국에서는 생기지
 * 않지만, 조용히 빈 결과를 돌려주는 것보다 낫다.
 */
export function isInBounds(lat: number, lng: number, b: MapBounds): boolean {
  if (!isValidCoordinate(lat, lng)) return false;
  if (lat < b.south || lat > b.north) return false;
  return b.west <= b.east
    ? lng >= b.west && lng <= b.east
    : lng >= b.west || lng <= b.east;
}

export function spotsInBounds<T extends AreaSpot>(spots: T[], b: MapBounds | null): T[] {
  if (!b || !isValidBounds(b)) return spots;
  return spots.filter(s => isInBounds(s.lat, s.lng, b));
}

/** 현재 영역 장소 수 — 목록을 만들지 않고 개수만 필요할 때. */
export function countInBounds(spots: AreaSpot[], b: MapBounds | null): number {
  return spotsInBounds(spots, b).length;
}

/**
 * 지도를 움직인 뒤 `이 지역 검색` 을 제안할 만한가.
 *
 * 손가락이 스치는 정도로 버튼이 뜨면 잡음이다. 중심이 화면 대각선의
 * 일정 비율 이상 움직였거나 결과 집합이 실제로 달라졌을 때만 제안한다.
 */
export interface AreaSearchState {
  /** 마지막으로 "이 지역 검색"을 실행한 시점의 경계. 아직 없으면 null. */
  searchedBounds: MapBounds | null;
  /** 지도가 현재 보고 있는 경계. */
  currentBounds: MapBounds | null;
}

export const AREA_MOVE_RATIO = 0.25;

export function boundsCenter(b: MapBounds): { lat: number; lng: number } {
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

export function boundsDiagonalKm(b: MapBounds): number {
  return haversineKm(b.south, b.west, b.north, b.east);
}

export function shouldOfferAreaSearch(st: AreaSearchState): boolean {
  const { searchedBounds, currentBounds } = st;
  if (!currentBounds || !isValidBounds(currentBounds)) return false;
  if (!searchedBounds || !isValidBounds(searchedBounds)) return true;
  const a = boundsCenter(searchedBounds);
  const c = boundsCenter(currentBounds);
  const moved = haversineKm(a.lat, a.lng, c.lat, c.lng);
  const diag = boundsDiagonalKm(currentBounds);
  if (diag <= 0) return false;
  if (moved / diag >= AREA_MOVE_RATIO) return true;
  // 확대·축소만 해도 보이는 범위가 크게 달라진다
  const prevDiag = boundsDiagonalKm(searchedBounds);
  if (prevDiag > 0 && (diag / prevDiag >= 1.5 || diag / prevDiag <= 1 / 1.5)) return true;
  return false;
}

/** `이 지역 검색` 실행 — 상태만 갱신한다. fetch 를 새로 하지 않는다. */
export function runAreaSearch(st: AreaSearchState): AreaSearchState {
  return { searchedBounds: st.currentBounds, currentBounds: st.currentBounds };
}

// ── 반경 (Near Me) ───────────────────────────────────────────────────────────

/** 승인 범위에 있는 반경 값(m). UI 는 아직 만들지 않는다. */
export const RADIUS_OPTIONS_M = [500, 1000, 3000, 5000] as const;
export type RadiusM = (typeof RADIUS_OPTIONS_M)[number];

export function isRadiusOption(v: unknown): v is RadiusM {
  return typeof v === "number" && (RADIUS_OPTIONS_M as readonly number[]).includes(v);
}

/**
 * 반경 안인가. **경계값은 포함**한다 (`<=`).
 *
 * "1km 이내"라고 적어 놓고 정확히 1,000m 인 장소를 빼면 사용자가 세는
 * 개수와 화면이 달라진다. 부동소수 오차를 감안해 1m 여유를 둔다.
 */
export const RADIUS_EPSILON_M = 1;

export function isWithinRadius(
  origin: { lat: number; lng: number },
  spot: { lat: number; lng: number },
  radiusM: number,
): boolean {
  if (!isValidCoordinate(spot.lat, spot.lng)) return false;
  if (!isValidCoordinate(origin.lat, origin.lng)) return false;
  const m = haversineKm(origin.lat, origin.lng, spot.lat, spot.lng) * 1000;
  return m <= radiusM + RADIUS_EPSILON_M;
}

export function spotsWithinRadius<T extends AreaSpot>(
  spots: T[],
  origin: { lat: number; lng: number } | null,
  radiusM: number | null,
): T[] {
  if (!origin || radiusM == null) return spots;
  return spots.filter(s => isWithinRadius(origin, s, radiusM));
}

/** 거리(m) — 정렬·표시용. 좌표가 없으면 null (0 으로 채우지 않는다). */
export function distanceM(
  origin: { lat: number; lng: number } | null,
  spot: { lat: number; lng: number },
): number | null {
  if (!origin || !isValidCoordinate(spot.lat, spot.lng) || !isValidCoordinate(origin.lat, origin.lng))
    return null;
  return haversineKm(origin.lat, origin.lng, spot.lat, spot.lng) * 1000;
}

// ── 위치 권한 상태 ───────────────────────────────────────────────────────────

/**
 * 사용자 위치 상태.
 *
 * `unsupported` 와 `denied` 를 구분한다 — 앞은 브라우저가 못 하는 것이고
 * 뒤는 사용자가 거절한 것이라, 화면이 할 말이 다르다.
 *
 * 어떤 상태에서도 지도 탐색 자체는 계속돼야 한다.
 */
export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unavailable" | "unsupported";

export interface GeoState {
  status: GeoStatus;
  coords: { lat: number; lng: number } | null;
  radiusM: RadiusM | null;
}

export const INITIAL_GEO_STATE: GeoState = { status: "idle", coords: null, radiusM: null };

export type GeoEvent =
  | { type: "request" }                                            // 사용자가 눌렀을 때만
  | { type: "granted"; lat: number; lng: number }
  | { type: "denied" }
  | { type: "unavailable" }
  | { type: "unsupported" }
  | { type: "setRadius"; radiusM: RadiusM }
  | { type: "clear" };

export function geoReducer(state: GeoState, ev: GeoEvent): GeoState {
  switch (ev.type) {
    case "request":
      return { ...state, status: "prompting" };
    case "granted":
      // 좌표가 유효하지 않으면 성공으로 치지 않는다 — 잘못된 원점으로
      // 계산한 "가까운 곳"은 없는 정보보다 나쁘다.
      if (!isValidCoordinate(ev.lat, ev.lng)) return { ...state, status: "unavailable", coords: null };
      return { ...state, status: "granted", coords: { lat: ev.lat, lng: ev.lng } };
    case "denied":
      return { ...state, status: "denied", coords: null, radiusM: null };
    case "unavailable":
      return { ...state, status: "unavailable", coords: null, radiusM: null };
    case "unsupported":
      return { ...state, status: "unsupported", coords: null, radiusM: null };
    case "setRadius":
      return { ...state, radiusM: ev.radiusM };
    case "clear":
      return INITIAL_GEO_STATE;
  }
}

/**
 * 위치를 못 쓰는 상태여도 지도 탐색은 계속된다.
 *
 * 상수 true 를 함수로 두는 이유: 이건 "아직 구현이 없다" 가 아니라
 * 지켜야 할 계약이다. 나중에 누가 위치 거절 시 지도를 막으려 하면
 * 이 함수의 테스트가 먼저 깨진다.
 */
export function mapStillUsable(_state: GeoState): boolean {
  return true;
}

/** 반경 필터를 실제로 적용할 수 있는 상태인가. */
export function radiusFilterActive(state: GeoState): boolean {
  return state.status === "granted" && !!state.coords && state.radiusM != null;
}

// ── 결합 필터 ────────────────────────────────────────────────────────────────

export interface ExploreQuery {
  city?: string | null;
  search?: string;
  category?: string;          // "all" 포함
  bounds?: MapBounds | null;  // `이 지역 검색` 이 실행된 경우에만
  geo?: GeoState;
}

function matchesText(s: AreaSpot, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (
    (s.name ?? "").toLowerCase().includes(t) ||
    (s.description ?? "").toLowerCase().includes(t) ||
    (s.district ?? "").toLowerCase().includes(t) ||
    (s.tags ?? []).some(x => x.toLowerCase().includes(t))
  );
}

/**
 * Map 과 List 가 같이 쓰는 단일 결과 계약.
 *
 * 두 화면이 각자 거르면 "지도에는 있는데 목록에는 없는" 장소가 생긴다.
 * 결합 순서는 도시 → 카테고리 → 검색어 → bounds → 반경 이고, 각 단계는
 * 앞 단계 결과만 좁힌다.
 */
export function selectExploreSpots<T extends AreaSpot>(spots: T[], q: ExploreQuery): T[] {
  let out = spots;
  if (q.city) {
    const c = q.city.toLowerCase();
    out = out.filter(s => (s.city ?? "").toLowerCase() === c);
  }
  if (q.category && q.category !== "all") out = out.filter(s => s.category === q.category);
  if (q.search) out = out.filter(s => matchesText(s, q.search!));
  if (q.bounds) out = spotsInBounds(out, q.bounds);
  if (q.geo && radiusFilterActive(q.geo)) out = spotsWithinRadius(out, q.geo.coords, q.geo.radiusM);
  return out;
}

/** 결과를 원점 기준 가까운 순으로. 좌표 없는 장소는 뒤로 밀되 버리지 않는다. */
export function sortByDistance<T extends AreaSpot>(
  spots: T[], origin: { lat: number; lng: number } | null,
): T[] {
  if (!origin) return spots;
  return [...spots].sort((a, b) => {
    const da = distanceM(origin, a);
    const db = distanceM(origin, b);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}
