// 방문 시각 표시 계약 (정적 검사).
//
// place.time 은 세 경로에서 온다.
//   1) 스케줄러가 배정한 start_time            (page.tsx: time: item.start_time)
//   2) 보관함 추가 시 고정 기본값 "19:30"       (addCartItemToDay)
//   3) 내 장소 추가 시 시간 입력값               (addUserSpotToDay)
// 3번조차 UserSpotsPanel 이 timeMap 을 기본값으로 미리 채우기 때문에, 저장된
// 데이터만 보고는 "사용자가 정한 시각"과 "앱이 채워 넣은 값"을 구분할 수 없다.
// provenance 필드가 없고 이번 작업에서 추가하지도 않으므로, 정확한 방문 시각은
// 어느 화면에도 표시하지 않는다.
//
// 값 자체는 지우지 않는다 — 슬롯 판정(assignSlot)과 정렬에 계속 쓴다.
// 장소의 공식 운영시간·행사 시간은 다른 경로이므로 그대로 둔다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const PLANNER = strip(read("src", "app", "itinerary", "page.tsx"));
const SHARED  = strip(read("src", "app", "shared", "page.tsx"));

// ── 표시하지 않는다 ──────────────────────────────────────────────────────────
test("★플래너 어디에서도 place.time 을 화면에 그리지 않는다", () => {
  // JSX 로 값을 출력하는 형태만 잡는다. 로직에서의 사용은 허용이다.
  for (const bad of [/>\s*\{place\.time\}/, /\{place\.time\}\s*</, /🕒 \{place\.time\}/, />\{p\.time\}</]) {
    assert.doesNotMatch(PLANNER, bad, String(bad));
  }
});

test("★공개 일정에서도 방문 시각을 표시하지 않는다 — 복사 일정도 같은 경로다", () => {
  assert.doesNotMatch(SHARED, />\{place\.time\}</);
  assert.doesNotMatch(SHARED, /\{place\.time\}\s*<\/span>/);
});

test("★장소 상세 모달의 시각 칩이 없다", () => {
  assert.doesNotMatch(PLANNER, /🕒/, "시계 칩이 남아 있다");
});

test("★편집 캔버스는 시각 대신 순서 번호를 쓴다", () => {
  // TIMELINE-B-R1: 순번은 방문 순번(visitOrdinals) — 숙소 체크인은 번호 없음, 타임라인·지도와 같은 체계
  assert.match(PLANNER, /\{editOrdinals\[pi\] \?\? ""\}<\/span>/);
});

// ── 데이터는 그대로 둔다 ─────────────────────────────────────────────────────
test("★저장된 time 값을 지우거나 바꾸지 않는다 — 정렬·슬롯 판정에 계속 쓴다", () => {
  assert.match(PLANNER, /time:\s*item\.start_time/,  "스케줄러 값 저장 유지");
  // 보관함 경로: placeTime = 미배정에서 돌아온 fixed/user 시각 ?? defaultTime — 기본값 채움은 그대로다
  assert.match(PLANNER, /const placeTime = restoredTime \?\? defaultTime;/, "보관함 경로 기본값 유지");
  assert.match(PLANNER, /time:\s*placeTime/,         "보관함 경로 유지");
  assert.match(PLANNER, /time:\s*selectedTime/,      "내 장소 경로 유지");
  assert.match(PLANNER, /function assignSlot\(/);
  assert.match(PLANNER, /assignSlot\(p\.time\)/,     "슬롯 판정에 계속 쓴다");
});

test("★저장 구조를 바꾸지 않았다 — provenance 필드를 새로 만들지 않았다", () => {
  for (const bad of [/time_source/, /timeProvenance/, /user_confirmed_time/, /is_user_time/]) {
    assert.doesNotMatch(PLANNER, bad, String(bad));
  }
});

// ── 흐름 라벨은 유지 ─────────────────────────────────────────────────────────
test("★흐름 라벨은 그대로다 — TIMELINE-B-R1: 화면은 3구간(오전·오후·저녁) 헤더, 내부 4슬롯 정의는 유지", () => {
  assert.match(PLANNER, /row\.showSectionLabel && \(/);
  assert.match(PLANNER, /tPlanner\(`slot_\$\{row\.section\}`\)/);
  assert.match(PLANNER, /const TIME_SLOTS = \[/);
});

test("★시각을 뗀 자리에 흐름 라벨을 중복해서 넣지 않았다", () => {
  const labels = PLANNER.match(/tPlanner\(`slot_\$\{row\.section\}`\)/g) ?? [];
  assert.equal(labels.length, 1, "슬롯 라벨 출력 지점은 한 곳뿐이어야 한다");
});

// ── 공식 시간 정보는 유지 ────────────────────────────────────────────────────
test("★장소의 공식 운영시간 표시를 없애지 않았다", () => {
  const EVENT = strip(read("src", "components", "EventDetailModal.tsx"));
  assert.match(EVENT, /event\.openingHours\.open/);
  assert.match(EVENT, /event\.openingHours\.close/);
});
