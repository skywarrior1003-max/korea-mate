/**
 * 화면에 쓸 수 있는 좌표인가.
 *
 * `lat != null` 만으로는 부족하다 — 문자열·NaN·Infinity·범위 밖 값이 모두
 * 통과해 지도와 거리 계산이 조용히 깨진다. (0, 0) 은 기니만 앞바다라
 * 한국 장소에서는 "좌표 없음"을 0 으로 채운 결과이므로 제외한다.
 *
 * 도시 경계 판정은 하지 않는다. 그건 데이터 검증 트랙의 몫이고, 여기서는
 * 일반적인 좌표 유효성만 본다.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * 자동 배치(스케줄러 후보·This Trip hint)에 넣어도 되는 좌표인가 — P0 최소 Coordinate Quality Gate
 * (TASK-SCHEDULER-V2-P0-ROUTE-QUALITY-AND-RELEASE-BLOCKERS-V1).
 *
 * isValidCoordinate 에 더해 **한국 서비스 범위**(위도 33.0–38.7, 경도 124.5–132.0)를 본다. 서비스는 한국 5도시만
 * 다루므로 범위 밖 좌표는 "명백히 잘못된 값"이다(스왑된 lat/lng, 0 채움, 다른 나라 지오코딩 결과).
 * 바다 위 같은 "범위 안의 오류"는 여기서 못 잡는다 — 그것은 데이터 정정과 V2 coordinate_confidence 의 몫이다.
 * 사용자가 고른 장소(This Trip)는 이 판정에 실패해도 조용히 버리지 않는다 — 호출부가 안내(skippedCartNames)로 밝힌다.
 */
export const KOREA_BOUNDS = { latMin: 33.0, latMax: 38.7, lngMin: 124.5, lngMax: 132.0 } as const;
export function isSchedulableCoordinate(lat: unknown, lng: unknown): boolean {
  if (!isValidCoordinate(lat, lng)) return false;
  const la = lat as number, lo = lng as number;
  return la >= KOREA_BOUNDS.latMin && la <= KOREA_BOUNDS.latMax && lo >= KOREA_BOUNDS.lngMin && lo <= KOREA_BOUNDS.lngMax;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m 앞` : `${km.toFixed(1)}km`;
}
