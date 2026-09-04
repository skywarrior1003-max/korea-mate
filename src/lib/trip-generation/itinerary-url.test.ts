// 일정 생성 주소를 만드는 곳이 하나인가, 그리고 This Trip 이 Home 을 거치지
// 않고 바로 들어가는가.
//
// 주소에 무엇을 **넣지 않았는지** 도 같이 고정한다. 장소·좌표·개인 제목이
// 주소에 실리면 브라우저 기록과 공유 링크에 그대로 남는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildItineraryGenerationUrl, canBuildItineraryUrl, itineraryDayCount,
} from "./itinerary-url.ts";
import { CITY_ARRIVAL_OPTIONS } from "../../data/city-presets.ts";
import { planDayAnchors, mergeDayHints } from "../trip-fixed/anchor-build.ts";
import { runScheduler } from "../scheduler/engine.ts";
import { tripDraftDates } from "../trip-draft/trip-draft-core.ts";
import { isValidCoordinate } from "../geo.ts";
import type { NearMeCandidate } from "../scheduler/types.ts";
import type { CartFixed } from "../cart.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
// 플래너 코드는 PLANNER-SPOTS-SEPARATION-V1 에서 /planner 로 이사했다 — 검사 대상은 동일 코드다.
const homeSrc  = read("src", "app", "planner", "PlannerClient.tsx");
const picksSrc = read("src", "app", "picks", "PicksClient.tsx");

const D1 = "2026-10-24", D2 = "2026-10-25", D3 = "2026-10-26";
const BUSAN_STN = "KTX Busan Station (부산역)";
const GIMHAE    = "Gimhae International Airport (김해공항)";
const HAEUNDAE  = "Haeundae (해운대)";

const q = (url: string) => new URLSearchParams(url.slice(url.indexOf("?") + 1));

// ── 1. Home 기존 동작과 의미가 같은가 ─────────────────────────────────────────

/** refactor 이전 doNavigate 가 만들던 주소 — 비교 기준으로만 쓴다. */
function legacyHomeUrl(o: {
  city: string; startDate: string; endDate: string; travelers: string;
  travelStyle: string; startLocation: string; arrivalTime: string;
  departurePlace?: string; departureTime?: string; stayArea?: string;
}): string {
  const cityOptions = CITY_ARRIVAL_OPTIONS[o.city] ?? [];
  const params = new URLSearchParams({
    city: o.city, startDate: o.startDate, endDate: o.endDate,
    travelers: o.travelers, travelStyle: o.travelStyle,
    startLocation: o.startLocation, arrivalTime: o.arrivalTime,
  });
  if (o.departurePlace) params.set("departurePlace", o.departurePlace);
  if (o.departureTime)  params.set("departureTime",  o.departureTime);
  if (o.stayArea)       params.set("stayArea",       o.stayArea);
  const a = cityOptions.find(x => x.value === o.startLocation);
  const d = cityOptions.find(x => x.value === o.departurePlace);
  if (a) { params.set("arrivalLat", String(a.lat)); params.set("arrivalLng", String(a.lng)); params.set("arrivalType", a.type); }
  if (d) { params.set("departureLat", String(d.lat)); params.set("departureLng", String(d.lng)); params.set("departureType", d.type); }
  return `/itinerary?${params.toString()}`;
}

const HOME_FIXTURES = [
  { name: "최소 Home 입력", ctx: {
      city: "Busan", startDate: D1, endDate: D3, travelers: "1",
      travelStyle: "Solo", startLocation: BUSAN_STN, arrivalTime: "14:00" } },
  { name: "출발지까지 지정", ctx: {
      city: "Busan", startDate: D1, endDate: D3, travelers: "2",
      travelStyle: "Couple", startLocation: BUSAN_STN, arrivalTime: "15:30",
      departurePlace: GIMHAE, departureTime: "17:00" } },
  { name: "숙박 지역까지 지정", ctx: {
      city: "Busan", startDate: D1, endDate: D3, travelers: "3",
      travelStyle: "Family", startLocation: BUSAN_STN, arrivalTime: "09:00",
      departurePlace: GIMHAE, departureTime: "18:00", stayArea: HAEUNDAE } },
  { name: "서울", ctx: {
      city: "Seoul", startDate: D1, endDate: D2, travelers: "1",
      travelStyle: "Solo", startLocation: "Seoul Station (서울역)", arrivalTime: "12:00" } },
];

test("1: Home 고정 입력에서 공용 builder 가 예전과 같은 주소를 만든다", () => {
  for (const f of HOME_FIXTURES) {
    const got = buildItineraryGenerationUrl(f.ctx)!;
    const want = legacyHomeUrl(f.ctx);
    assert.ok(got, `${f.name}: null 이 나왔다`);
    // 키 집합과 값이 모두 같아야 한다(순서는 의미가 아니다)
    const [g, w] = [q(got), q(want)];
    assert.deepEqual([...g.keys()].sort(), [...w.keys()].sort(), f.name);
    for (const k of w.keys()) assert.equal(g.get(k), w.get(k), `${f.name}: ${k}`);
  }
});

test("1: 값이 빈 optional 은 빼도 의미가 같다 — 일정 화면이 같은 기본값을 쓴다", () => {
  // travelStyle 을 고르지 않은 사용자. 예전에는 `travelStyle=` 이 붙었다.
  const url = buildItineraryGenerationUrl({
    city: "Busan", startDate: D1, endDate: D3, travelers: "1",
    travelStyle: "", startLocation: BUSAN_STN, arrivalTime: "14:00",
  })!;
  assert.equal(q(url).get("travelStyle"), null, "빈 값을 그대로 실었다");
  // 일정 화면의 읽기 규칙과 같은 결과인지
  assert.equal(q(url).get("travelStyle") || "Solo", "Solo");
  assert.equal(new URLSearchParams("travelStyle=").get("travelStyle") || "Solo", "Solo");
});

test("도시 프리셋에 없는 도착지는 좌표를 만들어 내지 않는다", () => {
  const url = buildItineraryGenerationUrl({
    city: "Busan", startDate: D1, endDate: D3, startLocation: "어딘가 모르는 곳",
  })!;
  assert.equal(q(url).get("startLocation"), "어딘가 모르는 곳");
  assert.equal(q(url).get("arrivalLat"), null);
  assert.equal(q(url).get("arrivalType"), null);
});

// ── 4 · 5 · 6 · 13. 조건 부족 ────────────────────────────────────────────────

test("4·5: 도시·날짜가 없거나 잘못되면 주소를 만들지 않는다", () => {
  const bad = [
    {},
    { city: "Busan" },
    { city: "Busan", startDate: D1 },
    { city: "",      startDate: D1, endDate: D3 },
    { city: "Busan", startDate: "24/10/2026", endDate: D3 },
    { city: "Busan", startDate: D3, endDate: D1 },
  ];
  for (const b of bad) {
    assert.equal(canBuildItineraryUrl(b), false, JSON.stringify(b));
    assert.equal(buildItineraryGenerationUrl(b as never), null, JSON.stringify(b));
  }
  assert.equal(canBuildItineraryUrl(null), false);
});

test("6: 없는 값을 임의로 채우지 않는다", () => {
  const url = buildItineraryGenerationUrl({ city: "Busan", startDate: D1, endDate: D3 })!;
  const keys = [...q(url).keys()].sort();
  assert.deepEqual(keys, ["city", "endDate", "startDate"],
    `채우지 않기로 한 값이 들어갔다: ${keys.join(",")}`);
});

test("itineraryDayCount 는 시작·종료를 모두 포함한다", () => {
  assert.equal(itineraryDayCount(D1, D3), 3);
  assert.equal(itineraryDayCount(D1, D1), 1);
  assert.equal(itineraryDayCount(D3, D1), 0);
  assert.equal(itineraryDayCount("bad", D3), 0);
});

// ── 17 · 18 · 19 · 20 · 23. 주소 안에 무엇이 없는가 ───────────────────────────

test("17: 값이 그대로 인코딩된다", () => {
  const url = buildItineraryGenerationUrl({
    city: "Busan", startDate: D1, endDate: D3, startLocation: BUSAN_STN,
  })!;
  assert.equal(q(url).get("startLocation"), BUSAN_STN, "한글·괄호가 깨졌다");
  assert.ok(url.startsWith("/itinerary?"));
  assert.ok(!url.includes(" "), "인코딩되지 않은 공백이 있다");
});

test("18·19·20: 주소에 장소·좌표·개인 정보를 싣지 않는다", () => {
  const url = buildItineraryGenerationUrl({
    city: "Busan", startDate: D1, endDate: D3, travelers: "1",
    travelStyle: "Solo", startLocation: BUSAN_STN, arrivalTime: "14:00",
    departurePlace: GIMHAE, departureTime: "17:00", stayArea: HAEUNDAE,
  })!;
  const keys = [...q(url).keys()];
  for (const bad of ["cart", "places", "selected", "items", "lat", "lng",
                     "display_title", "display_memo", "deviceId", "device_id",
                     "photo", "user_spot"]) {
    assert.ok(!keys.includes(bad), `주소에 ${bad} 가 있다`);
  }
  // 프리셋에서 되찾은 도착·출발 좌표만 허용된다 — 공개 랜드마크다
  assert.deepEqual(keys.filter(k => /lat|lng/i.test(k)).sort(),
    ["arrivalLat", "arrivalLng", "departureLat", "departureLng"]);
  assert.ok(!/user_spot/.test(url));
});

// ── 2 · 3. This Trip 직접 진입 ────────────────────────────────────────────────

test("2: 유효한 TripDraft 로 This Trip 이 곧바로 /itinerary 주소를 만든다", () => {
  const draft = { city: "Busan", startDate: D1, endDate: D3, updatedAt: 0 };
  const url = buildItineraryGenerationUrl({
    city: draft.city, startDate: draft.startDate, endDate: draft.endDate,
  })!;
  assert.ok(url.startsWith("/itinerary?"));
  assert.equal(q(url).get("city"), "Busan");
  assert.deepEqual(tripDraftDates(draft), [D1, D2, D3]);
});

test("3: This Trip 이 더 이상 /#planner 로 가지 않는다", () => {
  assert.doesNotMatch(picksSrc, /router\.push\("\/#planner"\)/);
  assert.doesNotMatch(picksSrc, /#planner/, "planner anchor 가 남았다");
  // 조건은 draft 하나에서 온다. 예전에는 여기서 도시·날짜만 골라 넘겼고,
  // 그래서 Home 에서 정한 도착·출발·숙박이 This Trip 에서 만들면 빠졌다.
  assert.match(picksSrc, /const url = draft && buildItineraryGenerationUrl\(tripDraftGenerationContext\(draft\)\)/);
  assert.match(picksSrc, /router\.push\(url\);/);
});

test("12: 조건이 없으면 이동하지 않고 안내만 켠다", () => {
  assert.match(picksSrc, /if \(!draft \|\| !url\) \{[\s\S]*?setBuildNotice\(true\);[\s\S]*?return;/);
  assert.match(picksSrc, /\{t\("buildNeedTrip"\)\}/);
});

// ── 19. architecture guard ────────────────────────────────────────────────────

test("19: 생성 주소를 만드는 곳은 한 군데다", () => {
  for (const [name, src] of [["Home", homeSrc], ["Picks", picksSrc]] as const) {
    assert.match(src, /buildItineraryGenerationUrl/, `${name} 이 공용 builder 를 쓰지 않는다`);
    assert.doesNotMatch(src, /new URLSearchParams\(\{\s*city/,
      `${name} 이 주소를 따로 조립한다`);
    assert.doesNotMatch(src, /router\.push\(`\/itinerary\?/,
      `${name} 이 주소를 문자열로 직접 만든다`);
  }
  assert.match(homeSrc, /const url = buildItineraryGenerationUrl\(\{/);
});

test("19: TripDraft core 계약과 provider schema 를 건드리지 않았다", () => {
  const draftCore = read("src", "lib", "trip-draft", "trip-draft-core.ts");
  const iface = /export interface TripDraft \{([\s\S]*?)\n\}/.exec(draftCore)?.[1] ?? "";
  assert.match(iface, /city/); assert.match(iface, /startDate/); assert.match(iface, /endDate/);
  // 도착·출발·숙박·동행은 이제 여기 있다 — Home 안에만 두면 화면을 떠날 때
  // 사라지고 This Trip 이 같은 여행을 다르게 알게 된다. 이름은 아래 생성 조건과
  // 같은 것을 쓴다. 아직 아무도 쓰지 않는 값만 막는다.
  for (const f of ["intensity", "pace", "travelStyle"]) {
    assert.ok(!iface.includes(f), `TripDraft 에 ${f} 가 들어갔다`);
  }
  const aiCore = read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts");
  assert.match(aiCore, /export interface PlaceHint \{ place_id: string; name\?: string; category\?: string \}/);
});

// ── 7 ~ 12. cart · My Places · fixed · HC 회귀 ────────────────────────────────

const YEONGDO  = { lat: 35.0748, lng: 129.0862 };
const HAE_COORD = { lat: 35.1589, lng: 129.1600 };
const hint = (id: string, c: { lat: number; lng: number }, fixed: CartFixed | null) =>
  ({ place_id: id, lat: c.lat, lng: c.lng, fixed });

test("7·8: cart 는 주소가 아니라 저장소에서 읽는다 — My Place 좌표 포함", () => {
  // This Trip 주소에는 장소가 없다
  const url = buildItineraryGenerationUrl({ city: "Busan", startDate: D1, endDate: D3 })!;
  assert.equal(q(url).get("cart"), null);
  // 좌표 보존 계약은 그대로다
  assert.ok(isValidCoordinate(YEONGDO.lat, YEONGDO.lng));
  assert.match(picksSrc, /const hasCoord = isValidCoordinate\(s\.lat, s\.lng\);/);
  assert.match(read("src", "app", "itinerary", "page.tsx"),
    /\.filter\(item => isSchedulableCoordinate\(item\.lat, item\.lng\)\)/);
});

test("9·10: fixed 메타데이터가 anchor 로 그대로 바뀐다", () => {
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  const hints = [
    hint("city_spot:1", HAE_COORD, null),                // 일반 This Trip
    hint(`user_spot:abc`, HAE_COORD, null),              // My Place (좌표 있음)
    hint("city_spot:2", YEONGDO, fixed),                 // 고정 약속
  ];
  const plan = planDayAnchors(hints, D2, null, null);
  assert.equal(plan.anchors.length, 1, "고정만 anchor 여야 한다");
  assert.deepEqual(plan.anchors[0], {
    place_id: "city_spot:2", start_time: "14:00", end_time: "16:00", is_fixed: true,
  });
  // 일반 This Trip 과 My Place 는 후보로 남고 anchor 가 아니다
  const kept = mergeDayHints(hints, plan).map(h => h.place_id);
  assert.ok(kept.includes("city_spot:1"));
  assert.ok(kept.includes("user_spot:abc"));
});

test("11: HC-8 · HC-9 가 그대로 걸린다", () => {
  const cands: NearMeCandidate[] = [
    { place_id: "city_spot:2", category: "event", coordinate: YEONGDO, zone_id: 3, score: 999 },
    { place_id: "far", category: "attraction", coordinate: HAE_COORD, zone_id: 1, score: 500 },
  ];
  const anchors = [{ place_id: "city_spot:2", start_time: "14:00", end_time: "16:00", is_fixed: true as const }];

  const ok = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: YEONGDO, pace: "normal", candidates: cands, anchors,
  });
  assert.ok(ok.success);
  assert.equal(ok.data.items.find(i => i.place_id === "city_spot:2")?.start_time, "14:00");

  const tight = runScheduler({
    trip_date: D2, start_time: "13:40", end_time: "21:00",
    base_coordinate: HAE_COORD, pace: "normal", candidates: cands, anchors,
  });
  assert.ok(tight.success);
  assert.equal(tight.data.items.filter(i => i.place_id === "far" && i.start_time < "14:00").length, 0);

  const clash = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: YEONGDO, pace: "normal", candidates: cands,
    anchors: [{ place_id: "far", start_time: "13:00", end_time: "13:50", is_fixed: true }, ...anchors],
  });
  assert.ok(!clash.success);
  assert.equal(clash.error.code, "HC-9");
});

// ── 13 · 14 · 15. arrival · departure · stay ─────────────────────────────────

test("13·14·15: 도착·출발·숙박 파라미터가 예전 형태 그대로 실린다", () => {
  const url = buildItineraryGenerationUrl({
    city: "Busan", startDate: D1, endDate: D3,
    startLocation: BUSAN_STN, arrivalTime: "14:00",
    departurePlace: GIMHAE, departureTime: "17:00", stayArea: HAEUNDAE,
  })!;
  const p = q(url);
  const stn = CITY_ARRIVAL_OPTIONS.Busan!.find(o => o.value === BUSAN_STN)!;
  const air = CITY_ARRIVAL_OPTIONS.Busan!.find(o => o.value === GIMHAE)!;
  assert.equal(p.get("arrivalTime"), "14:00");
  assert.equal(p.get("arrivalLat"),  String(stn.lat));
  assert.equal(p.get("arrivalType"), stn.type);
  assert.equal(p.get("departureTime"), "17:00");
  assert.equal(p.get("departureLat"),  String(air.lat));
  assert.equal(p.get("departureType"), "airport");
  assert.equal(p.get("stayArea"), HAEUNDAE);
});

test("15: 숙박을 고르지 않으면 그 키가 아예 없다", () => {
  const url = buildItineraryGenerationUrl({ city: "Busan", startDate: D1, endDate: D3 })!;
  assert.equal(q(url).get("stayArea"), null);
});

// ── 22 · 23. Home 유지 · 문구 ────────────────────────────────────────────────

test("22: Home 생성 경로가 그대로 살아 있다", () => {
  assert.match(homeSrc, /function doNavigate\(overrideStyle\?: string\)/);
  assert.match(homeSrc, /trackEvent\("generate_itinerary"/);
  assert.match(homeSrc, /router\.push\(url\);/);
});

test("23: CTA 와 안내 문구가 네 언어에 있다", () => {
  const locs = ["en", "ko", "ja", "zh"] as const;
  const builds = new Set<string>();
  for (const l of locs) {
    const o = JSON.parse(read("src", "messages", `${l}.json`)) as {
      picks: Record<string, string>; saved?: Record<string, string>;
    };
    for (const k of ["build", "buildNeedTrip"]) {
      assert.ok(typeof o.picks[k] === "string" && o.picks[k].trim().length > 0, `${l}.picks.${k}`);
    }
    builds.add(o.picks.build!);
    assert.ok(!/\bV2\b/.test(o.picks.build!), `${l}: CTA 에 V2 표기가 있다`);
  }
  // CTA 문구는 이번에 바꾸지 않았다 — d8eb659 에서 "버튼에 AI 를 다시 설명하지
  // 않는다" 로 확정한 값을 그대로 둔다. 최신 디자인의 `Build My Trip with AI`
  // 는 그 결정과 충돌하므로 오너 판단 전까지 손대지 않는다.
  assert.equal(builds.size, 4, "네 언어가 같은 문구를 쓰고 있다");
  assert.equal(JSON.parse(read("src", "messages", "en.json")).picks.build, "Plan My Trip");
  // 다른 네임스페이스의 build 는 건드리지 않았다
  const en = JSON.parse(read("src", "messages", "en.json")) as { saved?: Record<string, string> };
  assert.equal(en.saved?.build, "Build my itinerary");
});

// ── 28 · 29. 범위 밖 미구현 확인 ──────────────────────────────────────────────

test("28·29: AI Prep 과 Trip Intensity 를 만들지 않았다", () => {
  for (const [n, s] of [["Picks", picksSrc], ["Home", homeSrc]] as const) {
    assert.doesNotMatch(s, /aiPrep|AiPrep|AIPrep/, `${n} 에 AI Prep 이 생겼다`);
    assert.doesNotMatch(s, /tripIntensity|TripIntensity/, `${n} 에 Trip Intensity 가 생겼다`);
  }
});

console.log(`\nitinerary-url: ${passed} passed`);
