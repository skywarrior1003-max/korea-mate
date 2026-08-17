// Memory 사진 목록 계산.
//
// 운영 데이터가 두 곳에 나뉘어 있다 — 예전부터 있던 `storage_path` 한 장과
// 새로 붙는 `trip_moment_photos`. 여기서 확인하는 것은 그 둘을 하나로 볼 때
// 순서·중복·개수·삭제 계획이 어긋나지 않는다는 것이다.
//
// DB 가 필요한 부분(실제 3장 저장, 실제 DELETE)은 migration 적용 후 2단계
// E2E 로 미룬다. 이 파일은 규칙만 못 박는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mergePhotoSet, sortChildPhotos, photoPathsToRemove, nextSortIndex,
  planLegacyPhotoDelete, totalPhotoCount, withinPhotoLimit, remainingSlots,
  LEGACY_PHOTO_ID, type ChildPhotoRow,
} from "./photo-set.ts";

const IT = "11111111-1111-4111-8111-111111111111";
const MO = "22222222-2222-4222-8222-222222222222";
const p  = (n: string) => `${IT}/${MO}/${n}.jpg`;
const row = (id: string, name: string, i?: number, at?: string): ChildPhotoRow =>
  ({ photo_id: id, storage_path: p(name), sort_index: i, created_at: at });

// ── A. legacy 한 장 ──────────────────────────────────────────────────────────
test("★사진이 한 장뿐인 예전 Memory 는 그대로 한 장이다", () => {
  const set = mergePhotoSet(p("old"), []);
  assert.equal(set.length, 1);
  assert.deepEqual(set[0], { id: LEGACY_PHOTO_ID, path: p("old"), isLegacy: true });
});

test("★사진이 없으면 빈 목록이다", () => {
  assert.deepEqual(mergePhotoSet(null, []), []);
  assert.deepEqual(mergePhotoSet("", []), []);
  assert.deepEqual(mergePhotoSet("   ", []), []);
});

// ── B. 합치기 ────────────────────────────────────────────────────────────────
test("★legacy 1장 + 추가 2장 = 3장, 첫 장이 맨 앞", () => {
  const set = mergePhotoSet(p("old"), [row("b", "two", 2), row("a", "one", 1)]);
  assert.equal(set.length, 3);
  assert.deepEqual(set.map(s => s.path), [p("old"), p("one"), p("two")]);
  assert.equal(set[0]!.isLegacy, true);
  assert.equal(set[1]!.isLegacy, false);
  assert.deepEqual(set.map(s => s.id), [LEGACY_PHOTO_ID, "a", "b"]);
});

test("★같은 파일이 두 번 나오지 않는다", () => {
  // 승격이 중간에 끊겨 child 가 legacy 와 같은 경로를 들고 있어도 한 번만 보인다
  const set = mergePhotoSet(p("old"), [row("dup", "old", 1), row("a", "one", 2)]);
  assert.deepEqual(set.map(s => s.path), [p("old"), p("one")]);
});

test("★legacy 가 없어도 추가 사진만으로 목록이 된다", () => {
  const set = mergePhotoSet(null, [row("a", "one", 1), row("b", "two", 2)]);
  assert.deepEqual(set.map(s => s.id), ["a", "b"]);
  assert.equal(set.every(s => !s.isLegacy), true);
});

test("★순서: sort_index → created_at → id", () => {
  const rows = [
    row("z", "z", 1, "2026-08-17T00:00:02Z"),
    row("a", "a", 1, "2026-08-17T00:00:01Z"),
    row("m", "m", 0, "2026-08-17T00:00:09Z"),
  ];
  assert.deepEqual(sortChildPhotos(rows).map(r => r.photo_id), ["m", "a", "z"]);
  // 같은 초에 들어와도 흔들리지 않는다
  const tie = [row("b", "b", 1, "T"), row("a", "a", 1, "T")];
  assert.deepEqual(sortChildPhotos(tie).map(r => r.photo_id), ["a", "b"]);
  // sort_index 가 비어 있어도 죽지 않는다
  assert.equal(sortChildPhotos([row("x", "x")]).length, 1);
});

// ── C. 여러 장 ───────────────────────────────────────────────────────────────
test("★한 Memory 에 사진이 여러 장 붙어도 Memory 는 하나다", () => {
  const rows = Array.from({ length: 11 }, (_, i) => row(`p${i}`, `n${i}`, i + 1));
  const set = mergePhotoSet(p("old"), rows);
  assert.equal(set.length, 12);
  assert.equal(new Set(set.map(s => s.path)).size, 12);
  assert.equal(nextSortIndex(rows), 12);
  assert.equal(nextSortIndex([]), 1);
});

// ── D. 개수 ──────────────────────────────────────────────────────────────────
test("★한도는 Memory 수가 아니라 실제 사진 수로 센다", () => {
  // 첫 장을 가진 Memory 10개 + 추가 사진 20장 = 30장
  assert.equal(totalPhotoCount(10, 20), 30);
  // 한 Memory 에 20장을 넣었다고 1로 세면 안 된다
  assert.equal(totalPhotoCount(1, 19), 20);
  assert.notEqual(totalPhotoCount(1, 19), 1);
  // 이상한 값에서 죽지 않는다
  assert.equal(totalPhotoCount(0, 0), 0);
  assert.equal(totalPhotoCount(-5, 3), 3);
  assert.equal(totalPhotoCount(NaN, 4), 4);
});

// ── E. 한도 ──────────────────────────────────────────────────────────────────
test("★한도에 닿으면 더 받지 않는다", () => {
  assert.equal(withinPhotoLimit(99, 100), true);
  assert.equal(withinPhotoLimit(100, 100), false);
  assert.equal(withinPhotoLimit(101, 100), false);
  assert.equal(remainingSlots(97, 100), 3);
  assert.equal(remainingSlots(100, 100), 0);
  assert.equal(remainingSlots(120, 100), 0);
});

// ── F. 한 장 삭제 ────────────────────────────────────────────────────────────
test("★추가 사진 한 장을 지워도 나머지와 Memory 는 그대로다", () => {
  const rows = [row("a", "one", 1), row("b", "two", 2)];
  const after = rows.filter(r => r.photo_id !== "a");
  const set = mergePhotoSet(p("old"), after);
  assert.deepEqual(set.map(s => s.path), [p("old"), p("two")]);
  // legacy 는 건드리지 않는다 — 표지도 그대로다
  assert.equal(set[0]!.isLegacy, true);
});

test("★첫 장을 지우면 다음 사진이 그 자리로 올라간다", () => {
  // 비우면 표지(cover_moment_id → storage_path)와 has_photo 가 함께 죽는다
  const plan = planLegacyPhotoDelete(p("old"), [row("a", "one", 1), row("b", "two", 2)]);
  assert.deepEqual(plan, { removePath: p("old"), nextLegacy: p("one"), promotedId: "a" });
});

test("★남은 사진이 없으면 첫 장 자리는 빈다", () => {
  assert.deepEqual(planLegacyPhotoDelete(p("old"), []),
    { removePath: p("old"), nextLegacy: null, promotedId: null });
});

test("★첫 장이 없으면 계획도 없다", () => {
  assert.equal(planLegacyPhotoDelete(null, [row("a", "one", 1)]), null);
});

test("★승격 대상은 legacy 와 같은 경로를 고르지 않는다", () => {
  const plan = planLegacyPhotoDelete(p("old"), [row("dup", "old", 1), row("a", "one", 2)]);
  assert.equal(plan?.nextLegacy, p("one"));
  assert.equal(plan?.promotedId, "a");
});

// ── G. Memory 전체 삭제 ──────────────────────────────────────────────────────
test("★Memory 를 지울 때 치울 파일이 하나도 빠지지 않는다", () => {
  const paths = photoPathsToRemove(p("old"), [row("a", "one", 1), row("b", "two", 2)]);
  assert.deepEqual(paths, [p("old"), p("one"), p("two")]);
  assert.deepEqual(photoPathsToRemove(null, []), []);
  assert.deepEqual(photoPathsToRemove(p("only"), []), [p("only")]);
});

// ── H·I·J. 계약 회귀 (소스 기준) ─────────────────────────────────────────────
const ROOT = process.cwd();
const read = (...q: string[]) => readFileSync(join(ROOT, ...q), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

test("★사진 경로는 서버가 만든다 — 요청 본문에서 받지 않는다", () => {
  for (const f of ["photos.ts"]) {
    const src = strip(read("functions", "api", "trip-moments", "[momentId]", f));
    assert.match(src, /makeStoragePath\(/, `${f}: 서버가 경로를 만들지 않는다`);
    assert.doesNotMatch(src, /body\.storage_path|body\.path/, `${f}: 클라이언트 경로를 받는다`);
  }
  const del = strip(read("functions", "api", "trip-moments", "[momentId]", "photos", "[photoId].ts"));
  assert.doesNotMatch(del, /body\.storage_path|body\.path/);
});

test("★새 사진 API 도 device 소유권을 확인한다", () => {
  for (const f of [["photos.ts"], ["photos", "[photoId].ts"]]) {
    const src = strip(read("functions", "api", "trip-moments", "[momentId]", ...f));
    assert.match(src, /x-device-id/,             `${f.join("/")}: device 헤더를 안 본다`);
    assert.match(src, /UUID_RE\.test\(deviceId\)/, `${f.join("/")}: device 형식을 안 본다`);
    assert.match(src, /\.eq\("device_id", deviceId\)/, `${f.join("/")}: 소유권 조건이 없다`);
    assert.doesNotMatch(src, /device_id:\s*(moment|row)\./, `${f.join("/")}: device_id 를 응답에 싣는다`);
  }
});

test("★사진 추가도 기존 검증 파이프라인을 그대로 지난다", () => {
  const src = strip(read("functions", "api", "trip-moments", "[momentId]", "photos.ts"));
  assert.match(src, /stripJpegApp1/,        "EXIF 제거를 건너뛴다");
  assert.match(src, /validatePhotoSize|MAX_PHOTO_BYTES/, "크기 검사를 건너뛴다");
  assert.match(src, /contentType:\s*"image\/jpeg"/, "MIME 을 고정하지 않는다");
  assert.match(src, /PHOTO_BUCKET/,         "다른 버킷에 넣는다");
});

test("★한도 검사가 실제 사진 수를 센다", () => {
  const upload = strip(read("functions", "api", "trip-moments", "[momentId]", "photo.ts"));
  const add    = strip(read("functions", "api", "trip-moments", "[momentId]", "photos.ts"));
  for (const [name, src] of [["photo.ts", upload], ["photos.ts", add]] as const) {
    assert.match(src, /trip_moment_photos/,  `${name}: 추가 사진을 세지 않는다`);
    assert.match(src, /totalPhotoCount\(/,   `${name}: 합산 규칙을 쓰지 않는다`);
  }
});

test("★Memory 를 지울 때 추가 사진도 함께 치운다", () => {
  const src = strip(read("functions", "api", "trip-moments", "[id].ts"));
  assert.match(src, /trip_moment_photos/, "추가 사진을 조회하지 않는다");
  assert.match(src, /photoPathsToRemove\(/);
  // Storage 를 먼저 치우고 DB 를 지운다 — 반대면 파일이 남는다
  assert.ok(src.indexOf("removeItineraryStorage") < src.indexOf('.delete()'),
    "DB 를 먼저 지운다 — Storage orphan 이 남는다");
});

test("★Copy 는 Memory 도 사진 테이블도 건드리지 않는다", () => {
  const src = strip(read("functions", "api", "itinerary", "copy.ts"));
  assert.doesNotMatch(src, /trip_moments/);
  assert.doesNotMatch(src, /trip_moment_photos/);
});

test("★공개 payload 에 사진 관계가 딸려 나가지 않는다", () => {
  for (const f of [["src", "lib", "share", "public-story.ts"],
                   ["functions", "api", "shared", "[id]", "story.ts"]]) {
    const src = strip(read(...f));
    assert.doesNotMatch(src, /trip_moment/, `${f.join("/")}: 사진 관계를 읽는다`);
  }
});

/**
 * FK 컬럼 타입은 **운영에 적용된** migration 에서 근거를 찾는다.
 *
 * 처음에 `moment_id UUID` 로 적었다가 SQL Editor 에서 42804 로 거부됐다.
 * 운영 `trip_moments.moment_id` 는 text 인데, 005(운영 테이블과 다른 옛 설계도)를
 * 보고 타입을 가져왔기 때문이다. 정작 근거는 저장소 안에 있었다 — 031 이
 * `cover_moment_id text` 로 같은 부모에 FK 를 걸었고 그건 운영에서 성공했다.
 *
 * 그래서 이 테스트는 "052 가 text 라고 적었는가" 가 아니라 **"031 이 쓴 타입과
 * 같은가"** 를 본다. 근거 파일이 바뀌면 이 검사도 따라 움직인다.
 */
test("★FK 컬럼 타입이 운영에서 증명된 부모 타입과 같다", () => {
  // 주석을 먼저 떼고 본다 — 설명 문장에 같은 이름이 나오면 엉뚱한 낱말을 집는다
  const m031 = read("supabase", "migrations", "031_add_itinerary_trip_cover.sql")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
  // 031 은 이 컬럼으로 trip_moments(moment_id) 에 FK 를 걸었고 운영에 적용됐다
  assert.match(m031, /REFERENCES public\.trip_moments\(moment_id\)/,
    "031 이 더 이상 부모 타입의 근거가 아니다 — 다른 근거를 찾아야 한다");
  const parentType = m031.match(/cover_moment_id\s+(\w+)/)?.[1]?.toLowerCase();
  assert.equal(parentType, "text", "031 의 선언이 바뀌었다");

  const sql = read("supabase", "migrations", "052_trip_moment_photos.sql")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
  const childType = sql.match(/moment_id\s+(\w+)\s+NOT NULL REFERENCES/)?.[1]?.toLowerCase();
  assert.equal(childType, parentType,
    `자식 moment_id(${childType}) 가 부모(${parentType}) 와 다르다 — FK 가 42804 로 거부된다`);

  // FK 가 없는 두 컬럼도 부모 타입을 모르므로 uuid 로 못 박지 않는다
  for (const col of ["itinerary_id", "device_id"]) {
    const t = sql.match(new RegExp(`${col}\\s+(\\w+)`))?.[1]?.toLowerCase();
    assert.equal(t, "text", `${col} 을 ${t} 로 선언했다 — 부모 타입을 모르는 채 맞힌 것이다`);
  }

  // 005 는 운영 테이블이 아니다. 여기서 타입을 가져오면 같은 실수를 반복한다.
  assert.match(read("supabase", "migrations", "005_trip_moments_schema.sql"),
    /moment_id\s+UUID/i, "005 가 바뀌었다 — 이 주의가 아직 유효한지 확인할 것");
});

test("★migration 은 기존 것을 건드리지 않는다", () => {
  const sql = read("supabase", "migrations", "052_trip_moment_photos.sql")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trip_moment_photos/);
  assert.match(sql, /REFERENCES public\.trip_moments\(moment_id\) ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /storage_path TEXT\s+NOT NULL UNIQUE/);
  for (const bad of [/ALTER TABLE public\.trip_moments/i, /DROP TABLE/i, /DROP COLUMN/i,
                     /\bUPDATE\b/i, /\bDELETE\s+FROM\b/i, /TRUNCATE/i]) {
    assert.doesNotMatch(sql, bad, String(bad));
  }
  // anon·authenticated 에 열지 않는다
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.trip_moment_photos FROM anon;/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.trip_moment_photos FROM authenticated;/);
  assert.doesNotMatch(sql, /GRANT[^\n]*trip_moment_photos[^\n]*TO\s+(anon|authenticated|PUBLIC)/i);
});
