// 숙소를 일정에 넣되, 무엇을 남기고 무엇을 남기지 않는가.
//
// 지키는 것 세 가지.
//   ① 17~18 시는 목표지 마감이 아니다 — 그 시각 때문에 오후가 잘리지 않는다
//   ② 숙소 이름은 남고, 몇 시에 들어갔는지와 좌표·주소·링크는 남지 않는다
//   ③ 이 여행의 숙소가 아니면 쓰지 않는다
//
// 실행: node --experimental-strip-types src/lib/trip-stay/checkin-core.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ACCOMMODATION_CHECKIN_EVENT_ID, CHECKIN_DURATION_MINUTES,
  CHECKIN_TARGET_END, CHECKIN_TARGET_START,
  checkinFixedEvent, draftMatchesTrip, exactStayCoordinate, exactStayName,
  isAccommodationCheckin, planCheckin, type PlacedStop,
} from "./checkin-core.ts";
import { buildSingleStay, stayStartFor } from "./stay-core.ts";
import { buildDepartureDestination, isDepartureDestination } from "../trip-fixed/departure-destination.ts";
import { runScheduler } from "../scheduler/engine.ts";
import { estimateTravelMinutes } from "../scheduler/travel-time-estimator.ts";
import type { NearMeCandidate, SchedulerInput } from "../scheduler/types.ts";
import type { TripDraft } from "../trip-draft/trip-draft-core.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
   .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));

const CORE = strip(read("src", "lib", "trip-stay", "checkin-core.ts"));
const ITIN = strip(read("src", "app", "itinerary", "page.tsx"));

const STATION = { lat: 35.1156, lng: 129.0403 };   // 부산역
const HOTEL   = { lat: 35.1589, lng: 129.1600 };   // 해운대 숙소
const AIRPORT = { lat: 35.1795, lng: 128.9382 };   // 김해공항
const AREA    = "Haeundae (해운대)";

const TRIP = { city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27" };
const draft = (over: Partial<TripDraft> = {}): TripDraft => ({
  city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", updatedAt: 1, ...over,
});

const stop = (s: string, e: string, c: { lat: number; lng: number } | null, fixed = false): PlacedStop =>
  ({ start_time: s, end_time: e, coordinate: c, is_fixed: fixed });

// ── A. 이 여행의 숙소인가 ────────────────────────────────────────────────────

test("★★다른 여행의 draft 는 쓰지 않는다", () => {
  const d = draft({ stay: { coordinate: HOTEL } });
  assert.ok(exactStayCoordinate(d, TRIP), "같은 여행인데 못 썼다");
  for (const [label, other] of [
    ["도시",   { ...TRIP, city: "Seoul" }],
    ["시작일", { ...TRIP, startDate: "2026-11-01" }],
    ["종료일", { ...TRIP, endDate: "2026-10-28" }],
  ] as const) {
    assert.equal(exactStayCoordinate(d, other), null, `★${label}이 달라도 숙소를 썼다`);
    assert.equal(exactStayName(d, other), null, `★${label}이 다른데 이름을 합성했다`);
  }
});

test("★도시 이름의 공백·대소문자는 같은 것으로 본다", () => {
  assert.equal(draftMatchesTrip(draft(), { ...TRIP, city: " busan " }), true);
});

test("★★지도에서 확인하지 않았으면 쓰지 않는다", () => {
  // 이름·주소·링크만 있는 상태 = 아직 어디인지 모른다.
  const textOnly = draft({ stay: { name: "Signiel Busan", address: "해운대구", link: "https://naver.me/x" } });
  assert.equal(exactStayCoordinate(textOnly, TRIP), null, "★입력만으로 위치를 썼다");
  assert.equal(exactStayName(textOnly, TRIP), "Signiel Busan", "이름은 남아야 한다");
  assert.equal(exactStayCoordinate(draft(), TRIP), null);
  assert.equal(exactStayCoordinate(draft({ stay: { coordinate: { lat: 0, lng: 0 } } }), TRIP), null);
});

// ── B. 체크인 시각 — 목표지 마감이 아니다 ────────────────────────────────────

test("★★17~18 시 안에 닿을 수 있으면 그 안에서 고른다", () => {
  const stops = [
    stop("11:15", "12:15", { lat: 35.1160, lng: 129.0410 }),
    stop("14:00", "15:15", { lat: 35.1180, lng: 129.0450 }),
    stop("15:35", "16:50", { lat: 35.1200, lng: 129.0470 }),
  ];
  const plan = planCheckin(stops, HOTEL, "21:00")!;
  assert.ok(plan, "체크인을 못 찾았다");
  assert.ok(plan.startTime >= CHECKIN_TARGET_START && plan.startTime <= CHECKIN_TARGET_END,
    `목표 범위를 벗어났다: ${plan.startTime}`);
  assert.equal(plan.laterThanTarget, false);
});

test("★★일찍 들어가는 것이 자연스러우면 17 시까지 기다리지 않는다", () => {
  // 숙소 바로 옆에서 14:30 에 끝나면 15 분 뒤에 들어가면 된다.
  const stops = [stop("13:00", "14:30", { lat: 35.1592, lng: 129.1605 })];
  const plan = planCheckin(stops, HOTEL, "21:00")!;
  assert.ok(plan.startTime < CHECKIN_TARGET_START,
    `억지로 17 시까지 기다렸다: ${plan.startTime}`);
});

test("★★목표를 넘겨야만 닿으면 넘기되 사실을 남긴다", () => {
  // 공항 쪽 오후 일정 → 숙소까지 40 분. 18 시를 넘긴다.
  const stops = [stop("15:00", "18:00", AIRPORT)];
  const plan = planCheckin(stops, HOTEL, "21:00")!;
  assert.equal(plan.laterThanTarget, true, "늦은 체크인을 늦다고 하지 않았다");
  assert.ok(plan.startTime > CHECKIN_TARGET_END);
});

test("★★사용자가 정한 약속을 넘지 않는다", () => {
  // 16:00~18:30 약속이 있으면 그 앞을 침범하는 체크인은 만들지 않는다.
  const stops = [
    stop("13:00", "14:30", { lat: 35.1180, lng: 129.0450 }),
    stop("16:00", "18:30", { lat: 35.1200, lng: 129.0470 }, true),
  ];
  const plan = planCheckin(stops, HOTEL, "21:00");
  if (plan) {
    assert.ok(plan.afterIndex >= 1 || plan.endTime <= "16:00",
      `★약속 시간대를 침범했다: ${plan.startTime}-${plan.endTime}`);
  }
});

test("★하루 끝을 넘겨야 닿으면 만들지 않는다", () => {
  assert.equal(planCheckin([stop("19:00", "20:50", AIRPORT)], HOTEL, "21:00"), null);
  assert.equal(planCheckin([], HOTEL, "21:00"), null, "빈 일정에 체크인을 만들었다");
});

test("★위치를 모르는 항목은 기준으로 삼지 않는다", () => {
  assert.equal(planCheckin([stop("13:00", "14:00", null)], HOTEL, "21:00"), null);
});

test("★체류시간은 15 분이고 60 분이 아니다", () => {
  assert.equal(CHECKIN_DURATION_MINUTES, 15);
  const plan = planCheckin([stop("15:00", "16:30", { lat: 35.1592, lng: 129.1605 })], HOTEL, "21:00")!;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  assert.equal(m(plan.endTime) - m(plan.startTime), 15);
});

test("★이동시간을 실제로 반영한다", () => {
  const from = { lat: 35.1180, lng: 129.0450 };
  const plan = planCheckin([stop("13:00", "16:00", from)], HOTEL, "21:00")!;
  assert.equal(plan.travelMinutes, estimateTravelMinutes(from, HOTEL));
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  assert.equal(m(plan.startTime), m("16:00") + plan.travelMinutes, "이동시간을 빼먹었다");
});

// ── C. 엔진에 실제로 태워 본다 ───────────────────────────────────────────────

const cand = (id: string, near: { lat: number; lng: number }, dx: number, dy: number, cat = "attraction"): NearMeCandidate =>
  ({ place_id: id, category: cat as NearMeCandidate["category"],
     coordinate: { lat: near.lat + dy, lng: near.lng + dx }, zone_id: 1, score: 100 });

const POOL = [
  cand("d1", STATION, 0.004, 0.003), cand("d2", STATION, -0.005, 0.004, "restaurant"),
  cand("d3", STATION, 0.008, -0.004), cand("d4", STATION, 0.012, 0.006),
  cand("h1", HOTEL, 0.004, 0.002), cand("h2", HOTEL, -0.006, 0.003, "restaurant"),
  cand("h3", HOTEL, 0.009, -0.003),
];

function run(input: Partial<SchedulerInput> & { candidates: NearMeCandidate[] }) {
  const r = runScheduler({
    trip_date: "2026-10-24", pace: "normal", start_time: "11:00", end_time: "21:00",
    base_coordinate: STATION, ...input,
  } as SchedulerInput);
  if (!r.success) return null;
  return r.data.items;
}

test("★★체크인 후에도 저녁 일정이 이어진다", () => {
  const first = run({ candidates: POOL })!;
  const stops: PlacedStop[] = first.map(i => {
    const c = POOL.find(p => p.place_id === i.place_id);
    return stop(i.start_time, i.end_time, c?.coordinate ?? null, i.is_fixed);
  });
  const plan = planCheckin(stops, HOTEL, "21:00")!;
  const second = run({ candidates: POOL, fixed_events: [checkinFixedEvent(plan, HOTEL)] })!;

  const idx = second.findIndex(i => isAccommodationCheckin(i));
  assert.ok(idx >= 0, "체크인이 일정에 들어가지 않았다");
  const after = second.slice(idx + 1).filter(i => i.place_id);
  assert.ok(after.length >= 1, "★체크인이 하루를 끝냈다");

  // 체크인 다음 항목은 숙소에서 출발한다.
  const nextC = POOL.find(p => p.place_id === after[0]!.place_id)!;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  assert.equal(m(after[0]!.start_time), m(plan.endTime) + estimateTravelMinutes(HOTEL, nextC.coordinate),
    "★체크인 다음 일정이 숙소가 아닌 곳에서 출발했다");
});

test("★★체크인을 넣어도 장소가 줄지 않는다 (품질 계측)", () => {
  const off = run({ candidates: POOL })!;
  const stops: PlacedStop[] = off.map(i => {
    const c = POOL.find(p => p.place_id === i.place_id);
    return stop(i.start_time, i.end_time, c?.coordinate ?? null, i.is_fixed);
  });
  const plan = planCheckin(stops, HOTEL, "21:00")!;
  const on = run({ candidates: POOL, fixed_events: [checkinFixedEvent(plan, HOTEL)] })!;

  const ids = (xs: typeof off) => xs.filter(i => i.place_id).map(i => i.place_id!);
  const offIds = ids(off), onIds = ids(on);
  const afternoon = (xs: string[], src: typeof off) =>
    src.filter(i => i.place_id && i.start_time >= "12:00" && i.start_time < "17:00").length;
  const evening = (src: typeof off) =>
    src.filter(i => i.place_id && i.start_time >= "17:00").length;

  console.log(`       OFF ${offIds.length}건 [${offIds.join(",")}] 오후 ${afternoon(offIds, off)} 저녁 ${evening(off)}`);
  console.log(`       ON  ${onIds.length}건 [${onIds.join(",")}] 오후 ${afternoon(onIds, on)} 저녁 ${evening(on)}`
    + ` · 체크인 ${plan.startTime}-${plan.endTime} (이동 ${plan.travelMinutes}분)`);

  assert.ok(onIds.length >= offIds.length, `★체크인 때문에 장소가 줄었다 ${offIds.length}→${onIds.length}`);
  assert.ok(evening(on) >= 1, "저녁이 사라졌다");
});

test("★★늦게 도착해도 일정이 만들어진다", () => {
  const late = run({ candidates: POOL, start_time: "17:30", end_time: "21:00" })!;
  assert.ok(late.filter(i => i.place_id).length >= 1, "늦은 도착에서 일정이 비었다");
  const stops: PlacedStop[] = late.map(i => {
    const c = POOL.find(p => p.place_id === i.place_id);
    return stop(i.start_time, i.end_time, c?.coordinate ?? null, i.is_fixed);
  });
  const plan = planCheckin(stops, HOTEL, "21:00");
  if (plan) assert.equal(plan.laterThanTarget, true, "17:30 도착인데 목표 안에 들어갔다고 했다");
});

// ── D. Day 2 · 마지막 날 · fallback ──────────────────────────────────────────

test("★★Day 2+ 는 정확한 숙소에서 시작한다", () => {
  const stays = buildSingleStay("Busan", AREA, "2026-10-24", "2026-10-27", HOTEL);
  assert.equal(stays.length, 1);
  assert.deepEqual(stayStartFor(stays, "2026-10-25"), HOTEL, "★지역 중심을 그대로 썼다");
  assert.equal(stayStartFor(stays, "2026-10-24"), null, "★첫날부터 숙소에서 시작한다");
});

test("★정확한 숙소가 없으면 기존 stayArea 그대로다", () => {
  const area = buildSingleStay("Busan", AREA, "2026-10-24", "2026-10-27");
  assert.equal(area.length, 1);
  assert.notDeepEqual(stayStartFor(area, "2026-10-25"), null);
  // 좌표만 있고 지역을 안 골라도 성립한다.
  assert.equal(buildSingleStay("Busan", "", "2026-10-24", "2026-10-27", HOTEL).length, 1);
  // 둘 다 없으면 예전처럼 빈 배열.
  assert.equal(buildSingleStay("Busan", "", "2026-10-24", "2026-10-27").length, 0);
  assert.equal(buildSingleStay("Busan", "", "2026-10-24", "2026-10-27", { lat: 0, lng: 0 }).length, 0);
});

test("★★마지막 날은 출발지가 최종 목적지다", () => {
  const dep = buildDepartureDestination({
    coordinate: AIRPORT, departureTime: "18:00", transportType: "airport", zoneId: 1 })!;
  const items = run({ candidates: POOL, trip_date: "2026-10-27",
    start_time: "09:00", end_time: "17:00", base_coordinate: HOTEL,
    fixed_events: [dep.event] })!;
  const last = items.filter(i => i.place_id || isDepartureDestination(i)).at(-1)!;
  assert.ok(isDepartureDestination(last), "마지막이 출발지가 아니다");
  assert.ok(!items.some(isAccommodationCheckin), "★마지막 날에 체크인을 또 넣었다");
});

test("★숙박 미정이어도 일정이 만들어진다", () => {
  const items = run({ candidates: POOL })!;
  assert.ok(items.filter(i => i.place_id).length >= 3);
  assert.ok(!items.some(isAccommodationCheckin));
});

// ── E. 무엇이 남고 무엇이 남지 않는가 ────────────────────────────────────────

test("★★첫날에만, 확인된 숙소가 있을 때만 만든다", () => {
  assert.match(ITIN, /if \(i === 0 && !isLastDay && exactStay &&/,
    "체크인 생성 조건이 첫날·정확한 숙소로 좁혀져 있지 않다");
});

test("★★저장되는 일정에 시각·좌표·주소·링크가 남지 않는다", () => {
  const block = ITIN.slice(ITIN.indexOf("if (isAccommodationCheckin(item))"));
  const body  = block.slice(0, block.indexOf("return {\n          name:"));
  // 앞 항목의 시각을 쓴다 — 이미 공개된 값이라 새로 알려 주는 것이 없고,
  // 실제 체크인 시각(앞 항목 종료 + 이동 + 15 분)은 여기 없다.
  assert.match(body, /const prevTime = arr\[itemIdx - 1\]\?\.start_time/,
    "★체크인 시각 자체가 저장 일정에 들어간다");
  assert.doesNotMatch(body, /item\.start_time,|plan\.startTime|checkinTime/,
    "★계산된 체크인 시각이 저장 일정에 들어간다");
  assert.doesNotMatch(body, /lat:|lng:|address|\.link/, "★좌표·주소·링크가 저장 일정에 들어간다");
  assert.match(body, /name:\s*exactStay\?\.name/, "숙소 이름이 빠졌다 — 이름은 남겨야 한다");
  assert.match(body, /isAccommodation: true/, "숙소임을 식별할 수 없다");
});

test("★★체크인 시각은 이 기기에만 남는다", () => {
  assert.match(ITIN, /localStorage\.setItem\(`koreamate_checkin_\$\{itinId\}`/,
    "체크인 시각을 로컬에 남기지 않는다");
  // days 를 만드는 자리에서 checkinTime 을 쓰지 않는다.
  const daysBlock = ITIN.slice(ITIN.indexOf("const places: Place[] ="));
  assert.doesNotMatch(daysBlock.slice(0, 2500), /checkinTime/,
    "★저장되는 일정 조립에 체크인 시각이 섞였다");
});

test("★내부 식별자를 사용자에게 보여주지 않는다", () => {
  assert.equal(ACCOMMODATION_CHECKIN_EVENT_ID, "__accommodation_checkin__");
  const render = ITIN.slice(ITIN.indexOf("{place.isAccommodation && checkinTime"));
  assert.doesNotMatch(render.slice(0, 400), /__accommodation_checkin__|event_id/,
    "★내부 식별자가 화면에 나온다");
});

test("★★가짜 장소를 만들지 않는다", () => {
  assert.doesNotMatch(CORE, /city_spot|user_spot|place_id/,
    "★숙소로 장소 식별자를 만들었다");
  assert.doesNotMatch(CORE, /\bfetch\s*\(|geocod|naver|google/i, "외부 조회가 들어왔다");
});

test("★★21:00 을 숙소 도착 마감으로 쓰지 않는다", () => {
  assert.doesNotMatch(CORE, /21:00/, "★core 가 21:00 을 알고 있다");
  // 하루 종료 계약은 그대로다.
  assert.match(ITIN, /const end_time = isLastDay \? \(effectiveDeptTime \?\? "21:00"\) : "21:00";/);
  // 매일 숙소 복귀를 만들지 않는다 — 체크인은 i === 0 에서만 만들어진다.
  assert.equal((ITIN.match(/checkinFixedEvent\(/g) ?? []).length, 1);
});

test("★날짜별 숙박이 아니다", () => {
  assert.doesNotMatch(CORE, /perNight|nightly|Night 1|checkInDate/i);
  assert.doesNotMatch(ITIN, /perNight|nightlyHotel/i);
});

test("★2 차가 나빠지면 1 차를 쓴다", () => {
  assert.match(ITIN, /count\(second\) >= count\(dayResult\)/,
    "★2 차 결과가 나빠져도 그대로 쓴다");
  assert.match(ITIN, /catch \{\s*\n\s*checkinTime = null;/,
    "두 번째 호출이 실패하면 하루를 잃는다");
});

console.log(`\n  ${passed} passed`);
