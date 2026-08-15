// 여행 날짜가 This Trip 까지 도달하는가, 그리고 거기서 넣은 약속이 스케줄러의
// hard 규칙까지 살아서 가는가.
//
// 이 두 가지가 이번 작업의 전부다. 그래서 계약만 확인하지 않고 실제
// planDayAnchors 와 runScheduler 를 태워 끝을 본다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MAX_TRIP_DAYS, TRIP_DRAFT_KEY,
  clearTripDraft, isUsableTripDraft, readTripDraft, tripDayCount, tripDraftDates, writeTripDraft,
  type TripDraft,
} from "./trip-draft-core.ts";
import { planDayAnchors, mergeDayHints } from "../trip-fixed/anchor-build.ts";
import { runScheduler } from "../scheduler/engine.ts";
import { estimateTravelMinutes } from "../scheduler/travel-time-estimator.ts";
import type { NearMeCandidate } from "../scheduler/types.ts";
import type { CartFixed } from "../cart.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

// ── localStorage 대역 — 브라우저 없이 read/write 를 그대로 검사한다 ───────────
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem:    (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};

const D1 = "2026-10-24", D2 = "2026-10-25", D3 = "2026-10-26";

// ── A. 정상 read / write ──────────────────────────────────────────────────────

test("A: 도시와 날짜를 쓰고 그대로 읽는다", () => {
  store.clear();
  const w = writeTripDraft({ city: "Busan", startDate: D1, endDate: D3, now: 1 });
  assert.deepEqual(w, { city: "Busan", startDate: D1, endDate: D3, updatedAt: 1 });
  assert.deepEqual(readTripDraft(), w);
  assert.ok(store.has(TRIP_DRAFT_KEY));
});

test("A: clear 하면 없는 상태로 돌아간다", () => {
  store.clear();
  writeTripDraft({ city: "Busan", startDate: D1, endDate: D3 });
  clearTripDraft();
  assert.equal(readTripDraft(), null);
});

// ── B. 깨진 draft — 전부 안전 fallback ────────────────────────────────────────

test("B: 깨진 JSON 은 null 이다 — 화면이 죽지 않는다", () => {
  store.clear();
  store.set(TRIP_DRAFT_KEY, "{ this is not json");
  assert.equal(readTripDraft(), null);
  assert.deepEqual(tripDraftDates(readTripDraft()), []);
});

test("B: 빠진 필드·잘못된 날짜는 저장도 읽기도 되지 않는다", () => {
  const bad: Array<Record<string, unknown>> = [
    { startDate: D1, endDate: D3 },                          // city 없음
    { city: "Busan", endDate: D3 },                          // startDate 없음
    { city: "Busan", startDate: D1 },                        // endDate 없음
    { city: "Busan", startDate: "24/10/2026", endDate: D3 }, // ISO 아님
    { city: "Busan", startDate: "2026-02-31", endDate: D3 }, // 없는 날짜
    { city: "Busan", startDate: D3, endDate: D1 },           // 종료가 시작보다 앞
    { city: "   ",   startDate: D1, endDate: D3 },           // 빈 도시
  ];
  for (const b of bad) {
    assert.ok(!isUsableTripDraft(b), `${JSON.stringify(b)} 가 통과했다`);
    store.clear();
    store.set(TRIP_DRAFT_KEY, JSON.stringify(b));
    assert.equal(readTripDraft(), null, `${JSON.stringify(b)} 를 읽어 버렸다`);
    assert.equal(
      writeTripDraft(b as unknown as { city: string; startDate: string; endDate: string }),
      null, `${JSON.stringify(b)} 를 저장해 버렸다`);
  }
});

test("B: 말이 안 되게 긴 구간은 여행이 아니라 깨진 값으로 본다", () => {
  assert.equal(tripDayCount("2026-01-01", "2126-01-01"), null);
  assert.equal(tripDayCount(D1, D1), 1);
  const last = new Date(Date.UTC(2026, 0, 1) + (MAX_TRIP_DAYS - 1) * 86_400_000)
    .toISOString().slice(0, 10);
  assert.equal(tripDayCount("2026-01-01", last), MAX_TRIP_DAYS);
});

// ── C. 날짜 구간 ──────────────────────────────────────────────────────────────

test("C: 2박3일은 3일이다", () => {
  assert.equal(tripDayCount(D1, D3), 3);
  assert.deepEqual(tripDraftDates({ city: "Busan", startDate: D1, endDate: D3, updatedAt: 0 }),
    [D1, D2, D3]);
});

test("C: 달을 넘어가도 맞는다", () => {
  assert.deepEqual(
    tripDraftDates({ city: "Busan", startDate: "2026-10-30", endDate: "2026-11-01", updatedAt: 0 }),
    ["2026-10-30", "2026-10-31", "2026-11-01"]);
});

// ── D / E. This Trip 이 보는 날짜 ─────────────────────────────────────────────

test("D: draft 가 있으면 This Trip 이 실제 날짜를 본다", () => {
  store.clear();
  writeTripDraft({ city: "Busan", startDate: D1, endDate: D3 });
  assert.deepEqual(tripDraftDates(readTripDraft()), [D1, D2, D3]);
});

test("E: draft 가 없으면 빈 배열이다 — 가짜 여행을 만들지 않는다", () => {
  store.clear();
  assert.equal(readTripDraft(), null);
  assert.deepEqual(tripDraftDates(readTripDraft()), []);
  assert.deepEqual(tripDraftDates(null), []);
  assert.deepEqual(tripDraftDates(undefined), []);
});

// ── F ~ I. 넣은 약속이 스케줄러 hard 규칙까지 살아 가는가 ─────────────────────

const YEONGDO  = { lat: 35.0748, lng: 129.0862 };
const HAEUNDAE = { lat: 35.1589, lng: 129.1600 };

/** This Trip 항목 하나 — 화면이 저장하는 모양 그대로 */
function hint(placeId: string, coord: { lat: number; lng: number }, fixed: CartFixed | null) {
  return { place_id: placeId, lat: coord.lat, lng: coord.lng, fixed };
}

test("F: D2 14:00-16:00 을 넣으면 그 날짜의 anchor 로 나온다", () => {
  const days = tripDraftDates({ city: "Busan", startDate: D1, endDate: D3, updatedAt: 0 });
  assert.ok(days.includes(D2), "Date 선택지에 D2 가 없다");

  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  const hints = [hint("yeongdo", YEONGDO, fixed), hint("haeundae", HAEUNDAE, null)];

  const plan = planDayAnchors(hints, D2, null, null);
  assert.equal(plan.anchors.length, 1);
  assert.deepEqual(plan.anchors[0], {
    place_id: "yeongdo", start_time: "14:00", end_time: "16:00", is_fixed: true,
  });
  assert.equal(plan.outOfBoundary.length, 0);
  assert.ok(plan.keep.some(h => h.place_id === "yeongdo"), "좌표 해석용 hint 가 빠졌다");
});

test("F: 다른 날에는 그 약속이 anchor 가 되지 않고 후보에서도 빠진다", () => {
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  const hints = [hint("yeongdo", YEONGDO, fixed)];

  const d1 = planDayAnchors(hints, D1, null, null);
  assert.equal(d1.anchors.length, 0);
  assert.equal(d1.drop.length, 1, "다른 날 고정이 오늘 후보로 남았다");
  assert.deepEqual(mergeDayHints(hints, d1), [], "오늘 후보에 섞였다");
});

test("J: 날짜를 지정하지 않은 This Trip 장소는 hard anchor 가 아니다", () => {
  const hints = [hint("haeundae", HAEUNDAE, null)];
  const plan = planDayAnchors(hints, D2, null, null);
  assert.equal(plan.anchors.length, 0, "일반 장소가 anchor 가 됐다");
  assert.equal(plan.drop.length, 0);
  assert.deepEqual(mergeDayHints(hints, plan).map(h => h.place_id), ["haeundae"],
    "일반 장소가 후보에서 사라졌다");
});

test("H: anchor 가 스케줄러에서 지정한 시각 그대로 배치된다", () => {
  const cands: NearMeCandidate[] = [
    { place_id: "yeongdo",  category: "event",      coordinate: YEONGDO,  zone_id: 3, score: 999 },
    { place_id: "haeundae", category: "attraction", coordinate: HAEUNDAE, zone_id: 1, score: 100 },
  ];
  const r = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: HAEUNDAE, pace: "normal", candidates: cands,
    anchors: [{ place_id: "yeongdo", start_time: "14:00", end_time: "16:00", is_fixed: true }],
  });
  assert.ok(r.success, r.success ? "" : `${r.error.code} ${r.error.message}`);
  const a = r.data.items.find(it => it.place_id === "yeongdo");
  assert.equal(a?.start_time, "14:00");
  assert.equal(a?.end_time,   "16:00");
  assert.equal(a?.is_fixed,   true);
});

test("I: HC-8 — 약속에 늦게 하는 자리에는 아무것도 넣지 않는다", () => {
  const travel = estimateTravelMinutes(HAEUNDAE, YEONGDO);
  assert.ok(travel >= 30, `해운대→영도 추정이 ${travel}분이라 시나리오가 성립하지 않는다`);

  const cands: NearMeCandidate[] = [
    { place_id: "yeongdo",  category: "event",      coordinate: YEONGDO,  zone_id: 3, score: 999 },
    { place_id: "haeundae", category: "attraction", coordinate: HAEUNDAE, zone_id: 1, score: 500 },
  ];
  // 13:40 부터만 남은 창. 해운대에 들르면 영도 14:00 에 절대 닿지 못한다.
  const r = runScheduler({
    trip_date: D2, start_time: "13:40", end_time: "21:00",
    base_coordinate: HAEUNDAE, pace: "normal", candidates: cands,
    anchors: [{ place_id: "yeongdo", start_time: "14:00", end_time: "16:00", is_fixed: true }],
  });
  assert.ok(r.success);
  const before = r.data.items.filter(it => it.place_id === "haeundae" && it.start_time < "14:00");
  assert.equal(before.length, 0, "약속 앞에 도달 불가능한 장소가 들어갔다");
});

test("I: HC-9 — 서로 갈 수 없는 두 약속은 충돌로 알린다", () => {
  const cands: NearMeCandidate[] = [
    { place_id: "haeundae", category: "event", coordinate: HAEUNDAE, zone_id: 1, score: 999 },
    { place_id: "yeongdo",  category: "event", coordinate: YEONGDO,  zone_id: 3, score: 999 },
  ];
  const r = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: HAEUNDAE, pace: "normal", candidates: cands,
    anchors: [
      { place_id: "haeundae", start_time: "13:00", end_time: "13:50", is_fixed: true },
      { place_id: "yeongdo",  start_time: "14:00", end_time: "16:00", is_fixed: true },
    ],
  });
  assert.ok(!r.success, "50km/40분 거리를 10분에 이동하는 일정이 통과했다");
  assert.equal(r.error.code, "HC-9");
});

// ── 배선 guard ────────────────────────────────────────────────────────────────

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const homeSrc  = read("src", "app", "HomeClient.tsx");
const picksSrc = read("src", "app", "picks", "PicksClient.tsx");

test("HomeClient: 여행 조건이 실제로 바뀔 때만 draft 를 쓴다", () => {
  // 도시·날짜만 저장하던 자리다. 이제 동행·도착·출발·숙박까지 같은 곳에 남긴다 —
  // 그 여섯 개는 Home 컴포넌트 안에만 있어서 화면을 떠나면 사라졌다.
  assert.match(homeSrc, /writeTripDraft\(\{\s*\n\s*city, startDate, endDate,/);
  assert.match(homeSrc, /\}, \[restored, city, startDate, endDate,/, "의존성 배열이 없다 — 매 렌더 저장 위험");
});

test("PicksClient: 죽은 PlannerSnapshot 대신 TripDraft 를 읽는다", () => {
  // 변수 이름이 draft → d 로 바뀌었다(같은 파일에 draft state 가 생겼다).
  // 보는 것은 이름이 아니라 "TripDraft 의 날짜를 쓴다" 는 사실이다.
  assert.match(picksSrc, /setTripDays\(tripDraftDates\(\w+\)\)/);
  assert.doesNotMatch(picksSrc, /getPlannerMeta/, "죽은 스냅샷을 아직 읽는다");
  assert.doesNotMatch(picksSrc, /plannerStore/, "죽은 모듈 import 가 남았다");
});

test("PicksClient: tripDays 가 기존 고정 일정 입력에 그대로 전달된다", () => {
  assert.match(picksSrc, /<FixedScheduleFields/);
  assert.match(picksSrc, /tripDays=\{tripDays\}/);
  assert.match(picksSrc, /onChange=\{\(next: CartFixed \| null\) => setCartFixed\(key, next, tripCity \?\? undefined\)\}/);
});

test("TripDraft 는 쓰는 곳이 있는 값만 가진다", () => {
  // 예전에는 도시와 날짜뿐이었다. 그때 이 가드가 막던 것은 "쓸 곳이 없는 필드를
  // 미리 만들어 두는 것" 이었다. 지금은 아래 아홉 개 모두 Home 이 쓰고 This Trip
  // 이 읽는다 — 그래서 막는 대상만 바꾼다. 아직 소비처가 없는 값들이다.
  const core = read("src", "lib", "trip-draft", "trip-draft-core.ts");
  const iface = /export interface TripDraft \{([\s\S]*?)\n\}/.exec(core)?.[1] ?? "";
  for (const field of ["intensity", "pace", "travelStyle", "budget"]) {
    assert.ok(!iface.includes(field), `${field} 가 미리 들어갔다`);
  }
  for (const field of ["city", "startDate", "endDate", "travelers", "startLocation",
                       "arrivalTime", "departurePlace", "departureTime", "stayArea"]) {
    assert.ok(iface.includes(field), `${field} 가 빠졌다`);
  }
});

test("TripDraft 와 PlannerSnapshot 을 서로 동기화하지 않는다", () => {
  // 왜 새로 만들었는지는 주석에 적혀 있어도 된다. 막는 것은 코드 수준의 연결이다.
  const core = read("src", "lib", "trip-draft", "trip-draft-core.ts");
  assert.doesNotMatch(core, /from ".*plannerStore/, "죽은 모듈을 import 한다");
  assert.doesNotMatch(core, /(read|write|clear)PlannerSnapshot|getPlannerMeta/, "스냅샷을 읽거나 쓴다");
  assert.doesNotMatch(core, /localStorage\.\w+\(\s*["']koreamate_planner_v1/, "스냅샷 키를 직접 만진다");
  assert.doesNotMatch(homeSrc, /writePlannerSnapshot/);
});

console.log(`\ntrip-draft-core: ${passed} passed`);
