// 공개 응답을 Story 화면 모양으로 바꾸는 규칙.
//
// 이 자리가 "무엇이 화면까지 갈 수 있는가" 의 마지막 문이다. 여기서 만들지
// 않은 값은 화면이 볼 수 없다. 그래서 나가는 것만이 아니라 **만들어 내지
// 않는 것**(없는 장소·없는 메모·없는 작성자)도 함께 못 박는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  toStoryDays, coverPhotoUrl, coverEyebrow, storyStats, hasPublicMemories,
  memoryPhotoUrl, type ApiStory, type ApiMemory,
} from "./story-adapter.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const IT = "11111111-1111-4111-8111-111111111111";
const mem = (o: Partial<ApiMemory> = {}): ApiMemory => ({
  dayNumber: 1, memo: "메모", placeName: "장소", placeId: null,
  photos: [{ ref: "0123456789abcdef0123456789abcdef" }], ...o,
});
const api = (o: Partial<ApiStory> = {}): ApiStory => ({
  id: IT, city: "busan", start_date: "2026-10-12", end_date: "2026-10-14",
  trip_title: "우리의 부산", days: { __v: 2, scheduled: [
    { dayNumber: 1, date: "2026-10-12", places: [{}, {}] },
    { dayNumber: 2, date: "2026-10-13", places: [{}] },
  ] }, memories: [], ...o,
});

// ── 사진 주소 ────────────────────────────────────────────────────────────────
test("★사진 주소는 공개 프록시 하나로만 만든다", () => {
  const url = memoryPhotoUrl(IT, "0123456789abcdef0123456789abcdef");
  assert.equal(url, `/img/memory/${IT}/0123456789abcdef0123456789abcdef`);
  // 소유자 경로·서명 URL·저장 경로가 섞이지 않는다
  for (const bad of ["/api/trip-moments", "token", "storage", "sign", "device"]) {
    assert.ok(!url.includes(bad), bad);
  }
});

// ── Day 묶기 ─────────────────────────────────────────────────────────────────
// (SHARED-STORY-RICH-EXPERIENCE-V1 이후 일정 장소가 baseline 항목으로 함께
//  들어간다 — 결합되지 않은 Memory 는 그 Day 의 baseline 뒤에 순서대로 붙는다.)
test("★Memory 는 자기 Day 로 간다", () => {
  const days = toStoryDays(api({ memories: [
    mem({ dayNumber: 2, memo: "둘째 날" }),
    mem({ dayNumber: 1, memo: "첫째 날" }),
  ] }));
  assert.deepEqual(days.map(d => d.dayNumber), [1, 2]);
  assert.equal(days[0]!.memories.some(m => m.memo === "첫째 날"), true);
  assert.equal(days[0]!.memories.some(m => m.memo === "둘째 날"), false);
  assert.equal(days[1]!.memories.some(m => m.memo === "둘째 날"), true);
  assert.equal(days[0]!.dateLabel, "2026-10-12");
});

test("★같은 Day 안에서는 서버가 준 순서를 그대로 쓴다", () => {
  const days = toStoryDays(api({ memories: [
    mem({ memo: "먼저" }), mem({ memo: "다음" }), mem({ memo: "마지막" }),
  ] }));
  const memos = days[0]!.memories.map(m => m.memo).filter(m => m !== "");
  assert.deepEqual(memos, ["먼저", "다음", "마지막"]);
});

test("★day 가 없는 Memory 를 버리지 않는다 — 마지막 Day 에 붙인다", () => {
  const days = toStoryDays(api({ memories: [
    mem({ dayNumber: 1, memo: "첫째" }),
    mem({ dayNumber: null, memo: "날짜 없음" }),
  ] }));
  const all = days.flatMap(d => d.memories.map(m => m.memo));
  assert.ok(all.includes("날짜 없음"), "사라졌다");
  assert.equal(days[days.length - 1]!.memories.some(m => m.memo === "날짜 없음"), true);
  // 시안에 없는 새 구역을 만들지 않는다
  assert.deepEqual(days.map(d => d.dayNumber), [1, 2].filter(n => days.some(d => d.dayNumber === n)));
});

test("★일정에 없는 Day 번호도 버리지 않는다", () => {
  const days = toStoryDays(api({ memories: [mem({ dayNumber: 99, memo: "엉뚱한 날" })] }));
  assert.equal(days.flatMap(d => d.memories).some(m => m.memo === "엉뚱한 날"), true);
});

test("★일정이 Story 의 뼈대다 — Memory 없는 Day 도 일정 장소로 그린다", () => {
  // (구계약 "Memory 없는 Day 는 그리지 않는다" 는 RICH-EXPERIENCE 로 대체됐다:
  //  공유받은 사람은 사진이 없어도 Day 별 장소 흐름을 본다.)
  const days = toStoryDays(api({ memories: [mem({ dayNumber: 1 })] }));
  assert.deepEqual(days.map(d => d.dayNumber), [1, 2]);
  assert.equal(days[1]!.memories.length, 1); // Day 2 의 일정 장소 1곳 = baseline
  assert.equal(days[1]!.memories[0]!.memo, ""); // baseline 은 글을 지어내지 않는다
});

test("★공개 Memory 가 0이어도 일정만으로 Story 가 선다 — 일정도 없으면 0", () => {
  assert.deepEqual(toStoryDays(api({ memories: [] })).map(d => d.dayNumber), [1, 2]);
  assert.deepEqual(toStoryDays(api({ memories: undefined, days: [] })), []);
  assert.equal(hasPublicMemories(api({ memories: [] })), false);
  assert.equal(hasPublicMemories(api({ memories: [mem()] })), true);
});

test("★일정 days 가 비어 있어도 Memory 를 잃지 않는다", () => {
  const days = toStoryDays(api({ days: [], memories: [mem({ dayNumber: null, memo: "살아남는다" })] }));
  assert.equal(days.flatMap(d => d.memories).some(m => m.memo === "살아남는다"), true);
});

test("★배열로 저장된 옛 일정도 읽는다", () => {
  const days = toStoryDays(api({
    days: [{ dayNumber: 1, date: "2026-10-12", places: [{}] }],
    memories: [mem({ dayNumber: 1 })],
  }));
  assert.equal(days.length, 1);
  assert.equal(days[0]!.dateLabel, "2026-10-12");
});

// ── 없는 값은 만들지 않는다 ──────────────────────────────────────────────────
test("★장소가 없으면 없는 채로 넘긴다", () => {
  const days = toStoryDays(api({ memories: [mem({ placeName: null })] }));
  assert.equal(days[0]!.memories[0]!.placeName, undefined);
});

test("★메모가 없으면 빈 문자열이다 — 지어내지 않는다", () => {
  const days = toStoryDays(api({ memories: [mem({ memo: null })] }));
  assert.equal(days[0]!.memories[0]!.memo, "");
});

test("★사진이 없는 Memory 도 정상이다", () => {
  const days = toStoryDays(api({ memories: [mem({ photos: [] })] }));
  assert.deepEqual(days[0]!.memories[0]!.photos, []);
});

test("★사진 순서는 서버가 준 순서 그대로다", () => {
  const refs = ["a".repeat(32), "b".repeat(32), "c".repeat(32)];
  const days = toStoryDays(api({ memories: [mem({ photos: refs.map(ref => ({ ref })) })] }));
  const withPhotos = days[0]!.memories.find(m => m.photos.length > 0)!;
  assert.deepEqual(withPhotos.photos.map(p => p.url), refs.map(r => memoryPhotoUrl(IT, r)));
});

// ── Cover · Summary ──────────────────────────────────────────────────────────
test("★Cover 사진은 공개된 Memory 의 첫 사진이다", () => {
  assert.equal(coverPhotoUrl(api({ memories: [mem()] })), memoryPhotoUrl(IT, "0123456789abcdef0123456789abcdef"));
  // 앞 Memory 에 사진이 없으면 다음 것에서 찾는다
  const second = "f".repeat(32);
  assert.equal(coverPhotoUrl(api({ memories: [mem({ photos: [] }), mem({ photos: [{ ref: second }] })] })),
    memoryPhotoUrl(IT, second));
  // 아무 사진도 없으면 없다 — sample 로 채우지 않는다
  assert.equal(coverPhotoUrl(api({ memories: [mem({ photos: [] })] })), null);
});

test("★Cover 윗줄은 공개 응답에 이미 있는 값으로만 만든다", () => {
  assert.equal(coverEyebrow(api()), "2026-10-12 – 2026-10-14 · busan");
  assert.equal(coverEyebrow(api({ city: "", start_date: "", end_date: "" })), "");
});

test("★Summary 통계는 공개 일정에서 센 값이다", () => {
  assert.deepEqual(storyStats(api()), { dayCount: 2, placeCount: 3 });
  assert.deepEqual(storyStats(api({ days: [] })), { dayCount: 0, placeCount: 0 });
  assert.deepEqual(storyStats(api({ days: null })), { dayCount: 0, placeCount: 0 });
});

// ── 개인정보 ─────────────────────────────────────────────────────────────────
test("★화면으로 넘어가는 값에 내부 정보가 없다", () => {
  const days = toStoryDays(api({ memories: [
    mem({ dayNumber: 1, placeId: "4412" }), mem({ dayNumber: 2 }),
  ] }));
  const raw = JSON.stringify(days);
  for (const bad of ["storage", "device", "lat", "lng", "location_label",
                     "sourceKey", "moment_id", "photo_id", "signed", "token", "consent"]) {
    assert.ok(!raw.includes(bad), `${bad} 가 화면까지 간다`);
  }
});

test("★어댑터는 사용자 글을 손대지 않는다", () => {
  const long = "아주 긴 문장. ".repeat(40);
  const days = toStoryDays(api({ memories: [mem({ memo: long })] }));
  assert.equal(days[0]!.memories.some(m => m.memo === long), true);   // 자르지도 요약하지도 않는다
  const src = strip(read("src", "lib", "share", "story-adapter.ts"));
  for (const bad of [/slice\(0,\s*\d+\)/, /summar/i, /rewrite/i, /translate/i]) {
    assert.doesNotMatch(src, bad, String(bad));
  }
});

// ── 런타임 선택 · 계약 (소스 기준) ───────────────────────────────────────────
test("★일정이나 공개 기록이 있을 때만 Story 로 간다 — 껍데기는 기존 공유 화면", () => {
  // (RICH-EXPERIENCE: 게이트가 hasPublicMemories → storyDays 존재로 바뀌었다.
  //  Story 뼈대는 일정이므로, 일정도 Memory 도 없는 껍데기만 fallback 이다.)
  const page = strip(read("src", "app", "shared", "page.tsx"));
  assert.match(page, /if \(richStoryDays\.length > 0\) \{/);
  // 없으면 기존 공유 화면이 그대로 아래에 남아 있다
  assert.match(page, /<TripCover/);
  assert.match(page, /status === "not_found"/);
});

test("★Story 는 서버 정제 응답만 쓴다 — 브라우저가 DB 를 보지 않는다", () => {
  const page = strip(read("src", "app", "shared", "page.tsx"));
  assert.match(page, /fetchSharedItinerary/);
  for (const bad of [/supabase\.from\(/, /trip_moments/, /trip_moment_photos/,
                     /createSignedUrl/, /api\/trip-moments/]) {
    assert.doesNotMatch(page, bad, String(bad));
  }
  // `x-device-id` 는 이 화면에 한 군데 남아 있다 — Memory 와 무관한 **조회수
  // 카운터**(`/api/itinerary/view`)로, 이번 작업 이전부터 있던 것이다.
  // Memory 나 사진을 가져오는 데는 쓰이지 않는다.
  const deviceUses = page.match(/x-device-id/g) ?? [];
  assert.equal(deviceUses.length, 1);
  assert.match(page, /api\/itinerary\/view\/\$\{trip\.id\}[\s\S]{0,120}x-device-id/);
});

test("★작성자 값이 없으므로 작성자 줄을 넘기지 않는다", () => {
  const page = strip(read("src", "app", "shared", "page.tsx"));
  const block = page.slice(page.indexOf("<StoryCover"), page.indexOf("</StoryCover>") + 1 || page.indexOf("/>", page.indexOf("<StoryCover")));
  assert.doesNotMatch(block, /authorName|authorAvatarUrl/);
  for (const bad of ["By Traveler", "Sarah Kim"]) assert.ok(!page.includes(bad), bad);
});

test("★Save 는 연결하지 않았다 — 가짜 버튼을 두지 않는다", () => {
  const page = strip(read("src", "app", "shared", "page.tsx"));
  const j = page.slice(page.indexOf("<StoryJournal"), page.indexOf("<StorySummary"));
  assert.doesNotMatch(j, /onSave=/);
});

test("★지도는 만들지 않고 자리째 감춘다", () => {
  const page = strip(read("src", "app", "shared", "page.tsx"));
  assert.match(page, /hideMapSlot/);
  assert.doesNotMatch(page, /mapSlot=\{/);
  for (const bad of [/naver\.maps/i, /google\.maps/i, /polyline/i]) {
    assert.doesNotMatch(page, bad, String(bad));
  }
});

test("★Story 일 때만 하단 메뉴를 감춘다 — 경로로 통째 숨기지 않는다", () => {
  const nav = strip(read("src", "components", "ui", "NavShell.tsx"));
  assert.match(nav, /STORY_MODE_ATTR/);
  assert.match(nav, /if \(storySurface\) return null;/);
  // /shared 를 통째로 숨기면 기억 없는 기존 공유 화면까지 메뉴를 잃는다
  assert.doesNotMatch(nav, /startsWith\("\/shared"\)/);
  assert.match(nav, /startsWith\("\/korea-mate-admin"\)/);   // 기존 제외는 그대로

  const hide = strip(read("src", "components", "story", "StoryNavHide.tsx"));
  assert.match(hide, /removeAttribute\(STORY_MODE_ATTR\)/);  // 떠나면 되돌린다
});

test("★Copy 는 기존 것을 그대로 쓴다 — 새 backend 를 만들지 않았다", () => {
  const page = strip(read("src", "app", "shared", "page.tsx"));
  assert.match(page, /onCopy=\{\(\) => void handleCopyTrip\(\)\}/);
  assert.match(page, /apiCopyItinerary\(shareId, getDeviceId\(\)\)/);
  // 복사가 Memory 를 옮기지 않는다는 계약은 서버 쪽에 그대로 있다
  const copy = strip(read("functions", "api", "itinerary", "copy.ts"));
  assert.doesNotMatch(copy, /trip_moments|trip_moment_photos/);
});

// ── representativeCoverUrl (TRAVEL-MEMORY-PRODUCTION-V1 §9) ────────────────────

const coverApi = (memories: ApiMemory[], places: { name: string; place_id?: string; image?: string }[]): ApiStory => ({
  id: "00000000-0000-4000-8000-000000000001",
  city: "busan", start_date: "2026-10-01", end_date: "2026-10-03",
  trip_title: "t", memories,
  days: [{ dayNumber: 1, date: "2026-10-01", places }],
});

test("대표 cover — 공개 Memory 가 가장 많이 결합된 장소의 카탈로그 이미지를 우선한다", async () => {
  const { representativeCoverUrl } = await import("./story-adapter.ts");
  const api = coverApi(
    [
      { dayNumber: 1, memo: "", placeName: null, placeId: "22", photos: [] },
      { dayNumber: 1, memo: "", placeName: null, placeId: "22", photos: [] },
      { dayNumber: 1, memo: "", placeName: null, placeId: "11", photos: [] },
    ],
    [
      { name: "A", place_id: "11", image: "https://example.com/a.jpg" },
      { name: "B", place_id: "22", image: "https://example.com/b.jpg" },
    ],
  );
  assert.equal(representativeCoverUrl(api), "https://example.com/b.jpg");
});

test("대표 cover — 신호가 없으면(공개 Memory 0) 첫 카탈로그 이미지가 정직한 선택", async () => {
  const { representativeCoverUrl } = await import("./story-adapter.ts");
  const api = coverApi([], [
    { name: "A", place_id: "11", image: "https://example.com/a.jpg" },
    { name: "B", place_id: "22", image: "https://example.com/b.jpg" },
  ]);
  assert.equal(representativeCoverUrl(api), "https://example.com/a.jpg");
});

test("대표 cover — 이미지가 하나도 없으면 null (지어내지 않는다)", async () => {
  const { representativeCoverUrl } = await import("./story-adapter.ts");
  assert.equal(representativeCoverUrl(coverApi([], [{ name: "A" }])), null);
});
