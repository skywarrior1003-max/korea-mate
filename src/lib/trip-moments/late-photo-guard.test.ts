// 추가 사진 단독 수정 — 늦게 올라온 사진의 공개 범위·업로드 허용 표시·운영 정지·같은 사진 재전송 (2026-10-02)
// node --experimental-strip-types --test src/lib/trip-moments/late-photo-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { consentedChildPhotos } from "../share/public-memory.ts";
import { photoContentKey } from "./photo-set.ts";
import { guardAllowsUpload, LATE_PHOTO_GUARD_HEADER, EXTRA_PHOTO_SWITCH_KEY } from "./late-photo-guard.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

test("공개 동의 뒤에 올라온 추가 사진은 공개하지 않는다(시각을 모르면 막는다)", () => {
  const kids = [
    { id: "before", created_at: "2026-10-02T05:00:00.000+00:00" },
    { id: "same",   created_at: "2026-10-02T06:00:00.000+00:00" },
    { id: "after",  created_at: "2026-10-02T06:00:00.001+00:00" },
    { id: "nil",    created_at: null },
  ];
  assert.deepEqual(consentedChildPhotos(kids, "2026-10-02T06:00:00.000Z").map(k => k.id), ["before", "same"]);
  assert.deepEqual(consentedChildPhotos(kids, null), []);
});

test("공개 경로 셋(공개 Story·사진 주소·커뮤니티 대표 사진)이 모두 같은 규칙을 쓴다", () => {
  for (const f of [["functions", "api", "shared", "[id]", "story.ts"], ["functions", "img", "memory", "[itineraryId]", "[ref].ts"], ["src", "lib", "community", "recommendations-server.ts"]]) {
    assert.match(read(...f), /mergePhotoSet\(r\.storage_path, consentedChildPhotos\(childByMoment\.get\(r\.moment_id\) \?\? \[\], r\.public_consent_at\)\)/, f.join("/"));
  }
});

test("첫 사진을 지운 공개 기록에 동의 뒤 사진만 남으면 첫 자리로 올리되 비공개로 돌린다", () => {
  const d = read("functions", "api", "trip-moments", "[momentId]", "photos", "[photoId].ts");
  assert.match(d, /consentedChildPhotos\(\[promotedRow\], pub\.public_consent_at\)\.length === 0/);
  assert.match(d, /buildPublicPatch\(false, new Date\(\)\.toISOString\(\)\)/);
});

test("업로드 허용 표시 — 목록·추가 사진 응답에 단다, 정지면 0·503, 표시 없는 서버에는 앱이 올리지 않는다", () => {
  assert.equal(LATE_PHOTO_GUARD_HEADER, "x-gkm-late-photo-guard");
  assert.equal(EXTRA_PHOTO_SWITCH_KEY, "moment_extra_photos");
  assert.equal(guardAllowsUpload("1"), true);
  for (const v of ["0", null, undefined, "", "true"]) assert.equal(guardAllowsUpload(v), false, String(v));
  const list = read("functions", "api", "trip-moments", "index.ts");
  assert.match(list, /res\.headers\.set\(LATE_PHOTO_GUARD_HEADER, \(await extraPhotosPaused\(ctx\.env\)\) \? "0" : "1"\);/);
  const post = read("functions", "api", "trip-moments", "[momentId]", "photos.ts");
  assert.match(post, /code: "PAUSED" \}, 503\);\n\s+r\.headers\.set\(LATE_PHOTO_GUARD_HEADER, "0"\);/);
  assert.match(post, /const r = await postExtraPhoto\(ctx\);\n\s+r\.headers\.set\(LATE_PHOTO_GUARD_HEADER, "1"\);/);
  const st = read("src", "lib", "trip-moments", "storage.ts");
  assert.match(st, /latePhotoGuard = guardAllowsUpload\(res\.headers\?\.get\?\.\(LATE_PHOTO_GUARD_HEADER\)\);/);
  assert.match(st, /if \(!\(await refreshLatePhotoGuard\(itinId, deviceId\)\)\) return 0;/, "올리기 직전에 다시 묻는다");
  assert.match(st, /if \(!latePhotoGuard\) break;/);
  // 첫 사진(/photo)은 정지·표시와 무관 — 기존 저장 경로 그대로
  assert.doesNotMatch(read("functions", "api", "trip-moments", "[momentId]", "photo.ts"), /extraPhotosPaused|LATE_PHOTO_GUARD/);
});

test("소유자 화면 — 아직 공개되지 않은 장수와 같은 동의 창(자동 공개 없음)", () => {
  assert.match(read("functions", "api", "trip-moments", "index.ts"), /public_pending_photos: pending/);
  const tl = read("src", "components", "TripMomentTimeline.tsx");
  assert.match(tl, /data-moment-public-pending/);
  assert.match(tl, /onClick=\{\(\) => openConsent\(m\)\}/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read("src", "messages", `${l}.json`)).memo;
    assert.ok(m.publicPendingPhotos && m.publicPendingConfirm, l);
  }
});

test("같은 기록·같은 바이트 = 같은 저장 이름 · 이미 저장된 사진은 한도 판정 전에 200(duplicate)", async () => {
  const b = new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]);
  assert.equal(await photoContentKey("m-1", b), await photoContentKey("m-1", b.slice()));
  assert.notEqual(await photoContentKey("m-1", b), await photoContentKey("m-2", b));
  const p = read("functions", "api", "trip-moments", "[momentId]", "photos.ts");
  const post = p.slice(p.indexOf("async function postExtraPhoto"));
  const dup = post.indexOf("if (dup) return json({ ...dup, duplicate: true }, 200);");
  assert.ok(dup > 0 && dup < post.indexOf("DEVICE_PHOTO_LIMIT") && dup < post.indexOf(".upload(storagePath"));
  assert.doesNotMatch(post, /crypto\.randomUUID\(\)/);
});
