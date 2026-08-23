/**
 * TASK-MY-TRIP-PLANNING-FINAL-V1 — Planning 화면 표시 규칙
 * Run: node --experimental-strip-types --test src/lib/planner/planning-view-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDurationMinutes, timeToMinutes, shouldShowClock, formatClock, formatDuration, transitMinutes, humanizeCategory, MAX_TRANSIT_MINUTES, orderDayPlaces } from "./planning-view-core.ts";

const L = { hours: (h: number) => `${h}h`, hoursMinutes: (h: number, m: number) => `${h}h${m}m`, minutes: (m: number) => `${m}m` };

test("★시각은 스케줄러가 준 것만 보여 준다 — 기본값·추정 시각은 내지 않는다", () => {
  assert.equal(shouldShowClock({ time: "09:00", timeSource: "scheduler" }), true);
  assert.equal(shouldShowClock({ time: "19:30" }), false, "보관함 기본값");
  assert.equal(shouldShowClock({ time: "19:30", timeSource: "user" }), true, "사용자가 직접 고친 시각은 실제 시각이다");
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

test("★순서 계약: 시각 있는 항목은 시간이, 없는 항목은 사용자가 둔 자리가 순서다 (ORDER-TIME-CONTRACT-FIX-V1)", () => {
  const T = (name: string, time: string, src = "scheduler") => ({ name, time, timeSource: src });
  const U = (name: string, time = "19:30") => ({ name, time });   // 기본값 시간 — 시각 출처 없음
  const names = (xs: { name: string }[]) => xs.map(x => x.name);

  // 시각 있는 항목끼리는 시간 오름차순 — 같은 시각은 원래 순서 유지(stable)
  assert.deepEqual(names(orderDayPlaces([T("B", "11:00"), T("A", "09:00", "user"), T("B2", "11:00")])), ["A", "B", "B2"]);
  // 시각 없는 항목은 자기 자리를 지킨다 — 기본값 19:30 이 morning 항목보다 뒤로 끌려가지 않는다
  assert.deepEqual(names(orderDayPlaces([U("u1"), T("B", "11:00"), T("A", "09:00"), U("u2")])), ["u1", "A", "B", "u2"]);
  // 전부 시각 없음 → 수동 순서 그대로
  assert.deepEqual(names(orderDayPlaces([U("c"), U("a"), U("b")])), ["c", "a", "b"]);
  // 멱등
  const once = orderDayPlaces([U("u"), T("B", "11:00"), T("A", "09:00")]);
  assert.deepEqual(orderDayPlaces(once), once);
  assert.deepEqual(names(once), ["u", "A", "B"]);
});

test("★page.tsx 가 순서 계약을 실제로 쓴다 — 정렬 게이트·시간 수정·Day 이동·↑↓ 노출 (ORDER-TIME-CONTRACT-FIX-V1)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const sorted = orderDayPlaces\(day\.places\)/, "sanitizeDays 가 orderDayPlaces 를 쓴다");
  assert.match(page, /orderDayPlaces\(day\.places\.map\(/, "setPlaceTime 이 시간 수정 즉시 순서 계약을 적용한다");
  assert.match(page, /orderDayPlaces\(\[\.\.\.day\.places, moving\]\)/, "moveToDay 도 순서 계약을 지킨다");
  assert.match(page, /\{!clock \? \(/, "시각 있는 항목에는 ↑↓ 를 주지 않는다");
  assert.match(page, /editTimedOrderHint/, "시각 항목에는 시간으로 순서를 조정한다는 안내를 준다");
  const ko = readFileSync(new URL("../../messages/ko.json", import.meta.url), "utf8");
  assert.ok(!ko.includes("저장 후에는 각 날이 시간순으로 정렬돼요"), "편집 손실을 정당화하던 옛 안내 문구가 남아 있다");
  assert.match(ko, /editTimedOrderHint/, "안내 키가 번역 파일에 있다");
});

test("★편집: 다른 Day 이동·시작시간 수정은 기존 days 상태를 고쳐 autosave 로 흐른다 (EDIT-COMPLETION-V1)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function moveToDay\(dayIdx: number, placeIdx: number, targetDayIdx: number\)/);
  assert.match(page, /function setPlaceTime\(dayIdx: number, placeIdx: number, hhmm: string\)/);
  assert.match(page, /timeSource: "user" as const/, "사용자 시각은 user 출처로 표시된다");
  assert.doesNotMatch(page.slice(page.indexOf("function setPlaceTime")).slice(0, 900), /isFixed: (false|undefined)|delete [a-z]+\.isFixed/, "시간 수정이 고정 표시를 지우지 않는다");
  assert.match(page, /function movePlace\(dayIdx: number, placeIdx: number, dir: "up" \| "down"\)/, "순서 변경 보존");
  assert.match(page, /function deletePlace\(dayIdx: number, placeIdx: number\)/, "삭제 보존");
  assert.ok(!page.includes("🔍 Search Spots"), "주황 Search Spots CTA 가 남아 있다");
});
