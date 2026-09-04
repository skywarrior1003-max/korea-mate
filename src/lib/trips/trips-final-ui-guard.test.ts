/**
 * TASK-MY-TRIPS-FINAL-UI-V1 — Trips 목록 화면 계약 가드
 * Run: node --experimental-strip-types --test src/lib/trips/trips-final-ui-guard.test.ts
 *
 * - /my-trips 는 최종 시안(my_trips_final)의 네 덩어리로만 이루어진다:
 *   TRAVELING NOW 히어로 · UPCOMING 줄 · 점선 New trip · 지난 여행 → Story 한 줄
 * - Story 진입 계약(`/itinerary?id=…&view=story`)과 My Trip 진입(`/itinerary?id=…`) 보존
 * - 폐기된 표현(Memory Archive · 통계 emoji 칩 · "AI in 30 sec")이 돌아오지 않는다
 * - 토큰은 패키지의 DESIGN.md 값 그대로
 * - 새 키 4개 언어 parity, `/trips` route 파일을 만들지 않았다
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

const page   = read("src/app/my-trips/page.tsx");
const tokens = read("src/components/trips/trips-tokens.ts");
const hero   = read("src/components/trips/TravelingNowHero.tsx");
const prims  = read("src/components/trips/TripsPrimitives.tsx");

test("U1: 네 덩어리 — 히어로 · 예정 줄 · 점선 New trip · 지난 여행 Story 한 줄", () => {
  assert.match(page, /<TravelingNowHero/);
  assert.match(page, /t\("sectionTravelingNow"\)/);
  assert.match(page, /t\("sectionUpcoming"\)/);
  assert.match(page, /<DashedAction href="\/planner">\{t\("newTrip"\)\}<\/DashedAction>/);
  assert.match(page, /t\("pastTripsStory"\)/);
});

test("U2: 진입 계약 보존 — My Trip 은 /itinerary?id, 지난 여행은 &view=story", () => {
  assert.match(page, /href=\{`\/itinerary\?id=\$\{hero\.id\}`\}/);
  assert.match(page, /rowOf\(trip, `\/itinerary\?id=\$\{trip\.id\}`\)/);
  assert.match(page, /rowOf\(trip, `\/itinerary\?id=\$\{trip\.id\}&view=story`\)/);
  assert.ok(!page.includes("router.push(`/story"), "별도 Story route 를 만들지 않는다");
});

test("U3: lifecycle 은 날짜 하나로만 가르고, '오늘 · 장소'는 일정 시간으로만 (GPS 없음)", () => {
  assert.match(page, /classifyTrips\(trips, todayISO\)/);
  assert.match(page, /todayStopLabel\(row\?\.days, todayISO, nowHHMM\)/);
  assert.ok(!/geolocation|watchPosition|getCurrentPosition/.test(page + hero + prims), "GPS 를 읽지 않는다");
});

test("U3b (R1): 오늘·지금은 Asia/Seoul 시계 — UTC 날짜 문자열을 쓰지 않는다 (Trips 와 My Trip 이 같은 기준)", () => {
  const itin = read("src/app/itinerary/page.tsx");
  assert.match(page, /const todayISO = seoulClock\(\)\.todayISO/);
  assert.match(page, /const \{ nowHHMM \} = seoulClock\(\)/);
  assert.ok(!page.includes("toISOString().slice(0, 10)"), "my-trips 에 UTC 날짜가 남아 있다");
  assert.match(itin, /const todayISO\s+= seoulClock\(\)\.todayISO/);
  assert.ok(!itin.includes("toISOString().slice(0, 10)"), "itinerary 에 UTC 날짜가 남아 있다");
  assert.ok(!/now\.getHours\(\)/.test(page + itin), "브라우저 로컬 시각으로 nowHHMM 을 만들지 않는다");
});

test("U6 (R1): 데스크톱에서도 한 열 목록 — 기존 max-w-2xl 컨테이너 재사용", () => {
  assert.match(page, /<main className="[^"]*max-w-2xl[^"]*"/);
  assert.ok(!page.includes("maxWidth: SP.maxWidth"), "본문을 1280 까지 늘리지 않는다");
});

test("U4: 폐기된 표현이 돌아오지 않는다", () => {
  for (const bad of ['t("sectionArchive")', 't("newTripPlanHint")', 't("statTrips")', "getPersonality", "✈️", "📍", "📅", "👤", "🗑️", "fadeInUp"]) {
    assert.ok(!page.includes(bad), `page 에 ${bad} 가 남아 있다`);
  }
  assert.ok(!/Memory Archive|추억 보관함/.test(page));
});

test("U5: 기존 기능 보존 — 서버 삭제 뒤 목록 제거 + 이 여행의 로컬 캐시만 정리", () => {
  assert.match(page, /apiDeleteItinerary\(trip\.id, getDeviceId\(\)\)/);
  assert.match(page, /koreamate_moments_\$\{trip\.id\}/);
  assert.match(page, /k\.startsWith\("koreamate_itin3_id_"\) && localStorage\.getItem\(k\) === trip\.id/);
  assert.match(page, /apiFetchItinerariesByDevice\(getDeviceId\(\)\)/);
});

test("T1: 토큰은 DESIGN.md 값 그대로", () => {
  for (const [k, v] of Object.entries({ primary: "#001654", secondary: "#0041c9", surface: "#f8f9fa", onSurface: "#191c1d", onSurfaceVariant: "#444652", outlineVariant: "#c5c5d4", tertiaryContainer: "#631500", secondaryFixed: "#dce1ff" })) {
    assert.ok(tokens.includes(`${k}:`) && tokens.includes(`"${v}"`), `${k} ${v}`);
  }
  assert.match(tokens, /RADIUS_XL\s*=\s*8/);
  assert.match(tokens, /RADIUS_FULL\s*=\s*12/);
  assert.match(tokens, /HEADLINE_LG_MOBILE[^\n]*fontSize: 28/);
  assert.match(hero, /height: 280/);
});

test("L1: 새 키 4개 언어 parity — Memory 명칭 없음", () => {
  const keys = ["sectionTravelingNow", "sectionUpcoming", "newTrip", "pastTripsStory", "todayAt", "moreActions", "confirmDelete"];
  for (const l of ["en", "ko", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    for (const k of keys) assert.ok(typeof d.trips?.[k] === "string" && d.trips[k].trim() !== "", `${l}.trips.${k}`);
    assert.ok(d.trips.todayAt.includes("{place}"), `${l}: todayAt 에 {place}`);
    assert.ok(!/memor|추억|思い出|回忆/i.test(d.trips.pastTripsStory), `${l}: pastTripsStory 에 Memory 명칭`);
  }
});

test("R1: /trips route 를 만들지 않았다 — 404 는 의도된 계약", () => {
  assert.ok(!existsSync(new URL("src/app/trips/page.tsx", ROOT)));
  assert.ok(existsSync(new URL("src/app/my-trips/page.tsx", ROOT)));
});
