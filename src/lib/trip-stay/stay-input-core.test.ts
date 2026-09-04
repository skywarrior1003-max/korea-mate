// 정확한 숙소를 받되, 모르는 위치를 아는 척하지 않는가.
//
// 이 파일이 지키는 규칙은 하나로 요약된다 — **좌표는 사용자가 지도에서 짚었을
// 때만 생긴다.** 주소를 적어도, 링크를 붙여도, 이름이 유명한 호텔이어도 위치는
// 생기지 않는다. 모르는 위치를 지어내면 닿을 수 없는 일정이 조용히 통과한다.
//
// 두 번째 규칙은 그 반대편이다 — 확인해 둔 좌표가 이유 없이 사라지지 않는다.
// 커서가 지나갔다고 지도를 다시 열게 만들면 아무도 확인하지 않는다.
//
// 실행: node --experimental-strip-types src/lib/trip-stay/stay-input-core.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  EMPTY_STAY_FIELDS, confirmStayCoordinate, hasAnyStayField, nextStayDetail,
  stayFieldsFrom, stayIdentityChanged, stayMapCenter, stayModeFrom,
} from "./stay-input-core.ts";
import { TRIP_DRAFT_KEY, readTripDraft, stayKind, writeTripDraft } from "../trip-draft/trip-draft-core.ts";
import { buildItineraryGenerationUrl, tripDraftGenerationContext } from "../trip-generation/itinerary-url.ts";
import { stayStartFor, buildSingleStay } from "./stay-core.ts";

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
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
   .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));

const CORE   = strip(read("src", "lib", "trip-stay", "stay-input-core.ts"));
const PICKER = strip(read("src", "components", "StayLocationPicker.tsx"));
const FIELDS = strip(read("src", "components", "StayFields.tsx"));
// 플래너 코드는 PLANNER-SPOTS-SEPARATION-V1 에서 /planner 로 이사했다 — 검사 대상은 동일 코드다.
const HOME   = strip(read("src", "app", "planner", "PlannerClient.tsx"));

const AREA  = "Haeundae (해운대)";   // 실제 프리셋 value — 라벨이 값이다
const HOTEL = { lat: 35.1589, lng: 129.1600 };   // 해운대 근처
const F = (name = "", address = "", link = "") => ({ name, address, link });

// ── A. 세 값은 전부 선택이다 ─────────────────────────────────────────────────

test("★아무것도 없으면 저장할 것도 없다", () => {
  assert.equal(nextStayDetail(EMPTY_STAY_FIELDS, null), null, "빈 껍데기를 남겼다");
  assert.equal(hasAnyStayField(EMPTY_STAY_FIELDS), false);
});

for (const [label, fields] of [
  ["이름만",  F("Paradise Hotel Busan")],
  ["주소만",  F("", "부산 해운대구 해운대해변로 296")],
  ["링크만",  F("", "", "https://naver.me/xxxxx")],
] as const) {
  test(`★${label} 입력해도 저장된다`, () => {
    const d = nextStayDetail(fields, null);
    assert.ok(d, `${label} 이 버려졌다`);
    assert.equal(d!.coordinate, undefined, "위치를 지어냈다");
  });
}

test("★세 값 모두 있어도 좌표는 생기지 않는다", () => {
  const d = nextStayDetail(F("Paradise Hotel Busan", "해운대해변로 296", "https://naver.me/x"), null)!;
  assert.equal(d.name, "Paradise Hotel Busan");
  assert.equal(d.address, "해운대해변로 296");
  assert.equal(d.link, "https://naver.me/x");
  assert.equal(d.coordinate, undefined, "★입력만으로 위치가 확인된 것으로 다뤄졌다");
});

test("★앞뒤 공백만 정리하고 내용은 그대로 둔다", () => {
  const d = nextStayDetail(F("  Paradise  ", " 해운대 ", " https://naver.me/x "), null)!;
  assert.equal(d.name, "Paradise");
  assert.equal(d.link, "https://naver.me/x");
});

// ── B. 좌표가 생기는 유일한 길 ───────────────────────────────────────────────

test("★★지도에서 확인해야만 좌표가 생긴다", () => {
  const d = confirmStayCoordinate(F("Paradise"), HOTEL.lat, HOTEL.lng)!;
  assert.deepEqual(d.coordinate, HOTEL);
  assert.equal(d.name, "Paradise", "확인하면서 적어 둔 이름이 사라졌다");
});

test("★말이 안 되는 좌표는 확인해도 저장되지 않는다", () => {
  for (const [lat, lng] of [[0, 0], [999, 129], [NaN, 129], [35, 400]] as const) {
    assert.equal(confirmStayCoordinate(F("H"), lat, lng), null, `(${lat},${lng}) 를 통과시켰다`);
  }
});

test("★★core 는 주소도 링크도 좌표로 바꾸지 않는다", () => {
  // 좌표를 만드는 함수는 lat/lng 를 인자로 받는 것 하나뿐이다.
  assert.match(CORE, /export function confirmStayCoordinate\(\s*\n?\s*fields: StayFields, lat: number, lng: number,?\s*\n?\)/);
  assert.doesNotMatch(CORE, /\bfetch\s*\(|geocod|places\.googleapis|maps\.googleapis|openapi\.naver|naver\.me|goo\.gl/i,
    "core 에 외부 조회나 링크 해석이 들어왔다");
});

test("★★화면 어디에도 링크 해석·주소 변환이 없다", () => {
  for (const [label, src] of [["StayFields", FIELDS], ["Picker", PICKER]] as const) {
    assert.doesNotMatch(src, /\bfetch\s*\(|geocod|Places|resolveLink|parseLink|naver\.me|goo\.gl/i,
      `${label} 에 링크 해석·좌표 조회가 들어왔다`);
  }
});

// ── C. 확인 전에는 저장하지 않는다 ───────────────────────────────────────────

test("★★지도를 눌러도 확인 전에는 밖으로 나가지 않는다", () => {
  // 클릭은 컴포넌트 안 `picked` 만 바꾼다. 저장은 Confirm 버튼에서만 일어난다.
  assert.match(PICKER, /setPicked\(\{ lat: lat!, lng: lng! \}\)/, "클릭이 임시 선택을 만들지 않는다");
  const click = PICKER.slice(PICKER.indexOf('addListener(map, "click"'));
  const clickBody = click.slice(0, click.indexOf("});"));
  assert.doesNotMatch(clickBody, /onConfirm/, "★지도 클릭이 곧바로 저장한다");
  assert.match(PICKER, /onClick=\{\(\) => \{ if \(picked\) onConfirm\(picked\.lat, picked\.lng\); \}\}/,
    "Confirm 버튼이 저장을 맡고 있지 않다");
});

test("★고른 것이 없으면 확인 버튼을 누를 수 없다", () => {
  assert.match(PICKER, /disabled=\{!picked\}/);
});

test("★취소는 아무것도 바꾸지 않는다", () => {
  // 취소 경로에 onConfirm 이 없다 — 기존 저장값이 그대로 남는다.
  assert.match(PICKER, /onClick=\{onCancel\}/, "취소 버튼이 없다");
  assert.match(FIELDS, /onCancel=\{\(\) => setPickerOpen\(false\)\}/, "취소가 저장을 건드린다");
});

test("★이미 확인한 위치는 지도를 열 때 그 자리에 표시된다", () => {
  assert.match(PICKER, /if \(confirmed\) place\(confirmed\.lat, confirmed\.lng\)/);
  assert.match(PICKER, /useState<\{ lat: number; lng: number \} \| null>\(confirmed\)/,
    "다시 열었을 때 이전 선택이 비어 있다");
});

// ── D. 숙소가 바뀌면 좌표를 믿지 않는다 ──────────────────────────────────────

const CONFIRMED = { name: "Paradise Hotel Busan", coordinate: HOTEL };

test("★★다른 숙소로 바꾸면 예전 좌표를 버린다", () => {
  const next = nextStayDetail(F("Nampo Guesthouse"), CONFIRMED)!;
  assert.equal(next.coordinate, undefined,
    "★해운대에서 짚은 좌표가 남포동 숙소에 그대로 남았다");
  assert.equal(next.name, "Nampo Guesthouse");
});

test("★주소나 링크만 바뀌어도 좌표를 버린다", () => {
  const base = { name: "H", address: "A", link: "L", coordinate: HOTEL };
  assert.equal(nextStayDetail(F("H", "다른 주소", "L"), base)?.coordinate, undefined);
  assert.equal(nextStayDetail(F("H", "A", "https://other"), base)?.coordinate, undefined);
});

test("★★같은 값을 다시 저장한다고 좌표가 사라지지 않는다", () => {
  // 커서가 지나갈 때마다 지도를 다시 열게 만들면 아무도 확인하지 않는다.
  assert.deepEqual(nextStayDetail(F("Paradise Hotel Busan"), CONFIRMED)?.coordinate, HOTEL);
  assert.deepEqual(nextStayDetail(F("  paradise hotel busan  "), CONFIRMED)?.coordinate, HOTEL,
    "공백·대소문자 차이로 좌표를 버렸다");
});

test("★같은 숙소인지 판단은 세 값을 모두 본다", () => {
  assert.equal(stayIdentityChanged(F("A", "B", "C"), F("A", "B", "C")), false);
  assert.equal(stayIdentityChanged(F("A"), F("A", "B")), true);
});

// ── E. 지도를 어디서 여는가 ──────────────────────────────────────────────────

test("★확인한 위치 → 고른 지역 → 도시 중심 순으로 연다", () => {
  assert.equal(stayMapCenter("Busan", AREA, HOTEL)?.source, "confirmed");
  assert.equal(stayMapCenter("Busan", AREA, null)?.source, "area");
  assert.equal(stayMapCenter("Busan", "", null)?.source, "city");
  assert.equal(stayMapCenter("Busan", null, { lat: 0, lng: 0 })?.source, "city", "(0,0) 을 위치로 썼다");
});

test("★★주소·링크로는 지도 위치를 잡지 않는다", () => {
  // 인자에 문자열 주소나 링크가 아예 없다 — 잡을 수단 자체가 없다.
  assert.match(CORE, /export function stayMapCenter\(\s*\n\s*city: string,\s*\n\s*stayArea: string \| null \| undefined,\s*\n\s*confirmed: \{ lat: number; lng: number \} \| null \| undefined,/);
});

test("★어디인지 모르면 지도를 열지 않는다", () => {
  assert.equal(stayMapCenter("Atlantis", "", null), null, "모르는 도시에서 지도를 열었다");
  assert.match(FIELDS, /disabled=\{!center\}/, "중심을 모르는데 버튼이 열린다");
});

// ── F. 어느 단계인지 화면과 저장이 같은 말을 한다 ────────────────────────────

test("★모드는 저장된 값에서 되살아난다", () => {
  assert.equal(stayModeFrom("", null), "none");
  assert.equal(stayModeFrom(AREA, null), "area");
  assert.equal(stayModeFrom(AREA, { name: "H" }), "exact");
  assert.equal(stayModeFrom("", { coordinate: HOTEL }), "exact");
});

test("★stayKind 네 단계가 그대로 나온다", () => {
  store.clear();
  const base = { city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", now: 1 };
  writeTripDraft({ ...base, stayArea: "", stay: null });
  assert.equal(stayKind(readTripDraft()), "none");
  writeTripDraft({ ...base, stayArea: AREA });
  assert.equal(stayKind(readTripDraft()), "area");
  writeTripDraft({ ...base, stay: nextStayDetail(F("Paradise"), null) });
  assert.equal(stayKind(readTripDraft()), "detail");
  writeTripDraft({ ...base, stay: confirmStayCoordinate(F("Paradise"), HOTEL.lat, HOTEL.lng) });
  assert.equal(stayKind(readTripDraft()), "located");
});

test("★fields 는 저장된 것과 왕복한다", () => {
  const d = confirmStayCoordinate(F("Paradise", "해운대해변로 296", "https://naver.me/x"), HOTEL.lat, HOTEL.lng)!;
  assert.deepEqual(stayFieldsFrom(d), F("Paradise", "해운대해변로 296", "https://naver.me/x"));
});

// ── G. Home 이 TripDraft 하나만 쓴다 ─────────────────────────────────────────

test("★★숙박 전용 저장소를 만들지 않았다", () => {
  for (const [label, src] of [["Home", HOME], ["StayFields", FIELDS], ["Picker", PICKER], ["core", CORE]] as const) {
    assert.doesNotMatch(src, /localStorage\.\w+\(\s*["'`]koreamate_(stay|accommodation|hotel)/,
      `${label} 에 숙박 전용 key 가 생겼다`);
  }
  assert.doesNotMatch(FIELDS, /localStorage|sessionStorage/, "입력 컴포넌트가 직접 저장한다");
  assert.doesNotMatch(PICKER, /localStorage|sessionStorage/, "지도 화면이 직접 저장한다");
});

test("★Home 은 고른 수준대로 저장한다", () => {
  assert.match(HOME, /stayArea: stayMode === "none"\s*\? "" : stayArea,/);
  assert.match(HOME, /stay:\s*stayMode === "exact" \? stayDetail : null,/);
});

test("★도시를 바꾸면 확인해 둔 좌표는 버리고 적은 글은 남긴다", () => {
  const block = HOME.slice(HOME.indexOf("setStayDetail(prev =>"));
  assert.match(block.slice(0, 260), /if \(!prev\?\.coordinate\) return prev;/,
    "도시 변경이 적어 둔 숙소 정보까지 지운다");
  assert.match(block.slice(0, 260), /coordinate: _dropped, \.\.\.rest/);
});

test("★입력 한 벌은 Home 전용이 아니다", () => {
  // This Trip 도 같은 컴포넌트를 건다. Home 안에 다시 만들면 두 화면이 어긋난다.
  assert.match(HOME, /<StayFieldsSection/, "Home 이 공용 컴포넌트를 쓰지 않는다");
  assert.doesNotMatch(FIELDS, /HomeClient|useSearchParams|useRouter/, "컴포넌트가 Home 에 묶였다");
  assert.doesNotMatch(HOME, /stayAreaOptions\(city\)\.map/, "Home 에 지역 선택이 중복으로 남았다");
});

// ── H. 개인정보 — 밖으로 나가지 않는다 ───────────────────────────────────────

test("★★적은 숙소 정보는 주소창에 실리지 않는다", () => {
  store.clear();
  writeTripDraft({
    city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", now: 1,
    stay: confirmStayCoordinate(F("Paradise Hotel Busan", "해운대해변로 296", "https://naver.me/secret"),
                                HOTEL.lat, HOTEL.lng),
  });
  const draft = readTripDraft()!;
  assert.equal(draft.stay?.coordinate?.lat, HOTEL.lat, "저장 자체가 안 됐다");

  const ctx = tripDraftGenerationContext(draft);
  assert.equal((ctx as unknown as Record<string, unknown>).stay, undefined);
  const url = buildItineraryGenerationUrl(ctx)!;
  for (const leak of ["Paradise", "naver.me", "secret", String(HOTEL.lat), encodeURIComponent("해운대해변로")]) {
    assert.ok(!url.includes(leak), `★${leak} 가 주소창에 새어 나갔다`);
  }
});

test("★숙소 정보를 로그로 내보내지 않는다", () => {
  for (const [label, src] of [["StayFields", FIELDS], ["Picker", PICKER], ["core", CORE]] as const) {
    assert.doesNotMatch(src, /console\.(log|info|warn|error)|trackEvent/,
      `${label} 이 숙소 정보를 밖으로 내보낸다`);
  }
});

test("★My Places·Saved·This Trip 에 숙소를 만들지 않는다", () => {
  for (const [label, src] of [["StayFields", FIELDS], ["Picker", PICKER], ["core", CORE]] as const) {
    assert.doesNotMatch(src, /user_spot|apiCreateUserSpot|addToCart|toggleFavorite|savePlace|cacheSavedSpot/,
      `${label} 이 숙소로 장소를 만든다`);
  }
});

// ── I. 이번에 하지 않은 것 ───────────────────────────────────────────────────

test("★★스케줄러를 건드리지 않았다", () => {
  // stayStartFor 는 지역 좌표를 그대로 받는 예전 계약이다.
  const stays = buildSingleStay("Busan", AREA, "2026-10-24", "2026-10-27");
  assert.equal(stays.length, 1);
  assert.equal(stayStartFor(stays, "2026-10-25")?.lat, stays[0]!.coordinate.lat);
  assert.equal(stayStartFor(stays, "2026-10-24"), null, "첫날부터 숙소에서 시작한다");

  const stayCore = strip(read("src", "lib", "trip-stay", "stay-core.ts"));
  assert.doesNotMatch(stayCore, /TripStayDetail|stay\.coordinate|TripDraft/,
    "stay-core 가 정확한 숙소를 읽기 시작했다");
});

test("★★저녁 복귀·통금을 만들지 않았다", () => {
  const itin = strip(read("src", "app", "itinerary", "page.tsx"));
  assert.doesNotMatch(itin, /__accommodation|accommodationDestination|curfew|hotelArrival/i,
    "숙소 복귀 목적지가 들어왔다");
  assert.match(itin, /const end_time = isLastDay \? \(effectiveDeptTime \?\? "21:00"\) : "21:00";/,
    "하루 종료 계약이 바뀌었다");
  assert.match(itin, /stayStartFor\(stays, trip_date\) \?\? currentCoordinate/,
    "하루 시작 계약이 바뀌었다");
});

test("★날짜별 숙박이 아니다", () => {
  assert.doesNotMatch(CORE, /perNight|nightly|Night 1|stays\[\d\]/i);
  assert.doesNotMatch(FIELDS, /perNight|nightly|checkInDate/i);
  store.clear();
  writeTripDraft({
    city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", now: 1,
    stay: [{ name: "N1" }, { name: "N2" }] as never,
  });
  assert.equal(readTripDraft()?.stay, undefined, "날짜별 배열을 받아들였다");
});

test("★숙박을 안 정해도 일정을 만들 수 있다", () => {
  store.clear();
  writeTripDraft({ city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", stayArea: "", stay: null, now: 1 });
  const d = readTripDraft()!;
  assert.equal(stayKind(d), "none");
  assert.ok(buildItineraryGenerationUrl(tripDraftGenerationContext(d)), "숙박이 생성을 막았다");
});

console.log(`\n  ${passed} passed`);
