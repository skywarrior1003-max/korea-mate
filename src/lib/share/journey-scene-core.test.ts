// Shared Story Trip Map 장면 — privacy 와 투영 계약 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildJourneyScene, parseJourneyScene } from "./journey-scene-core.ts";

const day = (n: number, places: unknown[]) => ({ dayNumber: n, places });
const spot = (lat: number, lng: number, over: Record<string, unknown> = {}) =>
  ({ source: "city_spot", lat, lng, name: "x", ...over });

test("공개 카탈로그 장소만 들어간다 — user_spot·숙소·좌표 없는 stop 제외", () => {
  const s = buildJourneyScene([day(1, [
    spot(35.10, 129.03),
    spot(35.16, 129.16),
    { source: "user_spot", lat: 35.12, lng: 129.05 },          // 내 장소 — 제외
    spot(35.13, 129.07, { isAccommodation: true }),            // 숙소 — 제외
    { source: "city_spot", name: "no-coords" },                // 좌표 없음 — 제외
  ])]);
  assert.ok(s);
  assert.equal(s!.days.length, 1);
  assert.equal(s!.days[0]!.points.length, 2);
});

test("출력에 lat/lng 라는 키·절대 좌표가 없다 — 상대 기하만 나간다", () => {
  const s = buildJourneyScene([day(1, [spot(35.10, 129.03), spot(35.16, 129.16)])]);
  const json = JSON.stringify(s);
  for (const bad of ["lat", "lng", "latitude", "longitude", "129.", "35.1"]) {
    assert.ok(!json.includes(bad), `${bad} 가 장면에 남아 있다`);
  }
});

test("모든 점이 0..1 안이고 방문 순서가 보존된다", () => {
  const s = buildJourneyScene([
    day(1, [spot(35.10, 129.03), spot(35.20, 129.10), spot(35.15, 129.20)]),
    day(2, [spot(35.05, 129.00), spot(35.30, 129.25)]),
  ])!;
  for (const d of s.days) for (const [x, y] of d.points) {
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${x},${y}`);
  }
  // Day1 첫 점(남서)이 마지막 점보다 왼쪽 — 경도 순서 보존
  assert.ok(s.days[0]!.points[0]![0] < s.days[0]!.points[2]![0]);
  // 북쪽이 위(y 작음): Day2 의 35.30 이 35.05 보다 y 작다
  assert.ok(s.days[1]!.points[1]![1] < s.days[1]!.points[0]![1]);
});

test("점이 2개 미만이면 장면을 만들지 않는다", () => {
  assert.equal(buildJourneyScene([day(1, [spot(35.1, 129.0)])]), null);
  assert.equal(buildJourneyScene([]), null);
  assert.equal(buildJourneyScene([day(1, [{ source: "user_spot", lat: 35, lng: 129 }])]), null);
});

test("__v:2 저장 형식도 읽는다", () => {
  const s = buildJourneyScene({ __v: 2, scheduled: [day(1, [spot(35.1, 129.0), spot(35.2, 129.1)])] });
  assert.ok(s && s.days[0]!.points.length === 2);
});

test("한국 밖 좌표(데이터 오류)는 장면을 왜곡하지 않는다", () => {
  const s = buildJourneyScene([day(1, [spot(35.10, 129.03), spot(35.16, 129.16), spot(0, 0)])])!;
  assert.equal(s.days[0]!.points.length, 2);
});

test("parseJourneyScene — 정상 왕복, 범위 밖·모양 오류는 null", () => {
  const s = buildJourneyScene([day(1, [spot(35.1, 129.0), spot(35.2, 129.1)])])!;
  assert.deepEqual(parseJourneyScene(JSON.parse(JSON.stringify(s))), s);
  assert.equal(parseJourneyScene(null), null);
  assert.equal(parseJourneyScene({ days: [{ dayNumber: 1, points: [[2, 0], [0, 0]] }], aspect: 1 }), null);
  assert.equal(parseJourneyScene({ days: [{ dayNumber: 1, points: [[0.1, 0.1]] }], aspect: 1 }), null);
});
