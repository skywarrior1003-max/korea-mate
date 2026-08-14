// 이번 여행의 조건이 한 곳에 있는가.
//
// 지금까지 도시와 날짜는 TripDraft 에, 동행·도착·출발·숙박은 Home 컴포넌트
// 안에만 있었다. Home 을 떠나면 뒤의 여섯 개가 사라졌고 This Trip 은 그것을
// 볼 방법이 없었다. 같은 여행을 두 화면이 다르게 알고 있었다.
//
// 그래서 여기서 보는 것은 두 가지다.
//   1. 아홉 개 값이 저장되고 되돌아오는가 (그리고 예전 사용자가 안 깨지는가)
//   2. 같은 저장값에서 Home 과 This Trip 이 **같은 주소**를 만드는가
//
// 실행: node --experimental-strip-types src/lib/trip-draft/trip-context-single-source.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  TRIP_DRAFT_KEY, clearTripDraft, readTripDraft, stayKind, writeTripDraft,
  type TripDraft,
} from "./trip-draft-core.ts";
import {
  buildItineraryGenerationUrl, tripDraftGenerationContext,
  type ItineraryGenerationContext,
} from "../trip-generation/itinerary-url.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem:    (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
/** 주석은 규칙 대상이 아니다 — 줄 수를 보존하며 지운다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
   .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));

const HOME  = strip(read("src", "app", "HomeClient.tsx"));
const PICKS = strip(read("src", "app", "picks", "PicksClient.tsx"));
const CORE  = strip(read("src", "lib", "trip-draft", "trip-draft-core.ts"));
const URLS  = strip(read("src", "lib", "trip-generation", "itinerary-url.ts"));

const D1 = "2026-10-24", D4 = "2026-10-27";
const FULL = {
  city: "Busan", startDate: D1, endDate: D4,
  travelers: "2", startLocation: "Gimhae International Airport (김해공항)",
  arrivalTime: "13:00", departurePlace: "KTX Busan Station (부산역)",
  departureTime: "18:00", stayArea: "Haeundae",
};
const raw = () => JSON.parse(store.get(TRIP_DRAFT_KEY)!) as Record<string, unknown>;

// ── A. 예전 사용자 호환 ───────────────────────────────────────────────────────

test("★새 필드를 모르던 draft 가 그대로 읽힌다", () => {
  store.clear();
  // 새 필드가 하나도 없는, 지금까지 저장돼 온 모양 그대로다.
  store.set(TRIP_DRAFT_KEY, JSON.stringify({
    city: "Busan", startDate: D1, endDate: D4, updatedAt: 1,
  }));
  const d = readTripDraft();
  assert.equal(d?.city, "Busan");
  assert.equal(d?.startDate, D1);
  assert.equal(d?.endDate, D4);
  assert.equal(d?.travelers, undefined, "없는 값을 지어냈다");
  assert.equal(stayKind(d), "none");
});

test("★새 필드를 모르던 draft 를 읽어도 저장된 것이 지워지지 않는다", () => {
  store.clear();
  const before = JSON.stringify({ city: "Busan", startDate: D1, endDate: D4, updatedAt: 1 });
  store.set(TRIP_DRAFT_KEY, before);
  readTripDraft();
  assert.equal(store.get(TRIP_DRAFT_KEY), before, "읽기가 저장소를 건드렸다");
});

test("★도시·날짜만 넘겨도 예전 동작 그대로다", () => {
  store.clear();
  const d = writeTripDraft({ city: "Busan", startDate: D1, endDate: D4, now: 5 });
  assert.equal(d?.city, "Busan");
  assert.deepEqual(Object.keys(raw()).sort(), ["city", "endDate", "startDate", "updatedAt"]);
});

// ── B. 아홉 값의 저장 / 복원 ──────────────────────────────────────────────────

for (const key of ["travelers", "startLocation", "arrivalTime",
                   "departurePlace", "departureTime", "stayArea"] as const) {
  test(`★${key} 저장 → 복원`, () => {
    store.clear();
    writeTripDraft({ ...FULL, now: 1 });
    assert.equal(readTripDraft()?.[key], FULL[key], `${key} 가 돌아오지 않았다`);
  });
}

test("★도시·날짜도 함께 유지된다", () => {
  store.clear();
  writeTripDraft({ ...FULL, now: 1 });
  const d = readTripDraft()!;
  assert.equal(d.city, "Busan");
  assert.equal(d.startDate, D1);
  assert.equal(d.endDate, D4);
});

test("★생략한 값은 저장된 것을 덮어쓰지 않는다", () => {
  // 도시와 날짜만 아는 화면이 저장할 때 도착·출발·숙박이 함께 지워지면
  // 사용자는 자기가 입력한 것을 잃는다.
  store.clear();
  writeTripDraft({ ...FULL, now: 1 });
  writeTripDraft({ city: "Busan", startDate: D1, endDate: D4, now: 2 });
  const d = readTripDraft()!;
  assert.equal(d.travelers, "2");
  assert.equal(d.arrivalTime, "13:00");
  assert.equal(d.stayArea, "Haeundae");
});

test("★빈 문자열은 실제로 지운다", () => {
  // 생략과 비움은 다른 뜻이다. 사용자가 지웠는데 예전 값이 남으면 고르지 않은
  // 지역이 일정에 들어간다.
  store.clear();
  writeTripDraft({ ...FULL, now: 1 });
  writeTripDraft({ city: "Busan", startDate: D1, endDate: D4, stayArea: "", now: 2 });
  assert.equal(readTripDraft()?.stayArea, undefined);
  assert.equal(readTripDraft()?.travelers, "2", "생략한 값까지 지웠다");
});

test("★같은 도시에서 날짜만 바꿔도 여행 조건이 남는다", () => {
  store.clear();
  writeTripDraft({ ...FULL, now: 1 });
  writeTripDraft({ city: "Busan", startDate: "2026-11-02", endDate: "2026-11-05", now: 2 });
  const d = readTripDraft()!;
  assert.equal(d.startDate, "2026-11-02");
  assert.equal(d.travelers, "2");
  assert.equal(d.startLocation, FULL.startLocation);
  assert.equal(d.departureTime, "18:00");
  assert.equal(d.stayArea, "Haeundae");
});

test("★날짜가 반쯤 입력된 순간에는 저장하지 않는다", () => {
  store.clear();
  writeTripDraft({ ...FULL, now: 1 });
  assert.equal(writeTripDraft({ city: "Busan", startDate: D1, endDate: "", now: 2 }), null);
  assert.equal(readTripDraft()?.stayArea, "Haeundae", "반쯤 입력된 값이 저장을 망쳤다");
});

// ── C. Home 의 순서 — 읽기가 먼저다 ───────────────────────────────────────────

test("★Home 은 저장된 값을 읽어 state 를 되돌린다", () => {
  for (const setter of ["setTravelers", "setStartLocation", "setArrivalTime",
                        "setDeparturePlace", "setDepartureTime", "setStayArea"]) {
    assert.match(HOME, new RegExp(`${setter}\\(d\\.\\w+\\)`),
      `Home 이 ${setter} 로 저장값을 되돌리지 않는다`);
  }
  assert.match(HOME, /readTripDraft\(\)/, "Home 이 draft 를 읽지 않는다");
});

test("★★Home 은 읽기 전에 저장하지 않는다", () => {
  // 이 가드가 이 파일에서 가장 중요하다. 순서가 뒤집히면 첫 렌더의 기본값
  // ("1", "14:00", "")이 저장값을 덮어쓰고, 사용자는 돌아올 때마다 입력이
  // 초기화되는 것을 본다. 테스트로 잡기 어려운 자리라 호출부를 본다.
  const m = HOME.match(/useEffect\(\(\) => \{\s*if \(!restored\) return;\s*writeTripDraft\(/);
  assert.ok(m, "writeTripDraft 가 복원 완료 여부를 확인하지 않고 실행된다");
  const gateAt = HOME.indexOf("setRestored(true)");
  assert.ok(gateAt > 0 && gateAt < HOME.indexOf("writeTripDraft("),
    "복원이 저장보다 뒤에 선언돼 있다");
});

test("★Home 은 아홉 값을 모두 저장한다", () => {
  const call = HOME.slice(HOME.indexOf("writeTripDraft({"));
  const body = call.slice(0, call.indexOf("});"));
  for (const k of ["city", "startDate", "endDate", "travelers", "startLocation",
                   "arrivalTime", "departurePlace", "departureTime", "stayArea"]) {
    assert.ok(body.includes(k), `Home 이 ${k} 를 저장하지 않는다`);
  }
});

test("★도시를 바꾸면 그 도시에 없는 지점은 남지 않는다", () => {
  assert.match(HOME, /setDeparturePlace\(p => \(p && !options\.some/, "출발지 정리가 없다");
  assert.match(HOME, /setStayArea\(s => \(s && !stayAreaOptions\(city\)\.some/, "숙박 지역 정리가 없다");
  // This Trip 의 다른 도시 장소는 도시 변경으로 지우지 않는다.
  assert.doesNotMatch(HOME, /removeFromAllCities|clearCart\(/,
    "도시 변경이 This Trip 장소를 지우고 있다");
});

// ── D. Home 과 This Trip 이 같은 주소를 만든다 ────────────────────────────────

const draftOf = (over: Partial<TripDraft> = {}): TripDraft => {
  store.clear();
  writeTripDraft({ ...FULL, now: 1, ...over });
  return readTripDraft()!;
};

test("★★같은 저장값이면 Home 과 This Trip 의 생성 주소가 같다", () => {
  const d = draftOf();
  // Home 이 자기 state 로 조립하는 모양 그대로.
  const home: ItineraryGenerationContext = {
    city: d.city, startDate: d.startDate, endDate: d.endDate,
    travelers: d.travelers, startLocation: d.startLocation, arrivalTime: d.arrivalTime,
    departurePlace: d.departurePlace, departureTime: d.departureTime, stayArea: d.stayArea,
  };
  assert.equal(
    buildItineraryGenerationUrl(tripDraftGenerationContext(d)),
    buildItineraryGenerationUrl(home),
    "같은 여행인데 두 화면이 다른 주소를 만든다",
  );
});

test("★This Trip 도 공용 builder 를 쓴다", () => {
  assert.match(PICKS, /buildItineraryGenerationUrl\(tripDraftGenerationContext\(draft\)\)/,
    "This Trip 이 주소를 따로 조립하고 있다");
  assert.doesNotMatch(PICKS, /new URLSearchParams|\?city=/, "This Trip 에 주소 조립이 남아 있다");
});

test("★도착·출발·숙박이 실제로 주소에 실린다", () => {
  const url = buildItineraryGenerationUrl(tripDraftGenerationContext(draftOf()))!;
  for (const p of ["travelers=2", "arrivalTime=13", "departureTime=18", "stayArea=Haeundae"]) {
    assert.ok(url.includes(p.split("=")[0]!), `${p} 가 빠졌다`);
  }
  assert.ok(/departureLat=|departureLng=/.test(url), "출발 좌표가 프리셋에서 되찾아지지 않았다");
});

test("★없는 값은 넣지 않는다", () => {
  const d = draftOf({ stayArea: "", departurePlace: "", departureTime: "" });
  const ctx = tripDraftGenerationContext(d);
  assert.equal(ctx.stayArea, undefined);
  assert.equal(ctx.departureTime, undefined);
  assert.ok(!buildItineraryGenerationUrl(ctx)!.includes("stayArea="));
});

test("★travelStyle 은 draft 가 아니라 아는 화면이 넘긴다", () => {
  const d = draftOf();
  assert.equal(tripDraftGenerationContext(d).travelStyle, undefined);
  assert.equal(tripDraftGenerationContext(d, { travelStyle: "Solo" }).travelStyle, "Solo");
  assert.doesNotMatch(CORE, /travelStyle/, "travelStyle 이 TripDraft 로 들어왔다");
});

test("★This Trip 은 이번 도시 것만 넘긴다", () => {
  // 장소는 주소에 싣지 않는다 — cart 에서 읽고, 그 cart 는 도시별이다.
  assert.match(PICKS, /getCityCart\(tripCity\)/, "This Trip 이 도시별 목록을 쓰지 않는다");
  assert.doesNotMatch(URLS, /cart|sourceKey|lat:\s*item/, "생성 주소에 장소가 실린다");
  const url = buildItineraryGenerationUrl(tripDraftGenerationContext(draftOf()))!;
  assert.ok(!/user_spot|city_spot|local_info/.test(url), "주소에 장소 식별자가 실렸다");
});

// ── E. 숙박 — 네 단계를 구분한다 ─────────────────────────────────────────────

test("★숙박 미정이어도 일정을 만들 수 있다", () => {
  const d = draftOf({ stayArea: "" });
  assert.equal(stayKind(d), "none");
  assert.ok(buildItineraryGenerationUrl(tripDraftGenerationContext(d)), "숙박이 생성을 막았다");
});

test("★대략적인 지역만 정한 상태", () => {
  assert.equal(stayKind(draftOf({ stayArea: "Gwangalli" })), "area");
});

test("★숙소 정보는 있지만 위치는 확인되지 않은 상태", () => {
  store.clear();
  writeTripDraft({ ...FULL, stay: { name: "Signiel Busan", address: "해운대구 ...", link: "https://naver.me/x" }, now: 1 });
  const d = readTripDraft()!;
  assert.equal(stayKind(d), "detail", "주소·링크가 있다고 확인된 위치로 다뤄졌다");
  assert.equal(d.stay?.coordinate, undefined, "좌표를 지어냈다");
});

test("★★링크가 있다는 이유로 좌표를 만들지 않는다", () => {
  store.clear();
  writeTripDraft({ ...FULL, stay: { link: "https://maps.app.goo.gl/abc" }, now: 1 });
  const d = readTripDraft()!;
  assert.equal(d.stay?.link, "https://maps.app.goo.gl/abc", "원문이 사라졌다");
  assert.equal(d.stay?.address, undefined, "주소를 지어냈다");
  assert.equal(d.stay?.coordinate, undefined, "좌표를 지어냈다");
  assert.notEqual(stayKind(d), "located");
});

test("★확인된 좌표만 located 다", () => {
  store.clear();
  writeTripDraft({ ...FULL, stay: { name: "H", coordinate: { lat: 35.158, lng: 129.16 } }, now: 1 });
  assert.equal(stayKind(readTripDraft()), "located");
});

test("★말이 안 되는 좌표는 살리지 않는다", () => {
  for (const c of [{ lat: 0, lng: 0 }, { lat: 999, lng: 129 }, { lat: NaN, lng: 129 },
                   { lat: "35" as unknown as number, lng: 129 }]) {
    store.clear();
    writeTripDraft({ ...FULL, stay: { name: "H", coordinate: c }, now: 1 });
    assert.equal(readTripDraft()?.stay?.coordinate, undefined, `${JSON.stringify(c)} 를 통과시켰다`);
  }
});

test("★★숙박은 날짜별 목록이 아니다", () => {
  assert.doesNotMatch(CORE, /stays\??:\s*(Array|\w+\[\])/, "날짜별 숙박 배열이 생겼다");
  assert.doesNotMatch(CORE, /perNight|nightly|stayByDate/i, "날짜별 숙박 개념이 들어왔다");
  // 손으로 고친 값이 배열로 들어와도 첫 항목을 골라 쓰지 않는다.
  store.clear();
  store.set(TRIP_DRAFT_KEY, JSON.stringify({
    city: "Busan", startDate: D1, endDate: D4, updatedAt: 1,
    stay: [{ name: "Night 1" }, { name: "Night 2" }],
  }));
  const d = readTripDraft()!;
  assert.equal(d.stay, undefined, "날짜별 배열을 숙소로 받아들였다");
  assert.equal(d.city, "Busan", "배열 하나 때문에 여행 전체를 버렸다");
});

test("★정확한 숙소는 주소에 실리지 않는다", () => {
  store.clear();
  writeTripDraft({ ...FULL, stay: { name: "Signiel Busan", address: "해운대구", link: "https://naver.me/x" }, now: 1 });
  const url = buildItineraryGenerationUrl(tripDraftGenerationContext(readTripDraft()!))!;
  for (const leak of ["Signiel", "naver.me", encodeURIComponent("해운대구")]) {
    assert.ok(!url.includes(leak), `${leak} 가 주소에 남았다`);
  }
});

test("★★외부 조회를 하지 않는다", () => {
  for (const [label, src] of [["trip-draft-core", CORE], ["itinerary-url", URLS]] as const) {
    assert.doesNotMatch(src, /\bfetch\s*\(|geocod|places\.googleapis|maps\.googleapis|openapi\.naver/i,
      `${label} 에 외부 조회가 들어왔다`);
  }
});

// ── F. 이번 TASK 가 하지 않은 것 ──────────────────────────────────────────────

test("★travelStyle 을 건드리지 않았다", () => {
  assert.match(HOME, /sessionStorage\.getItem\("km_travel_style"\)/, "travelStyle 저장이 사라졌다");
  assert.match(HOME, /travelStyle:\s*effectiveStyle/, "travelStyle 이 생성에서 빠졌다");
});

test("★Trip Pace 를 만들지 않았다", () => {
  for (const [label, src] of [["Home", HOME], ["Picks", PICKS], ["core", CORE]] as const) {
    assert.doesNotMatch(src, /tripPace|Relaxed\s*\/|"Balanced"|'Balanced'/i,
      `${label} 에 Trip Pace 가 들어왔다`);
  }
  assert.doesNotMatch(CORE, /packed/, "pace mapping 이 들어왔다");
});

test("★This Trip 통합 화면과 숙소 입력 UI 를 만들지 않았다", () => {
  assert.doesNotMatch(PICKS, /Plan My Trip|Trip Pace|Scheduled Plans|Places to Visit/,
    "This Trip 통합 화면이 들어왔다");
  // `accommodation` 은 장소 분류 이름이라 그대로 둔다 — 숙소 **입력**만 본다.
  assert.doesNotMatch(PICKS, /stay\.address|stay\.link|stay\.name|setStay\w*|TripStayDetail/,
    "정확한 숙소 입력 UI 가 들어왔다");
});

test("★Picks 는 3탭 그대로다", () => {
  assert.match(PICKS, /const TABS: Tab\[\] = \["selected", "saved", "mine"\]/);
});

console.log(`\n  ${passed} passed`);
clearTripDraft();
