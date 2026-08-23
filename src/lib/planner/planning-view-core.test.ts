/**
 * TASK-MY-TRIP-PLANNING-FINAL-V1 — Planning 화면 표시 규칙
 * Run: node --experimental-strip-types --test src/lib/planner/planning-view-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDurationMinutes, timeToMinutes, shouldShowClock, formatClock, formatDuration, transitMinutes, humanizeCategory, MAX_TRANSIT_MINUTES } from "./planning-view-core.ts";

const L = { hours: (h: number) => `${h}h`, hoursMinutes: (h: number, m: number) => `${h}h${m}m`, minutes: (m: number) => `${m}m` };

test("★시각은 스케줄러가 준 것만 보여 준다 — 기본값·추정 시각은 내지 않는다", () => {
  assert.equal(shouldShowClock({ time: "09:00", timeSource: "scheduler" }), true);
  assert.equal(shouldShowClock({ time: "19:30" }), false, "보관함 기본값");
  assert.equal(shouldShowClock({ time: "19:30", timeSource: "default" }), false);
  assert.equal(shouldShowClock({ time: "", timeSource: "scheduler" }), false);
  assert.equal(shouldShowClock({ time: "25:00", timeSource: "scheduler" }), false);
});

test("★locale 시각 표기 — 값을 바꾸지 않고 표기만 바꾼다", () => {
  assert.equal(formatClock("14:05", "en"), "2:05 PM");
  assert.match(formatClock("09:00", "ko")!, /9:00/);
  assert.equal(formatClock("bad", "en"), null);
  assert.equal(timeToMinutes("23:59"), 1439);
  assert.equal(timeToMinutes("9:5"), null);
});

test("★체류시간 표기", () => {
  assert.equal(parseDurationMinutes("90m"), 90);
  assert.equal(parseDurationMinutes("1.5h"), 90);
  assert.equal(parseDurationMinutes("45"), 45);
  assert.equal(parseDurationMinutes("soon"), null);
  assert.equal(formatDuration(90, L), "1h30m");
  assert.equal(formatDuration(120, L), "2h");
  assert.equal(formatDuration(45, L), "45m");
  assert.equal(formatDuration(0, L), null);
  assert.equal(formatDuration(null, L), null);
});

test("★이동시간은 두 스케줄러 시각 사이의 빈 시간만 읽는다 — 추정하지 않는다", () => {
  const a = { time: "09:00", duration: "90m", timeSource: "scheduler" };
  assert.equal(transitMinutes(a, { time: "10:45", timeSource: "scheduler" }), 15);
  assert.equal(transitMinutes(a, { time: "10:30", timeSource: "scheduler" }), null, "바로 이어짐은 표시하지 않는다");
  assert.equal(transitMinutes(a, { time: "10:45" }), null, "다음 항목 시각이 기본값이면 계산하지 않는다");
  assert.equal(transitMinutes({ ...a, duration: null }, { time: "10:45", timeSource: "scheduler" }), null, "체류시간을 모르면 계산하지 않는다");
  assert.equal(transitMinutes(a, { time: "15:00", timeSource: "scheduler" }), null, `${MAX_TRANSIT_MINUTES}분 넘는 공백은 이동이 아니다`);
});

test("★카테고리 표기", () => {
  assert.equal(humanizeCategory("HISTORICAL_SITE"), "Historical Site");
  assert.equal(humanizeCategory("attraction"), "attraction");
  assert.equal(humanizeCategory(null), "");
});

test("★page.tsx 가 스케줄러 시각에만 timeSource 를 붙이고, 숙소 항목에는 시각을 저장하지 않는다", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /timeSource:\s*"scheduler" as const/, "스케줄러 항목에 timeSource");
  assert.match(page, /item\.is_fixed \? \{ isFixed: true as const \}/, "고정 일정 표시 플래그");
  const acc = page.slice(page.indexOf("if (isAccommodationCheckin(item))"), page.indexOf("return {\n          name:"));
  assert.doesNotMatch(acc, /timeSource|isFixed/, "숙소 항목은 시각 계약을 바꾸지 않는다");
  assert.match(page, /shouldShowClock\(place\)/, "화면은 shouldShowClock 으로만 시각을 낸다");
});
