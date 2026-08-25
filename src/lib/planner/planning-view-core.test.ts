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
  assert.match(page, /shouldShowClock\(/, "실제 시각 판정은 shouldShowClock 하나로");
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
  assert.match(page, /\{!timed \? \(/, "시각 있는 항목에는 ↑↓ 를 주지 않는다");
  assert.match(page, /editTimedOrderHint/, "시각 항목에는 시간으로 순서를 조정한다는 안내를 준다");
  const ko = readFileSync(new URL("../../messages/ko.json", import.meta.url), "utf8");
  assert.ok(!ko.includes("저장 후에는 각 날이 시간순으로 정렬돼요"), "편집 손실을 정당화하던 옛 안내 문구가 남아 있다");
  assert.match(ko, /editTimedOrderHint/, "안내 키가 번역 파일에 있다");
});

test("★재오픈 city ownership: 저장된 itinerary 의 city 가 도시 의존 기능의 기준이다 (REOPEN-CITY-OWNERSHIP-FIX-V1)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const tripCity = shareId \? city : paramCity;/, "id 재오픈이면 저장된 city, 아니면 기존 URL/기본값");
  assert.match(page, /setCity\(record\.city\)/, "로드 시 저장된 city 를 상태로 들여온다");
  assert.equal((page.match(/getCityCart\(tripCity\)/g) ?? []).length, 2, "미배정 cart 는 초기값·갱신 모두 tripCity 기준");
  assert.match(page, /\}, \[tripCity\]\);/, "저장된 city 확정 시 cart 를 다시 읽는다");
  // 남은 paramCity 기준 cart 조회는 생성 세션 전용 두 곳뿐이다 — 취향 태그 초기값, 첫 저장 시 cart 정리.
  assert.equal((page.match(/getCityCart\(paramCity\)/g) ?? []).length, 2, "재오픈 화면 경로에 Seoul fallback cart 조회가 남지 않는다");
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

test("★B안: 정확 시각은 지정한 시간(fixed/user)뿐 — 스케줄러 추정 시각은 화면에 내지 않는다 (TIMELINE-B-R1)", async () => {
  const { showsExactTime, exactTimeLabel, localizedPlaceName } = await import("./planning-view-core.ts");
  assert.equal(showsExactTime({ time: "11:21", timeSource: "scheduler" }), false, "스케줄러 추정 시각은 숨긴다");
  assert.equal(exactTimeLabel({ time: "20:00", duration: "60m", timeSource: "scheduler", isFixed: true }), "20:00–21:00", "fixed 는 범위");
  assert.equal(exactTimeLabel({ time: "20:00", duration: null, timeSource: "scheduler", isFixed: true }), "20:00", "끝을 모르면 시작만");
  assert.equal(exactTimeLabel({ time: "10:15", duration: "45m", timeSource: "user" }), "10:15", "사용자 시각은 시작만(체류는 추정)");
  assert.equal(exactTimeLabel({ time: "19:30" }), null, "기본값 시각은 없음");
  assert.equal(localizedPlaceName("Haeundae Beach", { ko: "해운대" }, "ko"), "해운대");
  assert.equal(localizedPlaceName("Haeundae Beach", { ko: "" }, "ko"), "Haeundae Beach", "비어 있으면 원문 — 번역을 만들지 않는다");
  assert.equal(localizedPlaceName("Haeundae Beach", { ko: "해운대" }, "en"), "Haeundae Beach");
  assert.equal(localizedPlaceName("Haeundae Beach", null, "ko"), "Haeundae Beach");
});

test("★page.tsx B안 배선 — 배열 순서 타임라인·구간 헤더·순번·지정 시각·KO 이름 (TIMELINE-B-R1)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const rows = buildOrderedTimeline\(/, "배열 순서 타임라인");
  assert.match(page, /row\.showSectionLabel && \(/, "3구간 헤더");
  assert.match(page, /tPlanner\(`slot_\$\{row\.section\}`\)/, "구간 라벨 키 재사용");
  assert.match(page, /const ordinals = visitOrdinals\(visiblePlaces\)/, "순번 1..N — 숙소 체크인은 번호 없음");
  assert.match(page, /const exact   = exactTimeLabel\(place\)/, "지정 시각만");
  assert.ok(!/formatClock\(place\.time, locale\)/.test(page), "스케줄러 시각 표시가 남아 있다");
  assert.match(page, /localizedPlaceName\(place\.name\?\.trim\(\) \|\| "", l10nOf\(place\), locale\)/, "KO 한글명(있을 때만) — 정확 대응(place_id/이름 완전일치)만");
  assert.ok(!/localizedPlaceName\([^)]*matchCitySpot\(/.test(page), "퍼지 매칭으로 이름을 붙이지 않는다");
  assert.match(page, /tPlanner\("mapHidden"\)/, "좌표 없는 legacy stop 안내");
  assert.match(page, /disabled=\{!isValidCoordinate\(item\.lat, item\.lng\)\}/, "좌표 없는 항목은 담기 비활성");
});
