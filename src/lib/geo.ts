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
