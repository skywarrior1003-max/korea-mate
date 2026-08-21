/**
 * TASK-MY-TRIPS-FINAL-UI-V1 — Trips 목록의 묶음 규칙과 "오늘 · 장소"
 * Run: node --experimental-strip-types --test src/lib/trips/trips-lifecycle.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tripBucket, classifyTrips, todayStopLabel, formatTripDates, scheduledDaysOf } from "./trips-lifecycle.ts";

const T = "2026-08-21";

test("L1: 날짜 하나로만 가른다 — traveling / upcoming / past", () => {
  assert.equal(tripBucket({ startDate: "2026-08-20", endDate: "2026-08-22" }, T), "traveling");
  assert.equal(tripBucket({ startDate: "2026-08-21", endDate: "2026-08-21" }, T), "traveling");   // 당일치기 오늘
  assert.equal(tripBucket({ startDate: "2026-08-22", endDate: "2026-08-25" }, T), "upcoming");
  assert.equal(tripBucket({ startDate: "2026-08-10", endDate: "2026-08-20" }, T), "past");
  assert.equal(tripBucket({ startDate: "", endDate: "" }, T), "upcoming", "날짜 없는 여행은 아직 떠나지 않은 것");
});

test("L2: 예정은 가까운 출발일부터, 지난 여행은 최근 종료일부터", () => {
  const r = classifyTrips([
    { id: "a", startDate: "2026-09-10", endDate: "2026-09-12" },
    { id: "b", startDate: "2026-08-25", endDate: "2026-08-27" },
    { id: "c", startDate: "2026-07-01", endDate: "2026-07-03" },
    { id: "d", startDate: "2026-08-01", endDate: "2026-08-03" },
    { id: "e", startDate: "", endDate: "" },
  ], T);
  assert.deepEqual(r.upcoming.map(t => t.id), ["b", "a", "e"]);
  assert.deepEqual(r.past.map(t => t.id), ["d", "c"]);
  assert.equal(r.traveling.length, 0);
});

const days = { __v: 2, unscheduled: [], scheduled: [
  { date: "2026-08-20", dayNumber: 1, places: [{ name: "Haeundae", time: "10:00" }] },
  { date: "2026-08-21", dayNumber: 2, places: [{ name: "Gyeongbokgung", time: "09:00" }, { name: "Bukchon", time: "11:30" }, { name: "Tosokchon", time: "13:00" }] },
  { date: "2026-08-22", dayNumber: 3, places: [{ name: "Tomorrow", time: "10:00" }] },
] };

test("S1: 오늘 Day 에서 지난 장소 중 마지막 — 시간이 기준이지 GPS 가 아니다", () => {
  assert.equal(todayStopLabel(days, T, "12:00"), "Bukchon");
  assert.equal(todayStopLabel(days, T, "09:00"), "Gyeongbokgung");
  assert.equal(todayStopLabel(days, T, "23:00"), "Tosokchon");
});

test("S2: 아직 하나도 안 됐으면 오늘의 첫 장소", () => {
  assert.equal(todayStopLabel(days, T, "07:00"), "Gyeongbokgung");
});

test("S3: 오늘 Day 가 없거나 장소가 없으면 null — 만들어 내지 않는다", () => {
  assert.equal(todayStopLabel(days, "2026-08-30", "12:00"), null);
  assert.equal(todayStopLabel({ __v: 2, scheduled: [{ date: T, places: [] }], unscheduled: [] }, T, "12:00"), null);
  assert.equal(todayStopLabel(null, T, "12:00"), null);
  assert.equal(todayStopLabel("garbage", T, "12:00"), null);
});

test("S4: v1 Day[] 모양도 읽는다", () => {
  const v1 = [{ date: T, places: [{ name: "Only One" }] }];
  assert.equal(scheduledDaysOf(v1).length, 1);
  assert.equal(todayStopLabel(v1, T, "12:00"), "Only One");   // 시간 없는 장소는 '지남' 아님 → 첫 장소
});

test("D1: 날짜 범위는 locale 로 적고, 한쪽만 있으면 그 날짜만", () => {
  assert.match(formatTripDates("2026-08-19", "2026-08-24", "en-US"), /Aug 19.*Aug 24/);
  assert.match(formatTripDates("2026-08-19", "", "en-US"), /Aug 19/);
  assert.equal(formatTripDates("", "", "en-US"), "");
  assert.match(formatTripDates("2026-10-09", "2026-10-12", "ko-KR"), /10월/);
});
