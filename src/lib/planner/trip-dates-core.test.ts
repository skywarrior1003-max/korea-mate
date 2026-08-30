/**
 * TASK-MY-TRIP-PICKS-TO-TRIP-JOURNEY-RESTORE-V1 — 여행 날짜 재매핑 계약
 * Run: node --experimental-strip-types --test src/lib/planner/trip-dates-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { remapTripDays, tripDateSpan, shiftDateISO } from "./trip-dates-core.ts";

const D = (n: number, date: string, places = 1) =>
  ({ dayNumber: n, date, places: Array.from({ length: places }, (_, i) => ({ name: `p${n}-${i}` })) });

test("★같은 일수 — 날짜만 재매핑, Day 구성·순서 유지", () => {
  const days = [D(1, "2026-10-10", 2), D(2, "2026-10-11", 3)];
  const r = remapTripDays(days, "2026-08-24", "2026-08-25")!;
  assert.deepEqual(r.days.map(d => d.date), ["2026-08-24", "2026-08-25"]);
  assert.deepEqual(r.days.map(d => d.places.length), [2, 3], "장소 구성이 그대로다");
  assert.equal(r.removedDays, 0); assert.equal(r.removedPlaces, 0);
  assert.deepEqual(days.map(d => d.date), ["2026-10-10", "2026-10-11"], "원본을 바꾸지 않는다");
});

test("★기간 증가 — 기존 Day 유지 + 빈 Day 추가", () => {
  const r = remapTripDays([D(1, "2026-10-10", 2)], "2026-08-24", "2026-08-26")!;
  assert.equal(r.days.length, 3);
  assert.deepEqual(r.days.map(d => d.places.length), [2, 0, 0]);
  assert.deepEqual(r.days.map(d => d.dayNumber), [1, 2, 3]);
  assert.equal(r.removedPlaces, 0);
});

test("★기간 감소 — 여기서 지우지 않고 잘린 Day 를 그대로 돌려준다 (미배정 이동은 화면의 몫)", () => {
  const days = [D(1, "2026-10-10", 1), D(2, "2026-10-11", 2), D(3, "2026-10-12", 3)];
  const r = remapTripDays(days, "2026-08-24", "2026-08-24")!;
  assert.equal(r.days.length, 1);
  assert.equal(r.removedDays, 2);
  assert.equal(r.removedPlaces, 5);
  assert.deepEqual(r.removedDayList.map(d => d.date), ["2026-10-11", "2026-10-12"], "잘린 Day 의 원래 날짜가 남는다(fixed 보존용)");
  assert.equal(r.removedDayList.reduce((n, d) => n + d.places.length, 0), 5, "장소가 하나도 사라지지 않는다");
});

test("★잘못된 입력은 null — 날짜를 지어내지 않는다", () => {
  assert.equal(remapTripDays([], "2026-08-25", "2026-08-24"), null);
  assert.equal(remapTripDays([], "bad", "2026-08-24"), null);
  assert.equal(tripDateSpan("2026-08-24", "2026-08-27"), 4);
  assert.equal(shiftDateISO("2026-08-30", 2), "2026-09-01", "월 경계");
});

test("★page.tsx — hero 날짜는 소유자만 편집, 기간 감소는 삭제 없이 미배정 이동 (source guard)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /onEditDates=\{\(!shareId \|\| isOwner\) && itinId \? openDateEdit : null\}/, "소유자만 날짜 편집");
  assert.match(page, /const res = remapTripDays\(days, dateStartInput, dateEndInput\)/, "재매핑은 순수 함수로");
  assert.match(page, /for \(const day of res\.removedDayList\)/, "잘린 Day 의 장소는 미배정으로 옮긴다");
  assert.match(page, /editDatesShrinkMoved/, "옮긴 수를 사용자에게 알린다");
  const picks = readFileSync(new URL("../../app/picks/PicksClient.tsx", import.meta.url), "utf8");
  assert.match(picks, /const city = tripCity \?\? item\.city \?\? viewCity;/, "여행이 없으면 장소 자신의 도시로 담는다");
  assert.match(picks, /TripStarterCard/, "This Trip 에서 여행을 바로 시작할 수 있다");
  assert.ok(!picks.includes("📍"), "위치 핀 emoji 는 픽 화면에 다시 넣지 않는다");
});
