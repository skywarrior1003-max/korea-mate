import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidBounds, isInBounds, spotsInBounds, countInBounds,
  shouldOfferAreaSearch, runAreaSearch, boundsCenter, boundsDiagonalKm, AREA_MOVE_RATIO,
  isWithinRadius, spotsWithinRadius, distanceM, isRadiusOption, RADIUS_OPTIONS_M,
  geoReducer, INITIAL_GEO_STATE, radiusFilterActive, mapStillUsable,
  selectExploreSpots, sortByDistance, spotAreaKey,
  type MapBounds, type GeoState,
} from "./map-area-core.ts";

type S = { id: number; lat: number; lng: number; sourceKey?: string; name?: string;
  city?: string; category?: string; description?: string; district?: string | null; tags?: string[] };

const BUSAN = { lat: 35.1587, lng: 129.1604 };
// 부산 도심을 감싸는 경계 (운영 데이터 범위 lat 35.09~35.19 / lng 129.01~129.20)
const B: MapBounds = { south: 35.10, west: 129.02, north: 35.19, east: 129.20 };

function sample(n: number, spread = 0.09): S[] {
  const out: S[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 0.6180339887) % 1;
    const b = (i * 0.7548776662) % 1;
    out.push({ id: i + 1, sourceKey: `city_spot:${i + 1}`,
      lat: BUSAN.lat + (a - 0.5) * spread, lng: BUSAN.lng + (b - 0.5) * spread,
      name: `Spot ${i + 1}`, city: "Busan", category: i % 3 === 0 ? "attraction" : i % 3 === 1 ? "restaurant" : "nature",
      description: i % 5 === 0 ? "beach walk" : "city stroll", district: i % 2 ? "Haeundae-gu" : "Jung-gu", tags: [] });
  }
  return out;
}

// ── bounds ───────────────────────────────────────────────────────────────────
test("경계 유효성", () => {
  assert.equal(isValidBounds(B), true);
  assert.equal(isValidBounds({ south: 36, west: 129, north: 35, east: 130 }), false); // south>north
  assert.equal(isValidBounds({ south: NaN, west: 1, north: 2, east: 3 }), false);
  assert.equal(isValidBounds(null), false);
  assert.equal(isValidBounds({ south: -95, west: 1, north: 2, east: 3 }), false);
});

test("★경계선 위 장소는 포함한다 — 화면에 보이는데 빠지면 안 된다", () => {
  assert.equal(isInBounds(B.south, B.west, B), true);
  assert.equal(isInBounds(B.north, B.east, B), true);
  assert.equal(isInBounds(B.south - 0.0001, 129.1, B), false);
  assert.equal(isInBounds(35.15, B.east + 0.0001, B), false);
});

test("좌표가 없거나 (0,0) 이면 경계 밖으로 본다", () => {
  assert.equal(isInBounds(0, 0, B), false);
  assert.equal(isInBounds(NaN, 129.1, B), false);
});

test("★bounds 밖 장소를 정확히 제외한다 — 누락·잔존 0", () => {
  const s = sample(200, 0.4);
  const inside = spotsInBounds(s, B);
  const outside = s.filter(x => !inside.includes(x));
  assert.ok(inside.length > 0 && outside.length > 0, "표본이 양쪽에 걸쳐야 한다");
  for (const x of inside) assert.equal(isInBounds(x.lat, x.lng, B), true);
  for (const x of outside) assert.equal(isInBounds(x.lat, x.lng, B), false);
  assert.equal(inside.length + outside.length, 200);
  assert.equal(new Set(inside.map(spotAreaKey)).size, inside.length, "중복 0");
});

test("bounds 가 없으면 전체를 그대로 돌려준다", () => {
  const s = sample(30);
  assert.equal(spotsInBounds(s, null).length, 30);
  assert.equal(countInBounds(s, null), 30);
});

test("countInBounds 는 목록 길이와 일치", () => {
  const s = sample(200, 0.4);
  assert.equal(countInBounds(s, B), spotsInBounds(s, B).length);
});

test("날짜변경선을 넘는 경계도 처리한다", () => {
  const wrap: MapBounds = { south: -10, west: 170, north: 10, east: -170 };
  assert.equal(isInBounds(0, 175, wrap), true);
  assert.equal(isInBounds(0, -175, wrap), true);
  assert.equal(isInBounds(0, 0, wrap), false);
});

// ── 이 지역 검색 제안 ────────────────────────────────────────────────────────
test("아직 한 번도 검색하지 않았으면 제안한다", () => {
  assert.equal(shouldOfferAreaSearch({ searchedBounds: null, currentBounds: B }), true);
});

test("지도를 안 움직였으면 제안하지 않는다", () => {
  assert.equal(shouldOfferAreaSearch({ searchedBounds: B, currentBounds: B }), false);
});

test("★살짝 스친 정도로는 제안하지 않는다", () => {
  const tiny: MapBounds = { ...B, south: B.south + 0.001, north: B.north + 0.001 };
  assert.equal(shouldOfferAreaSearch({ searchedBounds: B, currentBounds: tiny }), false);
});

test("★대각선의 25% 이상 이동하면 제안한다", () => {
  const diag = boundsDiagonalKm(B);
  assert.ok(diag > 1);
  const far: MapBounds = { south: B.south + 0.09, west: B.west + 0.09, north: B.north + 0.09, east: B.east + 0.09 };
  const moved = boundsDiagonalKm({ south: boundsCenter(B).lat, west: boundsCenter(B).lng,
    north: boundsCenter(far).lat, east: boundsCenter(far).lng });
  assert.ok(moved / boundsDiagonalKm(far) >= AREA_MOVE_RATIO);
  assert.equal(shouldOfferAreaSearch({ searchedBounds: B, currentBounds: far }), true);
});

test("확대·축소만 해도 보이는 범위가 크게 달라지면 제안한다", () => {
  const zoomed: MapBounds = { south: 35.14, west: 129.10, north: 35.17, east: 129.13 };
  assert.equal(shouldOfferAreaSearch({ searchedBounds: B, currentBounds: zoomed }), true);
});

test("이 지역 검색 실행은 상태만 갱신한다", () => {
  const next = runAreaSearch({ searchedBounds: null, currentBounds: B });
  assert.deepEqual(next.searchedBounds, B);
  assert.equal(shouldOfferAreaSearch(next), false);
});

test("현재 경계가 없으면 제안하지 않는다", () => {
  assert.equal(shouldOfferAreaSearch({ searchedBounds: B, currentBounds: null }), false);
});

// ── 반경 ─────────────────────────────────────────────────────────────────────
test("반경 옵션은 500·1000·3000·5000 m", () => {
  assert.deepEqual([...RADIUS_OPTIONS_M], [500, 1000, 3000, 5000]);
  assert.equal(isRadiusOption(1000), true);
  assert.equal(isRadiusOption(2000), false);
  assert.equal(isRadiusOption("1000"), false);
});

test("★반경 경계값은 포함한다", () => {
  // 위도 1도 ≈ 111.32km → 1000m ≈ 0.008983도
  const exact = { lat: BUSAN.lat + 1000 / 111320, lng: BUSAN.lng };
  assert.equal(isWithinRadius(BUSAN, exact, 1000), true, "정확히 1000m 는 포함");
  const beyond = { lat: BUSAN.lat + 1100 / 111320, lng: BUSAN.lng };
  assert.equal(isWithinRadius(BUSAN, beyond, 1000), false);
});

test("반경 필터는 원점·반경이 없으면 전체를 통과시킨다", () => {
  const s = sample(50);
  assert.equal(spotsWithinRadius(s, null, 1000).length, 50);
  assert.equal(spotsWithinRadius(s, BUSAN, null).length, 50);
});

test("★반경이 커질수록 결과가 줄지 않는다 (단조성)", () => {
  const s = sample(400, 0.2);
  const counts = RADIUS_OPTIONS_M.map(r => spotsWithinRadius(s, BUSAN, r).length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `${counts}`);
  assert.ok(counts[0] > 0 && counts[3] > counts[0], `${counts}`);
});

test("좌표 없는 장소는 반경 결과에 들어가지 않는다", () => {
  const s: S[] = [{ id: 1, lat: 0, lng: 0 }, { id: 2, lat: BUSAN.lat, lng: BUSAN.lng }];
  assert.equal(spotsWithinRadius(s, BUSAN, 5000).length, 1);
});

test("거리 계산 — 좌표 없으면 0 이 아니라 null", () => {
  assert.equal(distanceM(null, { lat: 35.1, lng: 129.1 }), null);
  assert.equal(distanceM(BUSAN, { lat: 0, lng: 0 }), null);
  const d = distanceM(BUSAN, { lat: BUSAN.lat + 1000 / 111320, lng: BUSAN.lng });
  assert.ok(d !== null && Math.abs(d - 1000) < 5, `${d}`);
});

test("거리순 정렬 — 좌표 없는 장소는 뒤로 밀되 버리지 않는다", () => {
  const s: S[] = [
    { id: 1, lat: BUSAN.lat + 0.05, lng: BUSAN.lng },
    { id: 2, lat: 0, lng: 0 },
    { id: 3, lat: BUSAN.lat + 0.001, lng: BUSAN.lng },
  ];
  const out = sortByDistance(s, BUSAN);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map(x => x.id), [3, 1, 2]);
});

// ── 위치 권한 ────────────────────────────────────────────────────────────────
test("초기 상태는 idle — 사용자 행동 없이 권한을 요청하지 않는다", () => {
  assert.equal(INITIAL_GEO_STATE.status, "idle");
  assert.equal(INITIAL_GEO_STATE.coords, null);
});

test("★허용·거절·실패·미지원이 각각 다른 상태로 남는다", () => {
  const s: GeoState = geoReducer(INITIAL_GEO_STATE, { type: "request" });
  assert.equal(s.status, "prompting");
  assert.equal(geoReducer(s, { type: "granted", lat: 35.16, lng: 129.16 }).status, "granted");
  assert.equal(geoReducer(s, { type: "denied" }).status, "denied");
  assert.equal(geoReducer(s, { type: "unavailable" }).status, "unavailable");
  assert.equal(geoReducer(s, { type: "unsupported" }).status, "unsupported");
});

test("★잘못된 좌표로 온 성공은 성공으로 치지 않는다", () => {
  const s = geoReducer(INITIAL_GEO_STATE, { type: "granted", lat: 0, lng: 0 });
  assert.equal(s.status, "unavailable");
  assert.equal(s.coords, null);
});

test("★거절·실패해도 지도 탐색은 계속된다", () => {
  for (const t of ["denied", "unavailable", "unsupported"] as const) {
    const s = geoReducer(INITIAL_GEO_STATE, { type: t });
    assert.equal(mapStillUsable(s), true);
    assert.equal(radiusFilterActive(s), false, t);
  }
});

test("거절하면 반경 선택도 초기화된다", () => {
  let s = geoReducer(INITIAL_GEO_STATE, { type: "granted", lat: 35.16, lng: 129.16 });
  s = geoReducer(s, { type: "setRadius", radiusM: 3000 });
  assert.equal(radiusFilterActive(s), true);
  s = geoReducer(s, { type: "denied" });
  assert.equal(s.radiusM, null);
  assert.equal(radiusFilterActive(s), false);
});

test("반경만 고르고 위치가 없으면 필터는 켜지지 않는다", () => {
  const s = geoReducer(INITIAL_GEO_STATE, { type: "setRadius", radiusM: 1000 });
  assert.equal(radiusFilterActive(s), false);
});

// ── 결합 필터 ────────────────────────────────────────────────────────────────
test("★도시·카테고리·검색어·bounds·반경이 함께 좁힌다", () => {
  const s = sample(300, 0.3);
  const geo: GeoState = { status: "granted", coords: BUSAN, radiusM: 5000 };
  const all = selectExploreSpots(s, {});
  const byCity = selectExploreSpots(s, { city: "Busan" });
  const byCat = selectExploreSpots(s, { city: "Busan", category: "attraction" });
  const bySearch = selectExploreSpots(s, { city: "Busan", category: "attraction", search: "beach" });
  const byBounds = selectExploreSpots(s, { city: "Busan", category: "attraction", search: "beach", bounds: B });
  const byRadius = selectExploreSpots(s, { city: "Busan", category: "attraction", search: "beach", bounds: B, geo });
  assert.equal(all.length, 300);
  assert.ok(byCat.length < byCity.length);
  assert.ok(bySearch.length <= byCat.length);
  assert.ok(byBounds.length <= bySearch.length);
  assert.ok(byRadius.length <= byBounds.length);
  // 각 단계는 앞 단계의 부분집합이어야 한다
  const set = (a: S[]) => new Set(a.map(spotAreaKey));
  for (const [a, b] of [[byCat, byCity], [bySearch, byCat], [byBounds, bySearch], [byRadius, byBounds]] as [S[], S[]][])
    for (const x of a) assert.ok(set(b).has(spotAreaKey(x)));
});

test("category all 은 거르지 않는다", () => {
  const s = sample(60);
  assert.equal(selectExploreSpots(s, { category: "all" }).length, 60);
});

test("★Map 과 List 가 같은 함수로 같은 결과를 얻는다", () => {
  const s = sample(300, 0.3);
  const q = { city: "Busan", category: "nature", search: "stroll", bounds: B };
  const mapSide = selectExploreSpots(s, q);
  const listSide = selectExploreSpots(s, q);
  assert.deepEqual(mapSide.map(spotAreaKey), listSide.map(spotAreaKey));
  assert.equal(new Set(mapSide.map(spotAreaKey)).size, mapSide.length, "중복 0");
});

test("빈 결과에서도 예외가 나지 않는다", () => {
  assert.equal(selectExploreSpots([] as S[], { city: "Busan", bounds: B }).length, 0);
  assert.equal(countInBounds([], B), 0);
  assert.deepEqual(sortByDistance([] as S[], BUSAN), []);
});

// ── 성능 ─────────────────────────────────────────────────────────────────────
test("★1,500개 표본 — bounds·반경·결합 필터가 각 50ms 미만", () => {
  const s = sample(1500, 0.5);
  const geo: GeoState = { status: "granted", coords: BUSAN, radiusM: 5000 };
  const t0 = performance.now(); const a = spotsInBounds(s, B); const t1 = performance.now();
  const b = spotsWithinRadius(s, BUSAN, 3000); const t2 = performance.now();
  const c = selectExploreSpots(s, { city: "Busan", category: "attraction", search: "beach", bounds: B, geo });
  const t3 = performance.now();
  assert.ok(t1 - t0 < 50, `bounds ${(t1 - t0).toFixed(1)}ms`);
  assert.ok(t2 - t1 < 50, `radius ${(t2 - t1).toFixed(1)}ms`);
  assert.ok(t3 - t2 < 50, `combined ${(t3 - t2).toFixed(1)}ms`);
  assert.ok(a.length > 0 && b.length > 0 && c.length >= 0);
  assert.equal(new Set(a.map(spotAreaKey)).size, a.length);
});

test("★1,500개 거리 정렬도 100ms 미만", () => {
  const s = sample(1500, 0.5);
  const t0 = performance.now();
  const out = sortByDistance(s, BUSAN);
  const ms = performance.now() - t0;
  assert.ok(ms < 100, `${ms.toFixed(1)}ms`);
  assert.equal(out.length, 1500);
  assert.equal(new Set(out.map(spotAreaKey)).size, 1500, "정렬이 장소를 잃지 않는다");
});
