/**
 * stop-binding — 일정 stop ↔ Moment 안정 결합 (TASK-TRIP-MOMENT-STOP-BINDING-V1)
 * Run: node --experimental-strip-types --test src/lib/trip-moments/stop-binding.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stopCitySpotId, stopKeyOf, normalizeStopKey, isMissingColumnError } from "./stop-binding.ts";
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
  assert.match(src, /\.\.\.\(typeof citySpotId === "number" \? \{ city_spot_id: citySpotId \} : \{\}\)/);
  assert.match(src, /\.\.\.\(boundStopKey \? \{ stop_key: boundStopKey \} : \{\}\)/);
  assert.match(src, /const isBound\s*=\s*typeof citySpotId === "number" \|\| boundStopKey !== null/);
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
test("C1: per-stop 순간 남기기는 열쇠(stopKeyOf)가 있는 항목에만 — 숙소 등 출처 id 없는 항목은 자유 순간 경로로", () => {
  const page = read("src/app/itinerary/page.tsx");
  assert.match(page, /\(!shareId \|\| isOwner\) && itinId && stopKeyOf\(place\) !== null && \(/);
  assert.match(page, /stopKey: stopKeyOf\(place\)/);
  assert.match(page, /stopKey=\{captureStop\?\.stopKey \?\? null\}/);
});

test("C2: 서버는 stop_key(055)를 읽고 쓰되, 컬럼이 없으면 그것 없이 한 번 더 시도한다", () => {
  const idx = read("functions/api/trip-moments/index.ts");
  assert.match(idx, /MOMENT_COLS_055\s*=\s*`\$\{MOMENT_COLS\}, stop_key`/);
  assert.match(idx, /isMissingColumnError\(error\)\) \(\{ data, error \} = await listMoments\(MOMENT_COLS\)\)/);
  assert.match(idx, /normalizeStopKey\(body\.stop_key \?\? null\)/);
  assert.match(idx, /"stop_key" in row && isMissingColumnError\(error\)/);
  const mig = read("supabase/migrations/055_trip_moments_stop_key.sql");
  assert.match(mig, /ADD COLUMN IF NOT EXISTS stop_key TEXT/);
  assert.ok(!/DROP COLUMN|DROP TABLE|UPDATE public\.trip_moments|DELETE FROM/.test(mig.replace(/^--.*$/gm, "")), "additive only (롤백 안내는 주석)");
});

// ── 일반 열쇠 (TASK-STORY-GENERIC-STOP-IDENTITY-CLOSEOUT-V1) ─────────────────
test("K1: stopKeyOf — 출처별 열쇠 문법. 공식 장소·내 장소·행사는 있고, 숙소·mock 은 없다", () => {
  assert.equal(stopKeyOf({ place_id: "42", source: "city_spot" }), "city_spot:42");
  assert.equal(stopKeyOf({ place_id: "7d1b2f3a-0000-4000-8000-000000000009", source: "user_spot" }), "user_spot:7d1b2f3a-0000-4000-8000-000000000009");
  assert.equal(stopKeyOf({ sourceKey: "event:busan:f2026-01", source: "city_spot", place_id: "x" }), "event:busan:f2026-01", "있는 sourceKey 우선");
  assert.equal(stopKeyOf({ sourceKey: "local_info:busan:12" }), "local_info:busan:12");
  assert.equal(stopKeyOf({ source: "user_spot", place_id: "not-a-uuid" }), null);
  assert.equal(stopKeyOf({ place_id: "mock-food-z1", source: "city_spot" }), null);
  assert.equal(stopKeyOf({}), null, "숙소처럼 출처 id 가 없으면 null — 가짜 열쇠 금지");
  assert.equal(stopKeyOf({ sourceKey: "bogus:1 OR 1=1" }), null, "문법 밖 sourceKey 는 무시");
});

test("K2: normalizeStopKey — 서버 입력 검증 (빈 값=없음, 문법 밖=400 감)", () => {
  assert.deepEqual(normalizeStopKey(null), { ok: true, stopKey: null });
  assert.deepEqual(normalizeStopKey(""), { ok: true, stopKey: null });
  assert.deepEqual(normalizeStopKey(" user_spot:7d1b2f3a-0000-4000-8000-000000000009 "), { ok: true, stopKey: "user_spot:7d1b2f3a-0000-4000-8000-000000000009" });
  assert.equal(normalizeStopKey("city_spot:42").ok, true);
  assert.equal(normalizeStopKey(42).ok, false);
  assert.equal(normalizeStopKey("hotel:Nine Tree").ok, false);
  assert.equal(normalizeStopKey("city_spot:" + "9".repeat(200)).ok, false);
});

test("K3: isMissingColumnError — 055 미적용 환경 판정", () => {
  assert.equal(isMissingColumnError({ code: "42703" }), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'stop_key' column of 'trip_moments' in the schema cache" }), true);
  assert.equal(isMissingColumnError({ code: "23505" }), false);
  assert.equal(isMissingColumnError(null), false);
});

test("K4: user_spot 순간은 stop_key + Day 로 그 내 장소 항목을 개인화한다 (중복 0)", () => {
  const days = [{ dayNumber: 1, date: "2026-08-19", places: [
    { name: "Haeundae Beach", time: "10:00", place_id: "1", source: "city_spot", image: null },
    { name: "My Secret Spot", time: "13:00", place_id: "7d1b2f3a-0000-4000-8000-000000000009", source: "user_spot", image: null },
  ]}];
  const moments = [{ moment_id: "u1", day_number: 1, stop_key: "user_spot:7d1b2f3a-0000-4000-8000-000000000009", memo: "내 장소에서", photo_data: null }];
  const out = buildPrivateStoryDays(days, moments, CLOCK);
  assert.deepEqual(out[0]!.memories.map(m => m.id), ["stop-1-0", "u1"]);
  assert.equal(out[0]!.memories[1]!.placeName, "My Secret Spot");
  assert.equal(out[0]!.memories[1]!.memo, "내 장소에서");
});

test("K5: 옛 행(stop_key 없음)은 city_spot_id 로 계속 결합되고, 새 행은 stop_key 가 우선한다", () => {
  const legacy = { moment_id: "old", day_number: 1, city_spot_id: 1, memo: "옛 기록", photo_data: null };
  const fresh  = { moment_id: "new", day_number: 1, city_spot_id: 1, stop_key: "city_spot:1", memo: "새 기록", photo_data: null };
  const out = buildPrivateStoryDays(DAYS, [legacy, fresh], CLOCK);
  assert.deepEqual(out[0]!.memories.slice(0, 2).map(m => m.id), ["old", "new"]);
  assert.equal(out[0]!.memories.filter(m => m.placeName === "Haeundae Beach").length, 2, "두 순간 모두 해운대 항목(기본 항목 대체), 기본 항목 중복 없음");
});

test("K6: 순서 변경·시간 수정 뒤에도 결합은 열쇠+Day 로 유지된다 (index 무관)", () => {
  const days = [{ dayNumber: 1, date: "2026-08-19", places: [
    { name: "Burger in NY", time: "09:00", place_id: "267", source: "city_spot", image: null },          // 순서 바뀜
    { name: "My Secret Spot", time: "11:30", place_id: "7d1b2f3a-0000-4000-8000-000000000009", source: "user_spot", image: null }, // 시간 바뀜
    { name: "Haeundae Beach", time: "15:00", place_id: "1", source: "city_spot", image: null },
  ]}];
  const moments = [
    { moment_id: "u1", day_number: 1, stop_key: "user_spot:7d1b2f3a-0000-4000-8000-000000000009", memo: "내 장소", photo_data: null },
    { moment_id: "h1", day_number: 1, stop_key: "city_spot:1", city_spot_id: 1, memo: "해운대", photo_data: null },
  ];
  const out = buildPrivateStoryDays(days, moments, CLOCK);
  assert.deepEqual(out[0]!.memories.map(m => [m.id, m.placeName]), [["stop-1-0", "Burger in NY"], ["u1", "My Secret Spot"], ["h1", "Haeundae Beach"]]);
});

test("K7: 열쇠가 다른 Day 의 같은 장소에는 붙지 않는다 (stop_key 경로)", () => {
  const moments = [{ moment_id: "d1", day_number: 1, stop_key: "city_spot:1", memo: "낮", photo_data: null }];
  const out = buildPrivateStoryDays(DAYS, moments, CLOCK);
  assert.equal(out[0]!.memories[0]!.id, "d1");
  assert.equal(out[1]!.memories[0]!.id, "stop-2-0");
});
