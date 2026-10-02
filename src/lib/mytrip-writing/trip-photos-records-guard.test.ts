// My Trip 사진 기록·일괄 AI 글쓰기·개인화 빈 선택 (2026-10-02)
// node --experimental-strip-types --test src/lib/mytrip-writing/trip-photos-records-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  interleaveRecordPhotos, fullTripWorstUsdMicro, FULL_TRIP_WORST_USD_MICRO, FULL_TRIP_PHOTO_LIMITS,
  FULL_TRIP_MAX_OUTPUT_TOKENS, FULL_TRIP_IMAGE_TOKENS_MEDIUM, FULL_TRIP_WORST_TEXT_TOKENS, buildFullTripProviderBody,
} from "./full-trip-core.ts";
import { buildPrivateStoryDays } from "../share/private-story-adapter.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

test("사진 고르기 — 모든 기록의 1번 사진부터, 기록의 사진은 표지부터, 순서 표시", () => {
  const c = interleaveRecordPhotos([{ id: "a", paths: ["a1", "a2", "a3"] }, { id: "b", paths: ["b1"] }, { id: "c", paths: ["c1", "c2"] }]);
  assert.deepEqual(c.map(x => x.path), ["a1", "b1", "c1", "a2", "c2", "a3"]);
  assert.deepEqual(c[3], { momentId: "a", path: "a2", index: 2, of: 3 });
  // 한 장소 기록 5개·사진 15장 → 15장 모두, 기록마다 표지가 먼저
  const one = interleaveRecordPhotos(Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, paths: [1, 2, 3].map(k => `m${i}-${k}`) })));
  assert.equal(one.length, 15);
  assert.deepEqual(one.slice(0, 5).map(x => x.index), [1, 1, 1, 1, 1]);
  assert.ok(one.length <= FULL_TRIP_PHOTO_LIMITS.maxPhotos);
});

test("서버는 표지 사진을 빼지 않는다 — 기록의 모든 사진(본 사진 먼저 + 추가 사진)을 고르고, 한 요청 1회", () => {
  const w = read("functions", "api", "mytrip", "writing-full.ts");
  assert.match(w, /const paths = \[\.\.\.main, \.\.\.\(extras\.get\(id\) \?\? \[\]\)\];/);
  assert.match(w, /interleaveRecordPhotos\(perMoment\)/);
  assert.doesNotMatch(w, /firstExtra/, "추가 사진 첫 장을 '첫 사진' 으로 쓰던 옛 규칙 없음");
  assert.equal((w.match(/await pf\(/g) ?? []).length, 1, "사진 수와 무관하게 모델 호출 1회");
  const body = JSON.parse(buildFullTripProviderBody("p", [{ momentId: "x", mimeType: "image/jpeg", data: "AA", index: 2, of: 3 }]));
  assert.equal(body.contents[0].parts[1].text, "Photo for moment x (2 of 3):");
  assert.equal(body.generationConfig.mediaResolution, "MEDIA_RESOLUTION_MEDIUM", "MEDIUM 유지");
});

test("회사 비용 예약액 — 최악 허용 요청(글 상한·사진 15장·출력 상한)을 덮는다", () => {
  const worst = fullTripWorstUsdMicro();
  assert.equal(worst, Math.ceil((FULL_TRIP_WORST_TEXT_TOKENS + 15 * FULL_TRIP_IMAGE_TOKENS_MEDIUM) * 0.30 + FULL_TRIP_MAX_OUTPUT_TOKENS * 2.50));
  assert.ok(FULL_TRIP_WORST_USD_MICRO >= worst, `${FULL_TRIP_WORST_USD_MICRO} >= ${worst}`);
  assert.match(read("functions", "api", "mytrip", "writing-full.ts"), /const WORST_USD_MICRO = FULL_TRIP_WORST_USD_MICRO;/);
});

test("개인화 — 고른·저장한 장소가 없으면 사용권·비용 예약·provider 이전에 끝낸다(서버·화면 둘 다)", () => {
  const p = read("functions", "api", "trip", "personalize.ts");
  const noInput = p.indexOf('reply(null, "fallback_no_input")');
  assert.ok(noInput > 0 && noInput < p.indexOf("quotaReserve(") && noInput < p.indexOf("aiOpsReserve("));
  const c = read("src", "lib", "planner", "personalize-client.ts");
  assert.match(c, /if \(req\.selected_place_ids\.length === 0 && req\.liked_place_ids\.length === 0\) \{ lastNoInput = true; return null; \}/);
});

test("비공개 Story — 한 장소의 기록 여러 개는 남긴 시각 순(공개 Story 와 같은 기준)", () => {
  const days = [{ dayNumber: 1, date: "2026-10-02", places: [{ name: "광안리 해변", time: "15:00", place_id: "1", source: "city_spot", image: null }] }];
  const mk = (id: string, t: string) => ({ moment_id: id, day_number: 1, stop_key: "city_spot:1", memo: id, photo_data: null, captured_at: t });
  // 저장소에는 최근 것이 앞에 있다(addMoment 가 앞에 붙인다)
  const out = buildPrivateStoryDays(days, [mk("저녁", "2026-10-02T10:30:00Z"), mk("노을", "2026-10-02T09:10:00Z"), mk("오후", "2026-10-02T06:00:00Z")], { todayISO: "2026-10-03", nowHHMM: "00:00", isPast: true });
  assert.deepEqual(out[0]!.memories.map(m => m.memo), ["오후", "노을", "저녁"]);
});

test("기록 시트 — 여행 사진 한도(서버와 같은 값)를 고르기 전에 알리고, 넘는 사진은 넣지 않는다", () => {
  const cap = read("src", "components", "TripMomentCapture.tsx");
  assert.match(cap, /import \{ ITINERARY_PHOTO_LIMIT \} from "@\/lib\/photo-validate";/);
  assert.match(cap, /const room = Math\.max\(0, ITINERARY_PHOTO_LIMIT - tripPhotoCount - pickedCount\);/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read("src", "messages", `${l}.json`)).memo;
    for (const k of ["recordPhotoCount", "tripPhotoCount", "tripPhotoLimitSkipped", "stopRecordSummary", "addMoreRecord", "syncTripLimit", "syncDeviceLimit", "syncTooLarge"]) assert.ok(m[k], `${l}.memo.${k}`);
  }
  // 없는 총용량(MB) 한도는 화면에 쓰지 않는다
  assert.doesNotMatch(JSON.stringify(JSON.parse(read("src", "messages", "ko.json")).memo), /MB \//);
});

test("사진 저장 거절 코드 — 한도·크기를 화면이 구분하도록 서버가 코드로 알린다", () => {
  const one = read("functions", "api", "trip-moments", "[momentId]", "photo.ts");
  const many = read("functions", "api", "trip-moments", "[momentId]", "photos.ts");
  assert.match(one, /code: "DEVICE_LIMIT"/); assert.match(one, /code: "ITINERARY_LIMIT"/); assert.match(one, /code: "TOO_LARGE"/);
  assert.match(many, /code: "TOO_LARGE"/);
  const st = read("src", "lib", "trip-moments", "storage.ts");
  assert.match(st, /photo_sync_error: up\.error/);
});
