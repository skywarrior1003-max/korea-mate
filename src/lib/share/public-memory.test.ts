// 공개 Story 로 무엇이 나가고 무엇이 막히는가.
//
// 여기서 지키는 것
//   ① 여행 공개만으로 Memory 가 따라 나가지 않는다. 고른 것 + 동의 판본이
//      맞는 것만 나간다.
//   ② 나가는 객체에는 저장 경로·내부 id·좌표가 **자리 자체가 없다**.
//      이름만 검사하지 않고 실제 직렬화 결과 문자열도 훑는다.
//   ③ 사진 순서는 소유자 화면과 같은 규칙을 쓴다. 따로 만들지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  serializePublicMemories, isMemoryPublic, orderMemories,
  photoRef, isPhotoRef, PUBLIC_MEMORY_SELECT_COLUMNS,
  type InternalMemoryRow,
} from "./public-memory.ts";
import { MEMORY_PUBLIC_CONSENT_VERSION } from "../trip-moments/public-consent-core.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const IT = "11111111-1111-4111-8111-111111111111";
const OTHER_IT = "99999999-9999-4999-8999-999999999999";
const MO = (n: number) => `2222222${n}-2222-4222-8222-222222222222`;
const path = (m: string, n: string) => `${IT}/${m}/${n}.jpg`;

const row = (o: Partial<InternalMemoryRow> & { moment_id: string }): InternalMemoryRow => ({
  memo: null, place_name: null, city_spot_id: null, day_number: 1,
  captured_at: "2026-08-18T00:00:00Z", storage_path: null,
  is_public: true, public_consent_at: "2026-08-18T00:00:00Z",
  public_consent_version: MEMORY_PUBLIC_CONSENT_VERSION, ...o,
});

const ser = (rows: InternalMemoryRow[], photos?: Map<string, string[]>, valid?: Set<number>) =>
  serializePublicMemories({
    itineraryId: IT, rows,
    photoPathsByMoment: photos ?? new Map(),
    consentVersion: MEMORY_PUBLIC_CONSENT_VERSION,
    validCitySpotIds: valid,
  });

// ── 나갈 자격 ────────────────────────────────────────────────────────────────
test("★고르지 않은 Memory 는 나가지 않는다", async () => {
  assert.equal(isMemoryPublic(row({ moment_id: MO(1), is_public: false }), MEMORY_PUBLIC_CONSENT_VERSION), false);
  assert.equal(isMemoryPublic(row({ moment_id: MO(1), is_public: null }),  MEMORY_PUBLIC_CONSENT_VERSION), false);
  assert.deepEqual(await ser([row({ moment_id: MO(1), is_public: false })]), []);
});

test("★동의 기록이 없으면 나가지 않는다", async () => {
  const r = row({ moment_id: MO(1), public_consent_at: null });
  assert.equal(isMemoryPublic(r, MEMORY_PUBLIC_CONSENT_VERSION), false);
  assert.deepEqual(await ser([r]), []);
});

test("★옛 판본에 동의한 것은 지금 동의로 치지 않는다", async () => {
  const r = row({ moment_id: MO(1), public_consent_version: "memory-public-v0" });
  assert.equal(isMemoryPublic(r, MEMORY_PUBLIC_CONSENT_VERSION), false);
  assert.deepEqual(await ser([r]), []);
});

test("★고르고 동의 판본이 맞으면 나간다", async () => {
  const out = await ser([row({ moment_id: MO(1), memo: "좋았다", place_name: "해운대" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.memo, "좋았다");
  assert.equal(out[0]!.placeName, "해운대");
});

test("★하나도 공개가 아니면 빈 목록이고 오류가 아니다", async () => {
  assert.deepEqual(await ser([]), []);
  assert.deepEqual(await ser([row({ moment_id: MO(1), is_public: false })]), []);
});

// ── 장소 ─────────────────────────────────────────────────────────────────────
test("★장소가 없으면 없는 채로 나간다 — 좌표로 떨어지지 않는다", async () => {
  const out = await ser([row({ moment_id: MO(1), place_name: null })]);
  assert.equal(out[0]!.placeName, null);
  assert.ok(!PUBLIC_MEMORY_SELECT_COLUMNS.includes("location_label"));
  assert.ok(!PUBLIC_MEMORY_SELECT_COLUMNS.includes("lat"));
  assert.ok(!PUBLIC_MEMORY_SELECT_COLUMNS.includes("lng"));
});

test("★빈 문자열 장소·메모는 null 로 다듬는다", async () => {
  const out = await ser([row({ moment_id: MO(1), place_name: "   ", memo: "  " })]);
  assert.equal(out[0]!.placeName, null);
  assert.equal(out[0]!.memo, null);
});

test("★공식 장소일 때만 열쇠가 붙는다", async () => {
  const a = await ser([row({ moment_id: MO(1), city_spot_id: 4412 })], undefined, new Set([4412]));
  assert.equal(a[0]!.placeId, "4412");
  const b = await ser([row({ moment_id: MO(1), city_spot_id: null })]);
  assert.equal(b[0]!.placeId, null);
});

test("★사라진 공식 장소는 열쇠만 빠지고 Story 는 그대로다", async () => {
  const out = await ser([row({ moment_id: MO(1), city_spot_id: 4412, memo: "그대로" })],
                        undefined, new Set());
  assert.equal(out.length, 1);
  assert.equal(out[0]!.placeId, null);
  assert.equal(out[0]!.memo, "그대로");
});

// ── 순서 ─────────────────────────────────────────────────────────────────────
test("★순서가 매번 같다 — day → 찍은 시각 → id", () => {
  const rows = [
    row({ moment_id: MO(3), day_number: 2, captured_at: "2026-08-19T01:00:00Z" }),
    row({ moment_id: MO(1), day_number: 1, captured_at: "2026-08-18T09:00:00Z" }),
    row({ moment_id: MO(2), day_number: 1, captured_at: "2026-08-18T07:00:00Z" }),
  ];
  assert.deepEqual(orderMemories(rows).map(r => r.moment_id), [MO(2), MO(1), MO(3)]);
  const tie = [row({ moment_id: MO(5), captured_at: "T" }), row({ moment_id: MO(4), captured_at: "T" })];
  assert.deepEqual(orderMemories(tie).map(r => r.moment_id), [MO(4), MO(5)]);
});

test("★day 가 없는 기억은 버리지 않고 맨 뒤에 둔다", () => {
  const rows = [
    row({ moment_id: MO(1), day_number: null }),
    row({ moment_id: MO(2), day_number: 2 }),
    row({ moment_id: MO(3), day_number: 1 }),
  ];
  assert.deepEqual(orderMemories(rows).map(r => r.moment_id), [MO(3), MO(2), MO(1)]);
});

// ── 사진 ─────────────────────────────────────────────────────────────────────
test("★사진 순서는 준 순서 그대로다 — 소유자 화면과 같은 규칙을 쓴다", async () => {
  const m = MO(1);
  const paths = [path(m, "first"), path(m, "a"), path(m, "b")];
  const out = await ser([row({ moment_id: m })], new Map([[m, paths]]));
  assert.equal(out[0]!.photos.length, 3);
  const refs = await Promise.all(paths.map(p => photoRef(IT, m, p)));
  assert.deepEqual(out[0]!.photos.map(p => p.ref), refs);
});

test("★사진 없는 Memory 도 정상이다", async () => {
  const out = await ser([row({ moment_id: MO(1), memo: "글만" })]);
  assert.deepEqual(out[0]!.photos, []);
});

// ── 사진 주소 ────────────────────────────────────────────────────────────────
test("★사진 주소로는 아무것도 복원되지 않는다", async () => {
  const m = MO(1), p = path(m, "secret-file-name");
  const ref = await photoRef(IT, m, p);
  assert.ok(isPhotoRef(ref));
  assert.equal(ref.length, 32);
  for (const secret of [p, m, IT, "secret-file-name", ".jpg"]) {
    assert.ok(!ref.includes(secret), secret);
  }
});

test("★같은 입력이면 같은 값, 하나라도 다르면 다른 값", async () => {
  const m = MO(1), p = path(m, "x");
  assert.equal(await photoRef(IT, m, p), await photoRef(IT, m, p));
  assert.notEqual(await photoRef(IT, m, p), await photoRef(OTHER_IT, m, p));
  assert.notEqual(await photoRef(IT, m, p), await photoRef(IT, MO(2), p));
  assert.notEqual(await photoRef(IT, m, p), await photoRef(IT, m, path(m, "y")));
});

test("★모양이 아닌 값은 DB 를 건드리기 전에 걸러진다", () => {
  for (const bad of ["", "x", "ABCDEF", "../../etc/passwd", IT,
                     "0".repeat(31), "0".repeat(33), "g".repeat(32), null, 1, {}]) {
    assert.equal(isPhotoRef(bad), false, String(bad));
  }
  assert.equal(isPhotoRef("0123456789abcdef0123456789abcdef"), true);
});

// ── 금지 필드 — 실제 직렬화 결과를 훑는다 ────────────────────────────────────
test("★나가는 객체에 내부 값이 하나도 없다", async () => {
  const m = MO(1);
  const rows = [row({
    moment_id: m, memo: "메모", place_name: "장소", city_spot_id: 4412,
    day_number: 2, captured_at: "2026-08-18T09:30:00Z",
    storage_path: path(m, "legacy"),
  })];
  const out = await ser(rows, new Map([[m, [path(m, "legacy"), path(m, "child")]]]), new Set([4412]));
  const raw = JSON.stringify(out);

  for (const secret of [m, IT, path(m, "legacy"), "legacy", "child",
                        "2026-08-18T09:30:00Z", MEMORY_PUBLIC_CONSENT_VERSION]) {
    assert.ok(!raw.includes(secret), `값이 샌다: ${secret}`);
  }
  for (const field of ["moment_id", "photo_id", "itinerary_id", "device_id",
                       "lat", "lng", "location_label", "storage_path", "sourceKey",
                       "user_spot", "address", "captured_at", "consent",
                       "public_consent_at", "public_consent_version", "is_public"]) {
    assert.ok(!raw.includes(field), `이름이 샌다: ${field}`);
  }
  assert.deepEqual(Object.keys(out[0]!).sort(),
    ["dayNumber", "memo", "photos", "placeId", "placeName"].sort());
  assert.deepEqual(Object.keys(out[0]!.photos[0]!), ["ref"]);
});

// ── 소스 계약 ────────────────────────────────────────────────────────────────
test("★DB 행을 펼쳐 보내지 않는다", () => {
  const core = strip(read("src", "lib", "share", "public-memory.ts"));
  assert.doesNotMatch(core, /\.\.\.(row|r|moment|photo)\b/);
  assert.doesNotMatch(core, /location_label/);
});

test("★이미지 프록시는 매 요청 세 가지를 다시 본다", () => {
  const px = strip(read("functions", "img", "memory", "[itineraryId]", "[ref].ts"));
  assert.match(px, /\.eq\("is_public", true\)[\s\S]{0,400}maybeSingle/);
  assert.match(px, /\.eq\("itinerary_id", itineraryId\)[\s\S]{0,120}\.eq\("is_public", true\)/);
  assert.match(px, /isMemoryPublic\(r, MEMORY_PUBLIC_CONSENT_VERSION\)/);
  assert.match(px, /mergePhotoSet\(/);
});

test("★프록시는 경로를 요청에서 받지 않는다 — 임의 파일을 집어 올 수 없다", () => {
  const px = strip(read("functions", "img", "memory", "[itineraryId]", "[ref].ts"));
  assert.match(px, /isPhotoRef\(ref\)/);
  assert.doesNotMatch(px, /body\.path|searchParams\.get\("path"\)/);
  assert.match(px, /\.download\(match\)/);
});

test("★프록시는 기기 인증을 요구하지 않고 소유자 API 를 열지도 않는다", () => {
  const px = strip(read("functions", "img", "memory", "[itineraryId]", "[ref].ts"));
  assert.doesNotMatch(px, /x-device-id/);
  const owner = strip(read("functions", "api", "trip-moments", "[momentId]", "photos.ts"));
  assert.match(owner, /x-device-id/);
  assert.match(owner, /\.eq\("device_id", deviceId\)/);
});

test("★프록시는 막힌 이유를 구분해 알려 주지 않는다", () => {
  const px = strip(read("functions", "img", "memory", "[itineraryId]", "[ref].ts"));
  assert.match(px, /function notFound\(\)/);
  assert.ok((px.match(/return notFound\(\);/g) ?? []).length >= 6);
  assert.match(px, /"Content-Type":\s+"image\/jpeg"/);
  assert.match(px, /"X-Content-Type-Options": "nosniff"/);
  assert.match(px, /s-maxage=60/);
  assert.doesNotMatch(px, /max-age=31536000|immutable/);
});

test("★Storage 는 계속 비공개다", () => {
  const px = strip(read("functions", "img", "memory", "[itineraryId]", "[ref].ts"));
  assert.match(px, /\.download\(/);
  assert.doesNotMatch(px, /createSignedUrl|getPublicUrl/);
  const core = strip(read("src", "lib", "share", "public-memory.ts"));
  assert.doesNotMatch(core, /createSignedUrl|getPublicUrl|signedUrl/);
});

test("★공개 story 응답은 기존 필드를 그대로 두고 memories 만 더한다", () => {
  const story = strip(read("functions", "api", "shared", "[id]", "story.ts"));
  assert.match(story, /\{ \.\.\.itinerary, memories/);
  assert.match(story, /serializePublicItinerary\(data\)/);
  assert.match(story, /memories: \[\]/);
  assert.match(story, /\.eq\("is_public", true\)/);
});

test("★공개 일정 정제기는 여전히 Memory 를 모른다", () => {
  const pub = strip(read("src", "lib", "share", "public-story.ts"));
  assert.doesNotMatch(pub, /trip_moment|memories|place_name|public_consent/);
});
