/**
 * stop-binding — 일정 stop ↔ Moment 안정 결합 (TASK-TRIP-MOMENT-STOP-BINDING-V1)
 * Run: node --experimental-strip-types --test src/lib/trip-moments/stop-binding.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stopCitySpotId } from "./stop-binding.ts";
import { buildPrivateStoryDays } from "../share/private-story-adapter.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

test("B1: 공식 장소(city_spot + 숫자 place_id) → city_spot_id", () => {
  assert.equal(stopCitySpotId({ place_id: "42", source: "city_spot" }), 42);
  assert.equal(stopCitySpotId({ place_id: " 7 ", source: "city_spot" }), 7);
});

test("B2: 내 장소·비공식·비숫자 id 는 null — 가짜 id 를 만들지 않는다", () => {
  assert.equal(stopCitySpotId({ place_id: "uuid-1234", source: "user_spot" }), null);
  assert.equal(stopCitySpotId({ place_id: "42", source: "user_spot" }), null);
  assert.equal(stopCitySpotId({ place_id: "mock-food-z1", source: "city_spot" }), null);
  assert.equal(stopCitySpotId({ place_id: "0", source: "city_spot" }), null);
  assert.equal(stopCitySpotId({}), null);
});

// ── Story 결합 계약 (어댑터와 함께) ────────────────────────────────────────────
const CLOCK = { todayISO: "2026-09-01", nowHHMM: "12:00", isPast: true };
const DAYS = [
  { dayNumber: 1, date: "2026-08-19", places: [
    { name: "Haeundae Beach", time: "10:00", place_id: "1", source: "city_spot", image: null },
    { name: "Burger in NY",   time: "12:30", place_id: "267", source: "city_spot", image: null },
  ]},
  { dayNumber: 2, date: "2026-08-20", places: [
    { name: "Haeundae Beach", time: "18:00", place_id: "1", source: "city_spot", image: null }, // 같은 장소 재방문
  ]},
];

test("B3: stop 에서 남긴 순간(city_spot_id + Day)은 그 장소 항목을 개인화하고 중복 항목이 생기지 않는다", () => {
  const moments = [{ moment_id: "m1", day_number: 1, city_spot_id: stopCitySpotId(DAYS[0]!.places[0]!),
    memo: "첫 바다", photo_data: "data:image/jpeg;base64,A", photo_data_extra: ["data:image/jpeg;base64,B", "data:image/jpeg;base64,C"] }];
  const out = buildPrivateStoryDays(DAYS, moments, CLOCK);
  const d1 = out[0]!.memories;
  assert.equal(d1.filter(m => m.placeName === "Haeundae Beach").length, 1, "baseline + 개인 항목 중복 금지");
  assert.equal(d1[0]!.id, "m1");
  assert.equal(d1[0]!.photos.length, 3, "다중 사진이어도 관계는 Moment 하나");
  assert.equal(d1[1]!.placeName, "Burger in NY", "다른 stop 은 baseline 유지");
});

test("B4: 같은 장소를 다른 Day 에 두 번 — Day 1 의 순간이 Day 2 에 붙지 않는다", () => {
  const moments = [{ moment_id: "m1", day_number: 1, city_spot_id: 1, memo: "낮", photo_data: null }];
  const out = buildPrivateStoryDays(DAYS, moments, CLOCK);
  assert.equal(out[0]!.memories[0]!.id, "m1");
  assert.equal(out[1]!.memories[0]!.id, "stop-2-0", "Day 2 의 해운대는 baseline 그대로");
});

test("B5: Free Moment(city_spot_id 없음)는 독립 항목으로 남고 baseline 도 남는다", () => {
  const moments = [{ moment_id: "free", day_number: 1, place_name: "Haeundae Beach", city_spot_id: null, memo: "자유", photo_data: null }];
  const out = buildPrivateStoryDays(DAYS, moments, CLOCK);
  assert.deepEqual(out[0]!.memories.map(m => m.id), ["stop-1-0", "stop-1-1", "free"]);
});

// ── 경로 가드 ────────────────────────────────────────────────────────────────
test("G1: Capture 는 stop 의 city_spot_id 를 숨은 관계로 싣고 장소명을 prefill 한다", () => {
  const src = read("src/components/TripMomentCapture.tsx");
  assert.match(src, /citySpotId\?:\s*number \| null/);
  assert.match(src, /initialPlaceName\?:\s*string \| null/);
  assert.match(src, /city_spot_id: citySpotId/);
  assert.match(src, /useState\(\(\) => \(initialPlaceName \?\? ""\)\.trim\(\)\)/);
});

test("G2: 일정 장소 카드에 순간 남기기 진입이 있고 stopCitySpotId 로 열쇠를 만든다", () => {
  const page = read("src/app/itinerary/page.tsx");
  assert.match(page, /stopCitySpotId\(place\)/);
  assert.match(page, /citySpotId=\{captureStop\?\.citySpotId \?\? null\}/);
  assert.match(page, /initialPlaceName=\{captureStop\?\.placeName \?\? null\}/);
});

test("G3: 서버 POST 는 city_spot_id 를 그대로 보낸다 (기존 경로)", () => {
  const st = read("src/lib/trip-moments/storage.ts");
  assert.match(st, /\.\.\.\(m\.city_spot_id \? \{ city_spot_id: m\.city_spot_id \} : \{\}\)/);
});

// ── R1: 표시 장소명과 city_spot_id 가 어긋날 수 없다 ──────────────────────────
test("R1: 결합된 Capture 는 장소 입력을 그리지 않고 stop 이름을 읽기 전용으로 보여 준다", () => {
  const src = read("src/components/TripMomentCapture.tsx");
  assert.match(src, /const isBound\s*=\s*typeof citySpotId === "number"/);
  assert.match(src, /isBound \? \(/, "결합 시 읽기 전용 분기");
  assert.match(src, /data-bound-place="true"/);
  // 저장 시에도 입력값이 아니라 stop 이름을 쓴다 — 관계와 이름이 한 쌍으로 움직인다
  assert.match(src, /place_name: isBound \? boundPlaceName : placeName\.trim\(\)/);
  assert.match(src, /\.\.\.\(isBound \? \{ city_spot_id: citySpotId as number \} : \{\}\)/);
});

test("R2: 자유 순간(citySpotId 없음)은 장소 입력이 그대로 편집 가능하다", () => {
  const src = read("src/components/TripMomentCapture.tsx");
  assert.match(src, /onChange=\{e => setPlaceName\(e\.target\.value\)\}/);
  assert.match(src, /t\("placeBound"\)/);
  for (const l of ["en", "ko", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as { memo: Record<string, string> };
    assert.ok(d.memo.placeBound && d.memo.placeBound.trim() !== "", `${l}.memo.placeBound`);
  }
});

// ── CLOSEOUT: 결합 불가 stop 에는 per-stop 진입을 열지 않는다 ─────────────────
test("C1: per-stop 순간 남기기는 공식 장소(city_spot)에만 — 내 장소·숙소는 자유 순간 경로로", () => {
  const page = read("src/app/itinerary/page.tsx");
  assert.match(page, /\(!shareId \|\| isOwner\) && itinId && stopCitySpotId\(place\) !== null && \(/);
});

test("C2: trip_moments 에는 city_spot_id 외의 stop 정체 컬럼이 없다 (migration 전 결합 불가 사실 고정)", () => {
  const idx = read("functions/api/trip-moments/index.ts");
  const selectLine = idx.match(/\.select\("(moment_id, itinerary_id[^"]+)"\)/)?.[1] ?? "";
  assert.ok(selectLine.includes("city_spot_id"));
  assert.ok(!/stop_key|source_key|user_spot_id/.test(selectLine), "stop_key 류 컬럼이 생기면 이 가드와 결합 규칙을 함께 갱신한다");
});
