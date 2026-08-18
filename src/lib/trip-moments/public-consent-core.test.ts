// Memory 공개 선택과 장소 표시명의 규칙.
//
// 여기서 지키는 것은 두 가지다.
//   ① 여행을 공개해도 사진과 메모는 따라 나가지 않는다. 사용자가 Memory 를
//      하나씩 골라야 하고, 고를 때 동의를 확인한다.
//   ② 좌표 문자열이 장소 이름 자리에 들어가지 않는다. `location_label` 은
//      "35.18°N 129.08°E" 같은 값이고 그건 이름이 아니다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMORY_PUBLIC_CONSENT_VERSION, PLACE_NAME_MAX,
  normalizePlaceName, normalizeCitySpotId,
  parsePublicRequest, buildPublicPatch, consentScope,
} from "./public-consent-core.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

// ── 장소 이름 ────────────────────────────────────────────────────────────────
test("★장소는 적지 않아도 된다", () => {
  assert.deepEqual(normalizePlaceName(null),    { ok: true, placeName: null });
  assert.deepEqual(normalizePlaceName(""),      { ok: true, placeName: null });
  assert.deepEqual(normalizePlaceName("   "),   { ok: true, placeName: null });
});

test("★앞뒤 공백은 다듬고 값은 그대로 남긴다", () => {
  assert.deepEqual(normalizePlaceName("  Haeundae Beach "), { ok: true, placeName: "Haeundae Beach" });
  assert.deepEqual(normalizePlaceName("작은 카페"),          { ok: true, placeName: "작은 카페" });
});

test("★좌표 문자열은 장소 이름이 아니다", () => {
  for (const bad of ["35.18°N 129.08°E", "  35.1°N 129.0°E  ", "37°N 127°E"]) {
    const r = normalizePlaceName(bad);
    assert.equal(r.ok, false, bad);
  }
  // 좌표가 섞인 진짜 이름은 막지 않는다
  assert.equal(normalizePlaceName("35°N Cafe").ok, true);
});

test("★너무 길면 조용히 자르지 않고 거절한다", () => {
  assert.equal(normalizePlaceName("가".repeat(PLACE_NAME_MAX)).ok, true);
  assert.equal(normalizePlaceName("가".repeat(PLACE_NAME_MAX + 1)).ok, false);
  assert.equal(normalizePlaceName(123).ok, false);
});

// ── 공식 장소 id ─────────────────────────────────────────────────────────────
test("★공식 장소 id 는 선택 사항이고 형식을 지켜야 한다", () => {
  assert.deepEqual(normalizeCitySpotId(null),      { ok: true, citySpotId: null });
  assert.deepEqual(normalizeCitySpotId(undefined), { ok: true, citySpotId: null });
  assert.deepEqual(normalizeCitySpotId(4412),      { ok: true, citySpotId: 4412 });
  assert.deepEqual(normalizeCitySpotId("4412"),    { ok: true, citySpotId: 4412 });
  for (const bad of [0, -1, 1.5, "abc", {}, true]) {
    assert.equal(normalizeCitySpotId(bad).ok, false, String(bad));
  }
});

// ── 공개 켜기 / 끄기 ─────────────────────────────────────────────────────────
test("★동의 없이 공개로 켤 수 없다", () => {
  assert.deepEqual(parsePublicRequest({ is_public: true }),
    { ok: false, status: 400, error: "Consent required" });
  assert.deepEqual(parsePublicRequest({ is_public: true, consent: false }),
    { ok: false, status: 400, error: "Consent required" });
});

test("★읽은 동의 문구의 판본이 지금 판본과 같아야 한다", () => {
  assert.deepEqual(parsePublicRequest({ is_public: true, consent: true, consentVersion: "옛판본" }),
    { ok: false, status: 400, error: "Invalid consent version" });
  assert.deepEqual(
    parsePublicRequest({ is_public: true, consent: true, consentVersion: MEMORY_PUBLIC_CONSENT_VERSION }),
    { ok: true, isPublic: true });
});

test("★끌 때는 묻지 않는다 — 공개를 줄이는 방향이다", () => {
  assert.deepEqual(parsePublicRequest({ is_public: false }), { ok: true, isPublic: false });
});

test("★boolean 이 아니면 거절한다", () => {
  for (const bad of [{}, { is_public: "true" }, { is_public: 1 }, null, "x"]) {
    assert.equal(parsePublicRequest(bad).ok, false, JSON.stringify(bad));
  }
});

test("★동의 시각과 판본은 서버가 적는다 — 요청 값을 쓰지 않는다", () => {
  const now = "2026-08-18T00:00:00.000Z";
  assert.deepEqual(buildPublicPatch(true, now), {
    is_public: true, public_consent_at: now, public_consent_version: MEMORY_PUBLIC_CONSENT_VERSION,
  });
  // 끄면 기록을 지운다 — 다시 켜면 그때의 최신 판본을 새로 적는다 (커버와 같다)
  assert.deepEqual(buildPublicPatch(false, now), {
    is_public: false, public_consent_at: null, public_consent_version: null,
  });
});

// ── 동의 문구가 거짓말하지 않는다 ────────────────────────────────────────────
test("★실제로 담긴 것만 공개된다고 말한다", () => {
  assert.equal(consentScope(3, true),  "photos_and_memo");
  assert.equal(consentScope(3, false), "photos_only");
  assert.equal(consentScope(0, true),  "memo_only");
  assert.equal(consentScope(0, false), "nothing_yet");
  assert.equal(consentScope(NaN, false), "nothing_yet");
});

// ── 계약 회귀 (소스 기준) ────────────────────────────────────────────────────
test("★일반 메모 PATCH 로는 공개 여부를 바꿀 수 없다", () => {
  const core = strip(read("src", "lib", "trip-moments", "memo-patch-core.ts"));
  // **쓰는** 필드만 본다. 응답에 현재 상태를 함께 돌려주는 select 는 읽기라 괜찮다.
  const upd = core.slice(core.indexOf(".update({"), core.indexOf(".eq(\"moment_id\"", core.indexOf(".update({")));
  assert.doesNotMatch(upd, /is_public/, "메모 PATCH 가 공개 여부를 쓴다");
  assert.doesNotMatch(upd, /public_consent/);
  assert.match(core, /place_name:\s+placeRes\.placeName/);
  assert.match(core, /city_spot_id:\s+spotRes\.citySpotId/);
});

test("★공개 전환은 동의를 확인하는 전용 경로에서만 일어난다", () => {
  const route = strip(read("functions", "api", "trip-moments", "[momentId]", "public.ts"));
  assert.match(route, /parsePublicRequest/);
  assert.match(route, /buildPublicPatch/);
  assert.match(route, /new Date\(\)\.toISOString\(\)/);   // 시각은 서버가 만든다
  assert.match(route, /\.eq\("device_id", deviceId\)/);   // 소유권
  assert.doesNotMatch(route, /body\.public_consent_at|body\.consentAt/);
});

test("★Memory 생성은 공개 상태를 받지 않는다", () => {
  const idx = strip(read("functions", "api", "trip-moments", "index.ts"));
  assert.doesNotMatch(idx, /is_public:\s*(body|str|Boolean)/);
  // 공식 장소 id 는 서버가 실재를 확인한다
  assert.match(idx, /from\("city_spots"\)\.select\("id"\)/);
});

test("★공개 경로는 아직 Memory 를 내보내지 않는다", () => {
  const pub  = strip(read("src", "lib", "share", "public-story.ts"));
  const story = strip(read("functions", "api", "shared", "[id]", "story.ts"));
  for (const src of [pub, story]) {
    assert.doesNotMatch(src, /trip_moment/);
    assert.doesNotMatch(src, /place_name|public_consent/);
  }
  // 좌표 문자열은 어느 쪽에도 없다
  assert.doesNotMatch(pub, /location_label/);
});

test("★migration 은 더하기만 한다", () => {
  const sql = read("supabase", "migrations", "053_trip_moments_place_and_public_consent.sql")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS place_name\s+TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_consent_at/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_consent_version/);
  // 기존 행을 검사하지 않는다 — 운영에 is_public=true 인 행이 없다고 가정하지 않는다
  assert.match(sql, /NOT VALID/);
  for (const bad of [/\bUPDATE\b/i, /\bDELETE\s+FROM\b/i, /TRUNCATE/i, /DROP COLUMN/i,
                     /DROP TABLE/i, /GRANT/i, /DISABLE ROW LEVEL SECURITY/i,
                     /ALTER COLUMN/i]) {
    assert.doesNotMatch(sql, bad, String(bad));
  }
  // city_spot_id 를 새로 만들지 않는다 — 026 것을 쓴다
  assert.doesNotMatch(sql, /ADD COLUMN[^\n]*city_spot_id/);
});

test("★공개는 일정과 Memory 둘 다 참일 때만이라는 계약이 코드에 적혀 있다", () => {
  const core  = read("src", "lib", "trip-moments", "public-consent-core.ts");
  const route = read("functions", "api", "trip-moments", "[momentId]", "public.ts");
  for (const src of [core, route]) {
    assert.match(src, /itinerary\.is_public === true AND\s*\n?\s*\/\/\s*\*\*moment\.is_public === true|itinerary\.is_public === true[\s\S]{0,80}moment\.is_public === true/);
  }
});
