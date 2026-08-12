// My Places 사진 계약 테스트.
//
// 앞부분은 순수 로직(경로·한도·응답 메타·Storage 제거)을 직접 돌린다.
// 뒷부분은 endpoint 소스를 읽어 계약이 코드에 남아 있는지 확인한다 —
// 이 저장소의 guard 테스트와 같은 방식이다. 실제 HTTP 동작은 배포 후
// controlled QA 가 확인한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  USER_SPOT_PHOTO_DEVICE_LIMIT,
  makeUserSpotPhotoPath,
  isUserSpotPhotoQuotaExceeded,
  removeUserSpotPhoto,
  toPhotoMeta,
} from "./photo-core.ts";

const ROOT   = join(import.meta.dirname, "..", "..", "..");
const PHOTO  = readFileSync(join(ROOT, "functions/api/user-spots/[id]/photo.ts"), "utf8");
const URLFN  = readFileSync(join(ROOT, "functions/api/user-spots/[id]/photo-url.ts"), "utf8");
const SPOTID = readFileSync(join(ROOT, "functions/api/user-spots/[id].ts"), "utf8");
const LIST   = readFileSync(join(ROOT, "functions/api/user-spots.ts"), "utf8");
const MOMENT = readFileSync(join(ROOT, "functions/api/trip-moments/[momentId]/photo.ts"), "utf8");

/**
 * "이 토큰이 있으면 안 된다" 류 검사는 주석을 걷어내고 해야 한다.
 * 금지 사유를 주석에 적어 두면 그 설명 자체가 검사에 걸려 통과할 수 없다.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // 블록 주석
    .split(/\r?\n/)
    // 줄 주석. `$` 를 붙이지 않는다 — CRLF 파일에서는 줄 끝 \r 이 JS 정규식의
    // line terminator 라 `.*$` 가 매칭되지 않고 주석이 그대로 남는다.
    .map(l => l.replace(/(^|\s)\/\/.*/, ""))
    .join("\n");
}
const CODE = {
  photo:  code(PHOTO),
  url:    code(URLFN),
  spotId: code(SPOTID),
  list:   code(LIST),
  moment: code(MOMENT),
};

// ── 경로 ──────────────────────────────────────────────────────────────────────

test("storage path 는 user-spots/{spotId}/{uuid}.jpg", () => {
  const p = makeUserSpotPhotoPath("aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-1111-4111-8111-000000000002");
  assert.equal(p, "user-spots/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-1111-4111-8111-000000000002.jpg");
});

test("storage path 는 Moment namespace 와 겹치지 않는다", () => {
  const p = makeUserSpotPhotoPath("spot", "ver");
  assert.ok(p.startsWith("user-spots/"), "user-spots/ prefix 필요");
  // Moment 는 {itineraryId}/{momentId}/{uuid}.jpg — prefix 가 없다
  assert.ok(!/^[0-9a-f-]{36}\//i.test(p), "Moment 경로 형태와 구분되어야 한다");
});

test("path 조각은 전부 호출부가 넘긴 서버 값이다 — 파일명 입력 자리가 없다", () => {
  assert.equal(makeUserSpotPhotoPath.length, 2, "인자는 spotId·versionUuid 둘뿐");
});

// ── 수량 한도 ─────────────────────────────────────────────────────────────────

test("한도는 100", () => {
  assert.equal(USER_SPOT_PHOTO_DEVICE_LIMIT, 100);
});

test("신규 99장 → 100번째 허용, 100장 → 101번째 거부", () => {
  assert.equal(isUserSpotPhotoQuotaExceeded(false, 99),  false);
  assert.equal(isUserSpotPhotoQuotaExceeded(false, 100), true);
  assert.equal(isUserSpotPhotoQuotaExceeded(false, 101), true);
});

test("교체는 한도에 걸리지 않는다 — 파일 수가 늘지 않는다", () => {
  assert.equal(isUserSpotPhotoQuotaExceeded(true, 100),  false);
  assert.equal(isUserSpotPhotoQuotaExceeded(true, 9999), false);
});

// ── 응답 메타 ─────────────────────────────────────────────────────────────────

test("toPhotoMeta 는 boolean 두 개만 만든다", () => {
  const m = toPhotoMeta({ photo_storage_path: "user-spots/a/b.jpg", photo_public: true });
  assert.deepEqual(m, { has_photo: true, photo_public: true });
  assert.deepEqual(Object.keys(m).sort(), ["has_photo", "photo_public"]);
});

test("path 가 없거나 빈 문자열이면 has_photo=false", () => {
  assert.equal(toPhotoMeta({ photo_storage_path: null }).has_photo, false);
  assert.equal(toPhotoMeta({ photo_storage_path: "" }).has_photo,   false);
  assert.equal(toPhotoMeta({}).has_photo,                           false);
});

test("photo_public 은 명시적 true 일 때만 true", () => {
  assert.equal(toPhotoMeta({ photo_public: null }).photo_public,      false);
  assert.equal(toPhotoMeta({}).photo_public,                          false);
  assert.equal(toPhotoMeta({ photo_public: true }).photo_public,      true);
});

// ── Storage 제거 ──────────────────────────────────────────────────────────────

function fakeStorage(result: { data: unknown[] | null; error: unknown }) {
  const calls: string[][] = [];
  return {
    calls,
    from(bucket: string) {
      assert.equal(bucket, "moments", "private moments bucket 을 쓴다");
      return { async remove(paths: string[]) { calls.push(paths); return result as never; } };
    },
  };
}

test("정상 삭제는 null 을 준다", async () => {
  const s = fakeStorage({ data: [{}], error: null });
  assert.equal(await removeUserSpotPhoto(s, "user-spots/a/b.jpg"), null);
  assert.deepEqual(s.calls, [["user-spots/a/b.jpg"]]);
});

test("이미 없는 파일은 실패가 아니다 — 재시도가 path 정리를 끝낼 수 있어야 한다", async () => {
  const s = fakeStorage({ data: [], error: null });
  assert.equal(await removeUserSpotPhoto(s, "user-spots/a/b.jpg"), null);
});

test("Storage 오류는 그대로 실패", async () => {
  const s = fakeStorage({ data: null, error: { message: "boom" } });
  assert.equal(await removeUserSpotPhoto(s, "user-spots/a/b.jpg"), "boom");
});

// ── endpoint 계약 ─────────────────────────────────────────────────────────────

test("POST 는 Moment 와 같은 검증을 전부 거친다", () => {
  for (const fn of ["validateMimeType", "validatePhotoSize", "hasJpegSoi", "stripJpegApp1"]) {
    assert.ok(PHOTO.includes(fn), `POST 에 ${fn} 필요`);
  }
  assert.ok(PHOTO.includes("content-length"), "Content-Length 조기 거부 필요");
});

test("업로드는 upsert:false — 남의 파일 위에 쓰지 못한다", () => {
  assert.match(PHOTO, /upsert:\s*false/);
});

test("교체는 공개 동의를 물려받지 않는다", () => {
  // update 에 photo_public: false 가 함께 들어가야 한다
  assert.match(PHOTO, /photo_storage_path:\s*storagePath,[\s\S]{0,80}photo_public:\s*false/);
});

test("DB 갱신 실패 시 방금 올린 파일을 되돌린다", () => {
  assert.match(PHOTO, /rolling back[\s\S]{0,400}\.remove\(\[storagePath\]\)/);
});

test("DELETE 는 Storage 제거보다 먼저 공개 동의를 끈다", () => {
  const del      = PHOTO.slice(PHOTO.indexOf("onRequestDelete"));
  const consent  = del.indexOf("photo_public: false");
  const removeAt = del.indexOf("removeUserSpotPhoto");
  const clearAt  = del.indexOf("photo_storage_path: null");
  assert.ok(consent  >= 0 && removeAt >= 0 && clearAt >= 0, "세 단계가 모두 있어야 한다");
  assert.ok(consent  < removeAt, "STEP A(동의 OFF) 가 STEP B(Storage 제거) 보다 앞");
  assert.ok(removeAt < clearAt,  "STEP B 가 STEP C(path 비우기) 보다 앞");
});

test("사진 없는 DELETE 는 idempotent 하게 성공", () => {
  assert.match(PHOTO, /if \(!spot\.photo_storage_path\)[\s\S]{0,120}has_photo: false/);
});

test("어떤 응답에도 storage path 를 담지 않는다", () => {
  for (const [name, src] of [["photo.ts", PHOTO], ["photo-url.ts", URLFN], ["[id].ts", SPOTID], ["user-spots.ts", LIST]] as const) {
    // json(...) 안에 photo_storage_path 를 직접 넣는 곳이 없어야 한다
    const bad = code(src).match(/json\(\s*\{[^}]*photo_storage_path[^}]*\}/);
    assert.equal(bad, null, `${name}: 응답에 photo_storage_path 노출`);
  }
});

test("public URL 을 만들지 않는다", () => {
  for (const src of [CODE.photo, CODE.url, CODE.spotId, CODE.list]) {
    assert.ok(!src.includes("getPublicUrl"), "getPublicUrl 사용 금지");
    assert.ok(!/\/object\/public\//.test(src), "public object 경로 사용 금지");
  }
});

test("signed URL 만료는 Moment 와 같은 600초 상수를 쓴다", () => {
  assert.ok(URLFN.includes("PHOTO_URL_EXPIRES_IN"), "공용 상수 재사용");
  assert.ok(!/expiresIn\s*[:=]\s*\d+/.test(CODE.url), "만료값을 따로 적지 않는다");
});

test("소유권은 device_id 로만 판정하고 비소유자에게 존재를 알리지 않는다", () => {
  assert.ok(PHOTO.includes('.eq("device_id", deviceId)'), "photo.ts device 소유권");
  assert.ok(URLFN.includes('.eq("device_id", deviceId)'), "photo-url.ts device 소유권");
  assert.match(PHOTO, /if \(!data\) return json\(\{ error: "Not found" \}, 404\)/);
  assert.match(URLFN, /if \(!data\) return json\(\{ error: "Not found" \}, 404\)/);
});

test("My Place 삭제는 파일을 먼저 지운다", () => {
  const del      = SPOTID.slice(SPOTID.indexOf("onRequestDelete"));
  const removeAt = del.indexOf("removeUserSpotPhoto");
  const rowAt    = del.indexOf(".delete()");
  assert.ok(removeAt >= 0, "삭제 경로에 Storage 정리 필요");
  assert.ok(removeAt < rowAt, "Storage 제거가 행 삭제보다 앞이어야 orphan 이 안 남는다");
});

test("Moment photo endpoint 에 My Places 분기를 넣지 않았다", () => {
  assert.ok(!CODE.moment.includes("user_spots"),  "Moment endpoint 는 user_spots 를 모른다");
  assert.ok(!CODE.moment.includes("user-spots/"), "Moment endpoint 는 My Places 경로를 모른다");
});

test("legacy photo_url 계약은 그대로", () => {
  assert.ok(SPOTID.includes("row.photo_url = photoUrl"), "PUT 의 photo_url 처리 유지");
  assert.ok(LIST.includes("photo_url"),                   "목록 select 의 photo_url 유지");
});

test("photo_storage_path 는 사용자 입력으로 들어올 수 없다", () => {
  // PUT/POST 의 body 화이트리스트에 없어야 한다
  assert.ok(!/body\.photo_storage_path/.test(CODE.spotId), "PUT 에서 클라이언트 path 수용 금지");
  assert.ok(!/body\.photo_storage_path/.test(CODE.list),   "POST 에서 클라이언트 path 수용 금지");
  assert.ok(!/body\.photo_public/.test(CODE.spotId),       "PUT 에서 동의 플래그 직접 수정 금지");
  assert.ok(!/body\.photo_public/.test(CODE.list),         "POST 에서 동의 플래그 직접 수정 금지");
});

test("city_spots 를 건드리지 않는다", () => {
  for (const src of [CODE.photo, CODE.url, CODE.spotId, CODE.list]) {
    assert.ok(!src.includes("city_spots"), "사진 경로는 공개 테이블과 무관하다");
  }
});
