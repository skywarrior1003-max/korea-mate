/**
 * TASK-MY-TRIP-EXECUTION-MODE-V1 — 오늘 여행 NOW/NEXT 판정 계약
 * Run: node --experimental-strip-types --test src/lib/planner/execution-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { todayPosition, findTodayDayIndex, freshClockFor } from "./execution-core.ts";

const T = (time: string, duration: string | null = "60m", src: string = "scheduler") =>
  ({ time, duration, timeSource: src });
const U = (time = "19:30") => ({ time, duration: "60m" });   // 기본값 시각 — 출처 없음

test("★NOW = 가장 최근에 시작 시각이 지난 timed 항목 — 다음 timed 가 시작되면 넘어간다", () => {
  const places = [T("09:00"), T("11:00", "45m", "user"), T("14:00")];
  assert.deepEqual(todayPosition(places, "08:00"), { phase: "before", nowIdx: null, nextIdx: 0 });
  assert.deepEqual(todayPosition(places, "09:00"), { phase: "during", nowIdx: 0, nextIdx: 1 });
  // 체류시간(60m)이 지나고 다음 시작 전 — 완료를 지어내지 않고 마지막 시작 항목이 NOW 로 남는다
  assert.deepEqual(todayPosition(places, "10:30"), { phase: "during", nowIdx: 0, nextIdx: 1 });
  assert.deepEqual(todayPosition(places, "11:00"), { phase: "during", nowIdx: 1, nextIdx: 2 }, "사용자 시각(user)도 판정에 쓴다");
  assert.deepEqual(todayPosition(places, "14:01"), { phase: "during", nowIdx: 2, nextIdx: null });
});

test("★마지막 항목 뒤 — 체류시간을 알 때만 after 로 마감한다", () => {
  assert.equal(todayPosition([T("09:00", "60m")], "10:00").phase, "after");
  assert.equal(todayPosition([T("09:00", "60m")], "09:59").phase, "during");
  assert.equal(todayPosition([T("09:00", null)], "23:00").phase, "during", "체류시간을 모르면 끝났다고 하지 않는다");
});

test("★시간 없는 항목은 판정에서 제외 — 목록 index 는 원본 기준", () => {
  const places = [U(), T("09:00"), U(), T("13:00")];
  assert.deepEqual(todayPosition(places, "10:00"), { phase: "during", nowIdx: 1, nextIdx: 3 });
  assert.deepEqual(todayPosition([U(), U()], "10:00"), { phase: "none", nowIdx: null, nextIdx: null }, "timed 가 없으면 none — 가짜 NOW 를 만들지 않는다");
  assert.equal(todayPosition([T("09:00")], "bad").phase, "none");
});

test("★오늘 Day 찾기 — 한국 달력 날짜가 일치하는 Day 만", () => {
  const days = [{ date: "2026-08-23" }, { date: "2026-08-24" }];
  assert.equal(findTodayDayIndex(days, "2026-08-24"), 1);
  assert.equal(findTodayDayIndex(days, "2026-08-25"), null);
  assert.equal(findTodayDayIndex([], "2026-08-24"), null);
});

test("★흐르는 시계 — 같은 날이면 새 시각, 자정이 지나면 마지막 같은-날 시각 유지 (TIME-FRESHNESS-FIX-V1)", () => {
  assert.equal(freshClockFor("2026-08-24", { todayISO: "2026-08-24", nowHHMM: "13:05" }, "12:00"), "13:05");
  assert.equal(freshClockFor("2026-08-24", { todayISO: "2026-08-25", nowHHMM: "00:01" }, "23:58"), "23:58", "날짜가 바뀌면 가짜 '첫 일정 전'을 만들지 않는다");
  assert.equal(freshClockFor("2026-08-24", null, "10:00"), "10:00");
});

test("★page.tsx 시간 신선도 — 1분 간격+visibility 갱신, 벗어나면 정리, 자동 전환 없음 (TIME-FRESHNESS-FIX-V1)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  const eff = page.slice(page.indexOf("const [execClock, setExecClock]"), page.indexOf("}, [execEntry]);"));
  assert.match(eff, /if \(!execEntry\) return;/, "오늘 여행일 때만 시계가 돈다");
  assert.match(eff, /window\.setInterval\(refresh, 60_000\)/, "약 1분 간격 갱신");
  assert.match(eff, /document\.addEventListener\("visibilitychange", onVisible\)/, "탭이 다시 보이면 즉시 갱신");
  assert.match(eff, /window\.clearInterval\(timer\); document\.removeEventListener\("visibilitychange", onVisible\)/, "벗어나면 timer·listener 정리");
  assert.ok(!/setExecEntry/.test(eff), "시계 갱신이 화면을 전환하지 않는다");
  assert.match(page, /const nowHHMM = freshClockFor\(execEntry\.todayISO, execClock, execEntry\.nowHHMM\)/, "판정은 흐르는 시계로");
  assert.match(page, /todayPosition\(day\.places, nowHHMM\)/);
});

test("★page.tsx 통합 — 진입은 사용자 클릭뿐, 자동 전환 없음, 새 route/탭 없음 (EXECUTION-MODE-V1)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const \[execEntry, setExecEntry\] = useState/, "오늘 여행 상태");
  assert.equal((page.match(/setExecEntry\(\{/g) ?? []).length, 1, "진입은 openTodayTrip 한 곳뿐");
  assert.match(page, /function openTodayTrip\(\)/, "사용자 클릭 핸들러로만 진입");
  assert.ok(!/useEffect\([^}]*setExecEntry/.test(page.slice(page.indexOf("function ItineraryResult"))), "effect 가 오늘 여행을 자동 전환하지 않는다");
  assert.match(page, /tripBucket\(\{ startDate, endDate \}, todayISO\)/, "진입 노출은 trips-lifecycle 재사용");
  assert.match(page, /todayPosition\(day\.places, nowHHMM\)/, "NOW/NEXT 는 오늘 여행의 흐르는 시계로 판정");
  assert.ok(!/["'`]\/execution/.test(page), "새 route 를 만들지 않는다");
  assert.match(page, /findTodayDayIndex\(days, clock\.todayISO\)/, "오늘 Day 는 KST 달력으로 찾는다");
});
