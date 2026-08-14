// 숙박 지역 — 다음 날 아침 어디서 출발하는가.
//
// 여기서 고정하는 것
//   ① 날짜 판정 — 전날 밤을 덮는 숙박이 그날의 시작점이다
//   ② 없으면 아무것도 바뀌지 않는다
//   ③ 하루의 끝은 만들지 않는다 (임의 통금 금지 guard)
//   ④ 진짜 runScheduler 로 fixed·출발 목적지와 함께 돌아가는지

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  STAY_AREA_TYPES, buildSingleStay, findStayArea, stayAreaOptions, stayStartFor,
  type TripStay,
} from "./stay-core.ts";
import { CITY_ARRIVAL_OPTIONS } from "../../data/city-presets.ts";
import { runScheduler } from "../scheduler/engine.ts";
import { buildDepartureDestination, DEPARTURE_DESTINATION_EVENT_ID } from "../trip-fixed/departure-destination.ts";
import { estimateTravelMinutes } from "../scheduler/travel-time-estimator.ts";
import type { NearMeCandidate } from "../scheduler/types.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const D1 = "2026-09-01", D2 = "2026-09-02", D3 = "2026-09-03";
const HAEUNDAE_VALUE = "Haeundae (해운대)";
const NAMPO_VALUE    = "Nampo-dong / Gwangbok-ro (남포동)";

// ── 지역 후보 ─────────────────────────────────────────────────────────────────

test("숙박 후보는 downtown / tourist_area 만이다 — 공항·역은 자는 곳이 아니다", () => {
  for (const city of Object.keys(CITY_ARRIVAL_OPTIONS)) {
    const opts = stayAreaOptions(city);
    assert.ok(opts.length > 0, `${city} 에 숙박 후보가 없다`);
    for (const o of opts) {
      assert.ok((STAY_AREA_TYPES as readonly string[]).includes(o.type),
        `${city} 의 ${o.value} 는 ${o.type} 이다`);
    }
    for (const o of CITY_ARRIVAL_OPTIONS[city]!) {
      if (["airport", "train_station", "bus_terminal", "port"].includes(o.type)) {
        assert.ok(!opts.some(s => s.value === o.value), `${o.value} 가 숙박 후보에 들어갔다`);
      }
    }
  }
});

test("지원 도시 전부 최소 하나의 숙박 후보를 가진다 — 도시명 분기 없이", () => {
  const counts = Object.keys(CITY_ARRIVAL_OPTIONS)
    .map(c => [c, stayAreaOptions(c).length] as const);
  assert.ok(counts.length >= 4, "도시가 줄었다");
  for (const [c, n] of counts) assert.ok(n >= 1, `${c} 숙박 후보 0`);
});

test("모르는 도시·모르는 값이면 null 이다", () => {
  assert.deepEqual(stayAreaOptions("Atlantis"), []);
  assert.equal(findStayArea("Busan", "Gimhae International Airport (김해공항)"), null,
    "공항이 숙박 지역으로 통과했다");
  assert.equal(findStayArea("Busan", ""), null);
  assert.equal(findStayArea("Busan", null), null);
  assert.ok(findStayArea("Busan", HAEUNDAE_VALUE));
});

// ── 날짜 → 시작점 (§22 B·C) ───────────────────────────────────────────────────

test("B: 2박3일 한 숙소 — Day1 은 그대로, Day2·Day3 은 숙소에서 시작", () => {
  const stays = buildSingleStay("Busan", HAEUNDAE_VALUE, D1, D3);
  assert.equal(stays.length, 1);
  assert.equal(stays[0]!.checkInDate,  D1);
  assert.equal(stays[0]!.checkOutDate, D3);

  assert.equal(stayStartFor(stays, D1), null, "Day1 이 숙소로 바뀌었다");
  const area = findStayArea("Busan", HAEUNDAE_VALUE)!;
  assert.deepEqual(stayStartFor(stays, D2), { lat: area.lat, lng: area.lng });
  assert.deepEqual(stayStartFor(stays, D3), { lat: area.lat, lng: area.lng });
  assert.equal(stayStartFor(stays, "2026-09-04"), null, "체크아웃 다음 날까지 이어졌다");
});

test("C: 전날 마지막 장소가 어디든 다음 날은 숙소에서 시작한다", () => {
  const stays = buildSingleStay("Busan", HAEUNDAE_VALUE, D1, D3);
  const area  = findStayArea("Busan", HAEUNDAE_VALUE)!;
  // page.tsx 의 결정식과 같은 모양
  const previousDayLastPlace = { lat: 35.0975, lng: 129.0306 };   // 남포
  const dayStart = stayStartFor(stays, D2) ?? previousDayLastPlace;
  assert.deepEqual(dayStart, { lat: area.lat, lng: area.lng });
});

test("A: 숙박을 고르지 않으면 아무것도 바뀌지 않는다", () => {
  assert.deepEqual(buildSingleStay("Busan", "", D1, D3), []);
  assert.deepEqual(buildSingleStay("Busan", null, D1, D3), []);
  const previousDayLastPlace = { lat: 35.0975, lng: 129.0306 };
  assert.deepEqual(stayStartFor([], D2) ?? previousDayLastPlace, previousDayLastPlace);
  assert.deepEqual(stayStartFor(null, D2) ?? previousDayLastPlace, previousDayLastPlace);
});

test("D: 여러 숙소도 helper 수준에서 해석된다 — UI 는 만들지 않았다", () => {
  const a = findStayArea("Busan", HAEUNDAE_VALUE)!;
  const b = findStayArea("Busan", NAMPO_VALUE)!;
  const stays: TripStay[] = [
    { coordinate: { lat: a.lat, lng: a.lng }, checkInDate: D1, checkOutDate: D2 },
    { coordinate: { lat: b.lat, lng: b.lng }, checkInDate: D2, checkOutDate: D3 },
  ];
  assert.equal(stayStartFor(stays, D1), null);
  assert.deepEqual(stayStartFor(stays, D2), { lat: a.lat, lng: a.lng });
  assert.deepEqual(stayStartFor(stays, D3), { lat: b.lat, lng: b.lng });
});

test("E: 깨진 항목은 조용히 건너뛰고 기존 fallback 으로 돌아간다", () => {
  const bad: TripStay[] = [
    { coordinate: { lat: NaN, lng: 129 },    checkInDate: D1,     checkOutDate: D3 },
    { coordinate: { lat: 35, lng: 129 },     checkInDate: "nope", checkOutDate: D3 },
    { coordinate: { lat: 35, lng: 129 },     checkInDate: D3,     checkOutDate: D1 },  // 역순
  ];
  assert.equal(stayStartFor(bad, D2), null);
  assert.deepEqual(buildSingleStay("Busan", HAEUNDAE_VALUE, "nope", D3), []);
  assert.deepEqual(buildSingleStay("Busan", HAEUNDAE_VALUE, D3, D1), []);
  assert.equal(stayStartFor(buildSingleStay("Busan", HAEUNDAE_VALUE, D1, D3), "nope"), null);
});

// ── 엔진과 함께 (§22 F·G·H) ───────────────────────────────────────────────────

const HAEUNDAE = { lat: 35.1589, lng: 129.1600 };
const YEONGDO  = { lat: 35.0748, lng: 129.0862 };
const GIMHAE   = { lat: 35.1794, lng: 128.9383 };
const GAMCHEON = { lat: 35.0975, lng: 129.0106 };

const near = (c: { lat: number; lng: number }, i: number, score = 100): NearMeCandidate => ({
  place_id: `n${i}`, category: "attraction", zone_id: 1, score,
  coordinate: { lat: c.lat + i * 1e-3, lng: c.lng },
});

test("F: 마지막 날 숙소에서 시작해도 출발 목적지 계약이 그대로다", () => {
  const dest = buildDepartureDestination({
    coordinate: GIMHAE, departureTime: "17:00", transportType: "airport",
  })!;
  assert.equal(dest.requiredDestinationArrival, "16:00");

  const r = runScheduler({
    trip_date: D3, start_time: "09:00", end_time: dest.requiredDestinationArrival,
    base_coordinate: HAEUNDAE, pace: "normal",           // ← 숙소에서 시작
    candidates: [near(HAEUNDAE, 1), near(HAEUNDAE, 2), near(HAEUNDAE, 3)],
    fixed_events: [dest.event],
  });
  assert.ok(r.success);
  const places = r.data.items.filter(it => it.item_type === "place");
  assert.ok(places.length > 0, "숙소 시작이 하루를 비웠다");
  const last = places.at(-1)!;
  const endMin = Number(last.end_time.slice(0, 2)) * 60 + Number(last.end_time.slice(3));
  assert.ok(endMin + estimateTravelMinutes(HAEUNDAE, GIMHAE) <= 16 * 60,
    "공항 도달 검증이 깨졌다");
  assert.ok(r.data.items.some(it => it.event_id === DEPARTURE_DESTINATION_EVENT_ID));
});

test("G: 숙소 시작이 고정 약속 시각을 건드리지 않는다", () => {
  const fixedPlace: NearMeCandidate = {
    place_id: "appointment", category: "event", coordinate: YEONGDO, zone_id: 3, score: 999,
  };
  const r = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: HAEUNDAE, pace: "normal",
    candidates: [fixedPlace, near(HAEUNDAE, 1), near(HAEUNDAE, 2)],
    anchors: [{ place_id: "appointment", start_time: "14:00", end_time: "16:00", is_fixed: true }],
  });
  assert.ok(r.success, r.success ? "" : `${r.error.code}`);
  const a = r.data.items.find(it => it.place_id === "appointment");
  assert.equal(a?.start_time, "14:00");
  assert.equal(a?.end_time,   "16:00");
});

test("H: 숙소는 가두지 않는다 — 먼 This Trip 은 그대로 배치된다", () => {
  const pick: NearMeCandidate = {
    place_id: "PICK-far", category: "attraction", coordinate: GAMCHEON, zone_id: 3, score: 999,
  };
  const r = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: HAEUNDAE, pace: "normal",
    candidates: [pick, near(HAEUNDAE, 1), near(HAEUNDAE, 2)],
    preferred_items: [{ place_id: "PICK-far" }],
  });
  assert.ok(r.success);
  const placed = r.data.items.find(it => it.place_id === "PICK-far");
  assert.ok(placed, `해운대에서 ${estimateTravelMinutes(HAEUNDAE, GAMCHEON)}분 거리의 This Trip 이 밀려났다`);
});

// ── 배선 + 금지 guard (§22 I·J) ───────────────────────────────────────────────

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const pageSrc = read("src", "app", "itinerary", "page.tsx");
const homeSrc = read("src", "app", "HomeClient.tsx");
const coreSrc = read("src", "lib", "trip-stay", "stay-core.ts");

test("page.tsx: 그날 시작점이 숙소 → 기존 fallback 순서다", () => {
  assert.match(pageSrc, /const dayStartCoordinate = stayStartFor\(stays, trip_date\) \?\? currentCoordinate;/);
  assert.match(pageSrc, /let currentCoordinate = arrivalCoord \?\? fallbackCoord;/, "기존 fallback 이 사라졌다");
});

test("page.tsx: URL 에 숙소 좌표를 직렬화하지 않는다 — 프리셋 value 만 읽는다", () => {
  assert.match(pageSrc, /searchParams\.get\("stayArea"\)/);
  assert.doesNotMatch(pageSrc, /searchParams\.get\("stayLat"\)/);
  assert.doesNotMatch(pageSrc, /searchParams\.get\("stayLng"\)/);
  assert.match(homeSrc, /params\.set\("stayArea",\s*stayArea\)/);
  assert.doesNotMatch(homeSrc, /params\.set\("stayLat"/);
});

test("I: 숙소 좌표가 외부 AI 요청에 들어가지 않는다", () => {
  const aiCore = read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts");
  const client = read("src", "lib", "planner", "personalize-client.ts");
  for (const [name, src] of [["ai-core", aiCore], ["personalize-client", client]] as const) {
    assert.doesNotMatch(src, /\bstay\w*(Lat|Lng|Coordinate)\b/i, `${name} 에 숙소 좌표가 있다`);
    assert.doesNotMatch(src, /stayStartFor|TripStay|stayAreaOptions/, `${name} 이 숙소 계약을 안다`);
  }
  // 프로필 요청 본문에 좌표 필드 자체가 없다는 기존 계약도 함께 지킨다
  assert.doesNotMatch(aiCore, /^\s*(lat|lng)\??:/m, "AI 요청 타입에 좌표 필드가 생겼다");
});

test("J: 숙소로 하루의 끝이나 통금을 만들지 않는다", () => {
  // stay 가 fixed event / anchor 로 변환되는 코드가 없어야 한다
  assert.doesNotMatch(coreSrc, /fixed_events|FixedEventItem|event_id/,
    "stay-core 가 fixed event 를 만든다");
  assert.doesNotMatch(coreSrc, /end_time|start_time|deadline|returnBy|requiredBy/,
    "stay-core 가 시각을 만든다");
  // page.tsx 의 fixed_events 는 출발 목적지 하나뿐이다
  assert.match(pageSrc, /fixed_events:\s*departureDestination \? \[departureDestination\.event\] : undefined/);
  assert.doesNotMatch(pageSrc, /stay\w*\s*\.\s*event\b/i);
});

test("도시명·지역명 하드코딩 없이 type 으로만 거른다", () => {
  assert.match(coreSrc, /STAY_AREA_TYPES/);
  for (const word of ["Busan", "Seoul", "Jeju", "Gyeongju", "Haeundae", "Nampo", "Seomyeon"]) {
    assert.ok(!coreSrc.includes(word), `stay-core 에 ${word} 가 하드코딩됐다`);
  }
});

console.log(`\nstay-core: ${passed} passed`);
