// 출발지는 도착해야 하는 곳이지 검색 중심점이 아니다.
//
// 여기서 고정하는 것은 두 가지다.
//   ① 마감시각 계산 — departureTime − processBuffer. buffer 는 여기서 한 번만 쓴다
//   ② 그 마감시각이 실제로 지켜지는가 — 진짜 runScheduler 를 돌려서 본다
//
// ②를 별도 계산식으로 흉내내지 않는다. 엔진이 이미 하고 있는 일을 확인하는 것이
// 목적이므로, 엔진을 그대로 부른다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEPARTURE_DESTINATION_EVENT_ID,
  DEPARTURE_PROCESS_BUFFER_MINUTES,
  DEFAULT_DEPARTURE_PROCESS_BUFFER_MINUTES,
  buildDepartureDestination,
  departureProcessBufferMinutes,
  isDepartureDestination,
  requiredDestinationArrival,
} from "./departure-destination.ts";
import { runScheduler } from "../scheduler/engine.ts";
import { estimateTravelMinutes } from "../scheduler/travel-time-estimator.ts";
import type { NearMeCandidate, SchedulerInput } from "../scheduler/types.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

// 공개 지명 좌표. 실제 사용자 데이터 없음.
const HAEUNDAE = { lat: 35.1589, lng: 129.1600 };
const GIMHAE   = { lat: 35.1794, lng: 128.9383 };
const BUSAN_ST = { lat: 35.1148, lng: 129.0420 };

const HAEUNDAE_TO_GIMHAE = estimateTravelMinutes(HAEUNDAE, GIMHAE);   // 20.3km → 40분

/** 해운대 안에서 원하는 시각에 끝나도록 만든 후보 하나. */
function candidateAt(coord: { lat: number; lng: number }, score = 100): NearMeCandidate {
  return { place_id: "c1", category: "attraction", coordinate: coord, zone_id: 1, score };
}

function planWithDeparture(opts: {
  dayStart: string; dayEnd: string;
  base: { lat: number; lng: number };
  candidates: NearMeCandidate[];
  departure: { coordinate: { lat: number; lng: number }; time: string; type: string };
  anchors?: SchedulerInput["anchors"];
}) {
  const dest = buildDepartureDestination({
    coordinate:    opts.departure.coordinate,
    departureTime: opts.departure.time,
    transportType: opts.departure.type,
  });
  assert.ok(dest, "목적지가 만들어지지 않았다");
  const input: SchedulerInput = {
    trip_date: "2026-09-03",
    start_time: opts.dayStart,
    // 마감시각이 곧 자동 추천 창의 끝이다 — page.tsx 와 같은 규칙
    end_time:   dest.requiredDestinationArrival,
    base_coordinate: opts.base,
    pace: "normal",
    candidates: opts.candidates,
    anchors: opts.anchors,
    fixed_events: [dest.event],
  };
  return { dest, input, result: runScheduler(input) };
}

// ── 마감시각 계산 ─────────────────────────────────────────────────────────────

test("requiredDestinationArrival = 출발시각 − process buffer", () => {
  assert.equal(requiredDestinationArrival("17:00", 60), "16:00");
  assert.equal(requiredDestinationArrival("18:00", 30), "17:30");
  assert.equal(requiredDestinationArrival("00:20", 60), "00:00");   // 음수로 내려가지 않는다
  assert.equal(requiredDestinationArrival("bad", 60), null);
});

test("교통수단별 buffer 숫자는 예전 값 그대로다", () => {
  assert.equal(DEPARTURE_PROCESS_BUFFER_MINUTES.airport,       60);
  assert.equal(DEPARTURE_PROCESS_BUFFER_MINUTES.port,          45);
  assert.equal(DEPARTURE_PROCESS_BUFFER_MINUTES.bus_terminal,  45);
  assert.equal(DEPARTURE_PROCESS_BUFFER_MINUTES.train_station, 30);
  assert.equal(DEFAULT_DEPARTURE_PROCESS_BUFFER_MINUTES,       30);
});

test("모르는 교통수단은 기존 fallback 을 그대로 쓴다 — 새 숫자를 만들지 않는다", () => {
  assert.equal(departureProcessBufferMinutes("tourist_area"), 30);
  assert.equal(departureProcessBufferMinutes(undefined),      30);
  assert.equal(departureProcessBufferMinutes(""),             30);
  assert.equal(departureProcessBufferMinutes("airport"),      60);
});

// ── Scenario F — 좌표/시각 없음 ───────────────────────────────────────────────

test("Scenario F: 출발 좌표가 없으면 목적지를 만들지 않는다", () => {
  assert.equal(buildDepartureDestination({ coordinate: null, departureTime: "17:00", transportType: "airport" }), null);
  assert.equal(buildDepartureDestination({ coordinate: GIMHAE, departureTime: null,  transportType: "airport" }), null);
  assert.equal(buildDepartureDestination({ coordinate: GIMHAE, departureTime: "??",  transportType: "airport" }), null);
});

// ── 목적지 표현 ───────────────────────────────────────────────────────────────

test("목적지는 체류 0 이다 — 가짜 체류시간을 만들지 않는다", () => {
  const d = buildDepartureDestination({ coordinate: GIMHAE, departureTime: "17:00", transportType: "airport" })!;
  assert.equal(d.requiredDestinationArrival, "16:00");
  assert.equal(d.processBufferMinutes, 60);
  assert.equal(d.event.start_time, "16:00");
  assert.equal(d.event.end_time,   "16:00");
  assert.deepEqual(d.event.coordinate, GIMHAE);
});

test("목적지는 관광 장소가 아니다 — place_id 없이 내부 event_id 만 쓴다", () => {
  const d = buildDepartureDestination({ coordinate: GIMHAE, departureTime: "17:00", transportType: "airport" })!;
  assert.equal(d.event.event_id, DEPARTURE_DESTINATION_EVENT_ID);
  assert.equal((d.event as unknown as Record<string, unknown>).place_id, undefined);
  assert.ok(isDepartureDestination({ item_type: "event", event_id: d.event.event_id }));
  assert.ok(!isDepartureDestination({ item_type: "place", event_id: null }));
});

// ── Scenario A — 이동시간 충분 ────────────────────────────────────────────────

test("Scenario A: 14:30 종료 + 40분 이동 ≤ 16:00 → 배치된다", () => {
  const { result, input } = planWithDeparture({
    dayStart: "13:15", dayEnd: "16:00", base: HAEUNDAE,
    candidates: [candidateAt(HAEUNDAE)],
    departure: { coordinate: GIMHAE, time: "17:00", type: "airport" },
  });
  assert.ok(result.success, "실패했다");
  const place = result.data.items.find(it => it.item_type === "place");
  assert.ok(place, "장소가 배치되지 않았다");
  const endMin = Number(place.end_time.slice(0, 2)) * 60 + Number(place.end_time.slice(3));
  assert.ok(endMin + HAEUNDAE_TO_GIMHAE <= 16 * 60,
    `${place.end_time} + ${HAEUNDAE_TO_GIMHAE}분 이 16:00 을 넘는다`);
  assert.equal(input.fixed_events!.length, 1);
});

// ── Scenario B — 이동 불가 ────────────────────────────────────────────────────

test("Scenario B: 15:40 에나 끝나는 자리에는 넣지 않는다 — 목적지 시각은 그대로", () => {
  // 15:35 부터만 남은 창. 어떤 체류를 넣어도 15:40 이후에 끝나 40분을 못 뺀다.
  const { result } = planWithDeparture({
    dayStart: "15:35", dayEnd: "16:00", base: HAEUNDAE,
    candidates: [candidateAt(HAEUNDAE)],
    departure: { coordinate: GIMHAE, time: "17:00", type: "airport" },
  });
  assert.ok(result.success);
  assert.equal(result.data.items.filter(it => it.item_type === "place").length, 0,
    "도달 불가능한데 장소가 배치됐다");
  const dep = result.data.items.find(it => it.event_id === DEPARTURE_DESTINATION_EVENT_ID);
  assert.ok(dep, "목적지가 사라졌다");
  assert.equal(dep.start_time, "16:00", "목적지 시각이 움직였다");
});

// ── Scenario C — 정확한 경계 ──────────────────────────────────────────────────

test("Scenario C: 종료 + 이동 = 마감시각 정확히 같으면 허용한다", () => {
  // 해운대→김해 40분. 15:20 에 끝나면 15:20+40 = 16:00 정확히.
  // 기준점과 후보가 같은 자리라 진입 이동 8분 → 14:12 시작 = 14:20 배치, 체류 60.
  const { result } = planWithDeparture({
    dayStart: "14:12", dayEnd: "16:00", base: HAEUNDAE,
    candidates: [{ ...candidateAt(HAEUNDAE), stay_minutes_override: 60 }],
    departure: { coordinate: GIMHAE, time: "17:00", type: "airport" },
  });
  assert.ok(result.success);
  const place = result.data.items.find(it => it.item_type === "place");
  assert.ok(place, "경계값이 거부됐다 — HC 경계 의미가 바뀌었다");
  assert.equal(place.end_time, "15:20");
});

// ── Scenario D — 기차역 ───────────────────────────────────────────────────────

test("Scenario D: 기차 18:00 / buffer 30 → 마감 17:30, 이동시간도 실제로 잰다", () => {
  const d = buildDepartureDestination({ coordinate: BUSAN_ST, departureTime: "18:00", transportType: "train_station" })!;
  assert.equal(d.requiredDestinationArrival, "17:30");
  assert.equal(d.processBufferMinutes, 30);

  const travel = estimateTravelMinutes(HAEUNDAE, BUSAN_ST);   // 11.9km → 40분
  const { result } = planWithDeparture({
    dayStart: "17:05", dayEnd: "17:30", base: HAEUNDAE,
    candidates: [candidateAt(HAEUNDAE)],
    departure: { coordinate: BUSAN_ST, time: "18:00", type: "train_station" },
  });
  assert.ok(result.success);
  assert.ok(travel > 25);
  assert.equal(result.data.items.filter(it => it.item_type === "place").length, 0,
    "역까지 40분인데 17:30 마감 25분 전 자리에 장소가 들어갔다");
});

// ── Scenario E — 사용자 fixed 와 충돌 ─────────────────────────────────────────

test("Scenario E: 16:00 까지 이어지는 사용자 fixed 는 옮기지 않고 충돌로 알린다", () => {
  const fixedPlace: NearMeCandidate = {
    place_id: "user-fixed", category: "event", coordinate: HAEUNDAE, zone_id: 1, score: 999,
  };
  const dest = buildDepartureDestination({
    coordinate: GIMHAE, departureTime: "17:00", transportType: "airport",
  })!;
  const result = runScheduler({
    trip_date: "2026-09-03", start_time: "09:00", end_time: dest.requiredDestinationArrival,
    base_coordinate: HAEUNDAE, pace: "normal",
    candidates: [fixedPlace],
    anchors: [{ place_id: "user-fixed", start_time: "15:00", end_time: "16:00", is_fixed: true }],
    fixed_events: [dest.event],
  });
  assert.ok(!result.success, "16:00 종료 + 40분 이동인데 통과했다");
  assert.equal(result.error.code, "HC-9");
});

test("Scenario E: 시간이 충분하면 사용자 fixed 와 목적지가 공존한다", () => {
  const fixedPlace: NearMeCandidate = {
    place_id: "user-fixed", category: "event", coordinate: HAEUNDAE, zone_id: 1, score: 999,
  };
  const dest = buildDepartureDestination({
    coordinate: GIMHAE, departureTime: "17:00", transportType: "airport",
  })!;
  const result = runScheduler({
    trip_date: "2026-09-03", start_time: "09:00", end_time: dest.requiredDestinationArrival,
    base_coordinate: HAEUNDAE, pace: "normal",
    candidates: [fixedPlace],
    anchors: [{ place_id: "user-fixed", start_time: "14:00", end_time: "15:00", is_fixed: true }],
    fixed_events: [dest.event],
  });
  assert.ok(result.success, result.success ? "" : `${result.error.code} ${result.error.message}`);
  const anchor = result.data.items.find(it => it.place_id === "user-fixed");
  assert.equal(anchor?.start_time, "14:00", "사용자 fixed 시각이 움직였다");
});

// ── buffer 이중 차감 없음 ─────────────────────────────────────────────────────

test("buffer 는 한 번만 쓴다 — 마감시각 계산에만", () => {
  const d = buildDepartureDestination({ coordinate: GIMHAE, departureTime: "17:00", transportType: "airport" })!;
  // 하루 창의 끝 = 목적지 시각. 여기서 buffer 를 또 빼면 15:00 이 됐을 것이다.
  assert.equal(d.event.start_time, d.requiredDestinationArrival);
  assert.equal(d.requiredDestinationArrival, "16:00");

  const { input, result } = planWithDeparture({
    dayStart: "09:00", dayEnd: "16:00", base: HAEUNDAE,
    candidates: [candidateAt(HAEUNDAE)],
    departure: { coordinate: GIMHAE, time: "17:00", type: "airport" },
  });
  assert.equal(input.end_time, "16:00", "day end 에서 buffer 를 또 뺐다");
  assert.ok(result.success);
});

test("목적지 뒤에는 아무것도 배치되지 않는다", () => {
  const { result } = planWithDeparture({
    dayStart: "09:00", dayEnd: "16:00", base: HAEUNDAE,
    candidates: Array.from({ length: 6 }, (_, i) => ({
      place_id: `p${i}`, category: "attraction" as const,
      coordinate: { lat: HAEUNDAE.lat + i * 1e-3, lng: HAEUNDAE.lng },
      zone_id: 1 as const, score: 100 - i,
    })),
    departure: { coordinate: GIMHAE, time: "17:00", type: "airport" },
  });
  assert.ok(result.success);
  for (const it of result.data.items) {
    if (it.event_id === DEPARTURE_DESTINATION_EVENT_ID) continue;
    const end = Number(it.end_time.slice(0, 2)) * 60 + Number(it.end_time.slice(3));
    assert.ok(end <= 16 * 60, `${it.end_time} 은 마감 이후다`);
  }
});

// ── 배선 guard ────────────────────────────────────────────────────────────────

const pageSrc = readFileSync(path.join(process.cwd(), "src", "app", "itinerary", "page.tsx"), "utf8");

test("page.tsx: 출발 목적지를 fixed_events 로 보낸다", () => {
  assert.match(pageSrc, /fixed_events:\s*departureDestination \? \[departureDestination\.event\] : undefined/);
  assert.match(pageSrc, /buildDepartureDestination\(\{/);
});

test("page.tsx: 출발지를 검색 원점으로 쓰지 않는다", () => {
  // 원점은 두 개다 — NearMe 검색 origin(coordinate) 과 스케줄러 base(start_coordinate).
  // 둘 다 그날 기준점에서 오고, 출발지는 어느 쪽에도 들어가지 않는다.
  assert.match(pageSrc, /coordinate:\s*nearMeSearchCoordinate,/);
  assert.match(pageSrc, /start_coordinate:\s*\{ lat: dayStartCoordinate\.lat, lng: dayStartCoordinate\.lng \}/);
  // 기준점 앞에 우선순위가 붙을 수 있다(숙박 지역 등). 이 guard 가 지키는 것은
  // "그날 기준점이 currentCoordinate 사슬에서 온다" 이지 그 줄의 모양이 아니다.
  assert.match(pageSrc, /const dayStartCoordinate = .*currentCoordinate;/);
  assert.doesNotMatch(pageSrc, /nearMeSearchCoordinate\s*=\s*departureCoord/);
  assert.doesNotMatch(pageSrc, /dayStartCoordinate\s*=\s*departureCoord/);
  assert.doesNotMatch(pageSrc, /currentCoordinate\s*=\s*departureCoord/);
});

test("page.tsx: 마감시각이 그날 창의 끝이고 buffer 를 또 빼지 않는다", () => {
  assert.match(pageSrc, /const effectiveDeptTime = departureDestination\?\.requiredDestinationArrival;/);
  assert.doesNotMatch(pageSrc, /applyDepartureBuffer\(/, "예전 buffer 함수를 아직 부른다");
  assert.doesNotMatch(pageSrc, /const DEPARTURE_BUFFER_MINUTES/, "buffer 표가 두 곳에 남아 있다");
});

test("page.tsx: 내부 목적지를 일정 카드로 그리지 않는다", () => {
  assert.match(pageSrc, /\.filter\(item => !isDepartureDestination\(item\)\)/);
});

console.log(`\ndeparture-destination: ${passed} passed`);
