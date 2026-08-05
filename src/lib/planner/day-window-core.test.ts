import test from "node:test";
import assert from "node:assert/strict";
import {
  dayWindow, clampDay, stepDay, canStep, DAY_WINDOW_SIZE,
  parsePlainDate, addPlainDays, formatDayChipDate, formatDayListDate,
  swipeIntent, SWIPE_MIN_DISTANCE, timelineIconKind,
} from "./day-window-core.ts";

// ── 3일 창 ───────────────────────────────────────────────────────────────────
test("★1일 일정은 1개만 보여준다 — 빈 칸으로 3개를 채우지 않는다", () => {
  assert.deepEqual(dayWindow(1, 1), [1]);
});

test("★2일 일정은 2개만 보여준다", () => {
  assert.deepEqual(dayWindow(2, 1), [1, 2]);
  assert.deepEqual(dayWindow(2, 2), [1, 2]);
});

test("★3일 일정은 항상 1·2·3", () => {
  for (const cur of [1, 2, 3]) assert.deepEqual(dayWindow(3, cur), [1, 2, 3]);
});

test("★7일 — 시작·중간·마지막 구간", () => {
  assert.deepEqual(dayWindow(7, 1), [1, 2, 3], "Day 1");
  assert.deepEqual(dayWindow(7, 2), [1, 2, 3], "Day 2 는 아직 가운데가 될 수 없다");
  assert.deepEqual(dayWindow(7, 4), [3, 4, 5], "중간은 가운데");
  assert.deepEqual(dayWindow(7, 6), [5, 6, 7]);
  assert.deepEqual(dayWindow(7, 7), [5, 6, 7], "마지막");
});

test("★10일 Day 5 는 4·5·6", () => {
  assert.deepEqual(dayWindow(10, 5), [4, 5, 6]);
});

test("★14일 — Day 1 / Day 7 / Day 14", () => {
  assert.deepEqual(dayWindow(14, 1),  [1, 2, 3]);
  assert.deepEqual(dayWindow(14, 7),  [6, 7, 8]);
  assert.deepEqual(dayWindow(14, 14), [12, 13, 14]);
});

test("★선택 Day 는 경계 구간을 빼면 항상 가운데다", () => {
  const total = 14;
  for (let d = 2; d <= total - 1; d++) {
    const w = dayWindow(total, d);
    assert.equal(w.length, 3);
    assert.equal(w[1], d, `Day ${d} 가 가운데여야 한다`);
  }
});

test("★창은 항상 연속이고 범위를 벗어나지 않는다", () => {
  for (const total of [1, 2, 3, 5, 7, 10, 14, 30]) {
    for (let d = 1; d <= total; d++) {
      const w = dayWindow(total, d);
      assert.equal(w.length, Math.min(DAY_WINDOW_SIZE, total));
      assert.ok(w.includes(clampDay(total, d)), `Day ${d} 가 창에 있어야 한다`);
      assert.ok(w[0] >= 1 && w[w.length - 1] <= total, `${total}/${d} 범위 이탈`);
      for (let i = 1; i < w.length; i++) assert.equal(w[i], w[i - 1] + 1, "연속이어야 한다");
    }
  }
});

test("★잘못된 index 방어 — 0·음수·초과·NaN", () => {
  assert.deepEqual(dayWindow(7, 0),   [1, 2, 3]);
  assert.deepEqual(dayWindow(7, -5),  [1, 2, 3]);
  assert.deepEqual(dayWindow(7, 99),  [5, 6, 7]);
  assert.deepEqual(dayWindow(7, NaN), [1, 2, 3]);
  assert.deepEqual(dayWindow(0, 1),   []);
});

// ── Day 이동 ─────────────────────────────────────────────────────────────────
test("★Day 1 이전·마지막 Day 이후로 넘어가지 않는다 — 순환 없음", () => {
  assert.equal(stepDay(14, 1, -1), 1);
  assert.equal(stepDay(14, 14, 1), 14);
  assert.equal(stepDay(14, 7, 1), 8);
  assert.equal(stepDay(14, 7, -1), 6);
  assert.equal(canStep(14, 1, -1), false);
  assert.equal(canStep(14, 14, 1), false);
  assert.equal(canStep(14, 1, 1), true);
  assert.equal(canStep(1, 1, 1), false);
});

// ── 날짜 ─────────────────────────────────────────────────────────────────────
test("★타임존 때문에 하루 밀리지 않는다", () => {
  // UTC 자정 파싱을 쓰면 KST 뒤쪽 시간대에서 전날이 된다. 숫자로 직접 읽는다.
  assert.deepEqual(parsePlainDate("2026-10-15"), { y: 2026, m: 10, d: 15 });
  assert.deepEqual(parsePlainDate("2026-01-01T00:00:00Z"), { y: 2026, m: 1, d: 1 });
  assert.equal(parsePlainDate(""), null);
  assert.equal(parsePlainDate("not-a-date"), null);
  assert.equal(parsePlainDate("2026-13-01"), null);
});

test("★월 경계를 넘어도 정확", () => {
  assert.equal(addPlainDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addPlainDays("2026-02-27", 2), "2026-03-01");
  assert.equal(addPlainDays("2028-02-28", 1), "2028-02-29", "윤년");
});

test("★연 경계를 넘어도 정확", () => {
  assert.equal(addPlainDays("2026-12-30", 5), "2027-01-04");
  assert.equal(addPlainDays("2026-12-31", 1), "2027-01-01");
});

test("★14일 일정의 마지막 날짜가 정확", () => {
  assert.equal(addPlainDays("2026-10-15", 13), "2026-10-28");
});

test("날짜 칩 표기 — 320px 3등분에 들어가도록 짧게", () => {
  assert.equal(formatDayChipDate("2026-10-15", "en"), "Oct 15");
  assert.equal(formatDayChipDate("2026-10-15", "ko"), "10/15");
  assert.equal(formatDayChipDate("2026-10-15", "ja"), "10/15");
  assert.equal(formatDayChipDate("2026-10-15", "zh"), "10/15");
  for (const l of ["en", "ko", "ja", "zh"])
    assert.ok(formatDayChipDate("2026-12-31", l).length <= 6, l);
  assert.equal(formatDayChipDate(null, "en"), "");
});

test("전체 Day 목록 표기 — locale 별", () => {
  assert.equal(formatDayListDate("2026-10-15", "en"), "Oct 15, 2026");
  assert.equal(formatDayListDate("2026-10-15", "ko"), "2026년 10월 15일");
  assert.equal(formatDayListDate("2026-10-15", "ja"), "2026年10月15日");
  assert.equal(formatDayListDate("2026-10-15", "zh"), "2026年10月15日");
});

// ── 스와이프 ─────────────────────────────────────────────────────────────────
test("★짧은 터치는 스와이프가 아니다", () => {
  assert.equal(swipeIntent(10, 2), 0);
  assert.equal(swipeIntent(SWIPE_MIN_DISTANCE - 1, 0), 0);
});

test("★세로 스크롤이 우선 — 비스듬한 이동은 Day 를 옮기지 않는다", () => {
  assert.equal(swipeIntent(60, 60), 0, "45도");
  assert.equal(swipeIntent(60, 120), 0, "거의 수직");
  assert.equal(swipeIntent(-60, 90), 0);
});

test("★한 번의 명확한 스와이프는 한 Day만 이동", () => {
  assert.equal(swipeIntent(-120, 5), 1,  "왼쪽으로 밀면 다음 Day");
  assert.equal(swipeIntent(120, 5), -1,  "오른쪽으로 밀면 이전 Day");
  // 아무리 크게 밀어도 방향만 돌려준다 — 2일씩 건너뛰지 않는다
  assert.equal(swipeIntent(-900, 0), 1);
});

// ── 아이콘 매핑 ──────────────────────────────────────────────────────────────
test("★식당·카페는 utensils", () => {
  for (const c of ["restaurant", "Food", "cafe", "coffee shop", "seafood restaurant", "전통시장 음식"])
    assert.equal(timelineIconKind(c), "food", c);
});

test("★관광지·문화·포토스팟은 camera", () => {
  for (const c of ["attraction", "Culture", "sightseeing", "photo spot", "museum", "temple"])
    assert.equal(timelineIconKind(c), "camera", c);
});

test("나머지 category 매핑", () => {
  assert.equal(timelineIconKind("nature"), "nature");
  assert.equal(timelineIconKind("beach"), "nature");
  assert.equal(timelineIconKind("event"), "event");
  assert.equal(timelineIconKind("K-POP concert"), "event");
  assert.equal(timelineIconKind("accommodation"), "stay");
  assert.equal(timelineIconKind("hotel"), "stay");
  assert.equal(timelineIconKind("transportation"), "transit");
  assert.equal(timelineIconKind("airport"), "transit");
});

test("★분류 불명·빈 값은 지도 핀 — 없는 의미를 지어내지 않는다", () => {
  assert.equal(timelineIconKind(""), "pin");
  assert.equal(timelineIconKind(null, null), "pin");
  assert.equal(timelineIconKind("something-unknown"), "pin");
});

test("subcategory 도 함께 본다", () => {
  assert.equal(timelineIconKind("local", "seafood restaurant"), "food");
  assert.equal(timelineIconKind("spot", "photo spot"), "camera");
});
