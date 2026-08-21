/**
 * photo-resolve — 기기 무관 순간 사진 (TASK-STORY-CROSS-DEVICE-PHOTOS-V1 + R1 합치기 규칙)
 * Run: node --experimental-strip-types --test src/lib/trip-moments/photo-resolve.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  needsPhotoResolution, isResolvedFresh, composeDisplayPhotos, withResolvedPhotos, fetchMomentPhotoUrls,
  type ResolvedPhotos,
} from "./photo-resolve.ts";
import type { TripMoment } from "./types.ts";
import { buildPrivateStoryDays } from "../share/private-story-adapter.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

const base = (over: Partial<TripMoment>): TripMoment => ({
  moment_id: "m1", itinerary_id: "t1", device_id: "d", photo_data: null, memo: "", category: "random",
  lat: null, lng: null, location_label: "", captured_at: "2026-08-19T10:00:00Z", day_number: 1, synced: true, ...over,
});
const FRESH = "2099-01-01T00:00:00Z";
const server = (n: number): ResolvedPhotos => ({
  photos: Array.from({ length: n }, (_, i) => ({ url: `https://s/${i + 1}`, isFirst: i === 0 })), expiresAt: FRESH,
});
const L = (t: string) => `data:image/jpeg;base64,${t}`;

test("N1: 서버에 사진이 있는 순간은 로컬 유무와 무관하게 해석 대상 (몇 장인지는 서버만 안다)", () => {
  assert.equal(needsPhotoResolution(base({ has_photo: true })), true);
  assert.equal(needsPhotoResolution(base({ has_photo: true, photo_data: L("A") })), true);
  assert.equal(needsPhotoResolution(base({ has_photo: false, photo_data: L("A") })), false, "업로드 전 로컬만 있는 순간은 서버 조회 안 함");
});

test("N2: 만료 60초 전부터 stale", () => {
  const now = Date.parse("2026-08-21T10:00:00Z");
  assert.equal(isResolvedFresh({ photos: [], expiresAt: "2026-08-21T10:05:00Z" }, now), true);
  assert.equal(isResolvedFresh({ photos: [], expiresAt: "2026-08-21T10:00:30Z" }, now), false);
  assert.equal(isResolvedFresh(undefined, now), false);
});

// ── 합치기 예시 (§6) ─────────────────────────────────────────────────────────
test("M1: server 4 / local 1 → 4장, 첫 장은 로컬 미리보기, 나머지 서명 (순서 유지)", () => {
  const out = composeDisplayPhotos({ photo_data: L("P1"), photo_data_extra: [] }, server(4));
  assert.deepEqual(out, [L("P1"), "https://s/2", "https://s/3", "https://s/4"]);
});

test("M2: server 4 / local 0 → 4장 전부 서명", () => {
  assert.deepEqual(composeDisplayPhotos({ photo_data: null }, server(4)), ["https://s/1", "https://s/2", "https://s/3", "https://s/4"]);
});

test("M3: server 4 / local 4 → 4장, 중복 0, 전부 로컬 미리보기", () => {
  const out = composeDisplayPhotos({ photo_data: L("P1"), photo_data_extra: [L("P2"), L("P3"), L("P4")] }, server(4));
  assert.deepEqual(out, [L("P1"), L("P2"), L("P3"), L("P4")]);
  assert.equal(new Set(out).size, 4);
});

test("M4: server 1 / local 1 → 1장 (첫 장 두 번 금지)", () => {
  assert.deepEqual(composeDisplayPhotos({ photo_data: L("P1") }, server(1)), [L("P1")]);
});

test("M5: 추가 장 수가 다르면(다른 기기에서 지움/추가) 추측하지 않고 서버 서명 URL 을 쓴다", () => {
  const out = composeDisplayPhotos({ photo_data: L("P1"), photo_data_extra: [L("X")] }, server(4));
  assert.deepEqual(out, [L("P1"), "https://s/2", "https://s/3", "https://s/4"]);
});

test("M6: 서버 해석 전에는 로컬만(있는 대로) — 첫 렌더가 비지 않는다", () => {
  assert.deepEqual(composeDisplayPhotos({ photo_data: L("P1"), photo_data_extra: [L("P2")] }, undefined), [L("P1"), L("P2")]);
  assert.deepEqual(composeDisplayPhotos({ photo_data: null }, undefined), []);
});

test("M7: 서명 목록에서 한 장이 빠져도(실패) 나머지는 그대로", () => {
  const r: ResolvedPhotos = { photos: [{ url: "https://s/1", isFirst: true }, { url: "https://s/3", isFirst: false }], expiresAt: FRESH };
  assert.deepEqual(composeDisplayPhotos({ photo_data: null }, r), ["https://s/1", "https://s/3"]);
});

test("W1: withResolvedPhotos 는 원본을 바꾸지 않고 복사본의 photo_data/extra 를 채운다", () => {
  const m = base({ has_photo: true, photo_data: L("P1") });
  const out = withResolvedPhotos([m], { m1: server(4) });
  assert.equal(out[0]!.photo_data, L("P1"));
  assert.deepEqual(out[0]!.photo_data_extra, ["https://s/2", "https://s/3", "https://s/4"]);
  assert.equal(m.photo_data_extra, undefined, "원본 불변");
});

test("W2: 한 순간 해석 실패(없음)여도 다른 순간은 그려지고, 실패 순간은 사진 0장일 뿐 사라지지 않는다", () => {
  const a = base({ moment_id: "a", has_photo: true, city_spot_id: 1 });
  const b = base({ moment_id: "b", has_photo: true, memo: "사진 못 받음" });
  const out = withResolvedPhotos([a, b], { a: server(1) });
  const days = buildPrivateStoryDays(
    [{ dayNumber: 1, date: "2026-08-19", places: [{ name: "Haeundae Beach", time: "10:00", place_id: "1", source: "city_spot", image: "https://images.unsplash.com/x.jpg" }] }],
    out, { todayISO: "2026-09-01", nowHHMM: "12:00", isPast: true },
  );
  assert.equal(days[0]!.memories[0]!.photos[0]!.url, "https://s/1");
  assert.equal(days[0]!.memories[1]!.photos.length, 0, "카탈로그 이미지로 위장하지 않는다");
  assert.equal(days[0]!.memories[1]!.memo, "사진 못 받음");
});

// ── fetch 경계 ───────────────────────────────────────────────────────────────
const stub = (status: number, body: unknown): typeof fetch =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

test("F1: 소유자 목록 응답 → isFirst·순서 보존", async () => {
  const r = await fetchMomentPhotoUrls("m1", "dev", stub(200, { photos: [
    { id: "legacy", isFirst: true, url: "https://sign/1" }, { id: "p2", isFirst: false, url: "https://sign/2" }], expiresAt: FRESH }));
  assert.deepEqual(r?.photos, [{ url: "https://sign/1", isFirst: true }, { url: "https://sign/2", isFirst: false }]);
});

test("F2: 404/500/예외 → null · http(s) 아닌 주소는 버림", async () => {
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", stub(404, { error: "Not found" })), null);
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", stub(500, {})), null);
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", (async () => { throw new Error("net"); }) as unknown as typeof fetch), null);
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", stub(200, { photos: [{ url: "javascript:alert(1)" }] })), null);
});

// ── 화면 연결 가드 ────────────────────────────────────────────────────────────
test("G1: 일정 화면은 Timeline·Story 에 같은 표시 복사본을 주고, 로컬 캐시·원본 state 에 저장하지 않는다", () => {
  const page = read("src/app/itinerary/page.tsx");
  assert.match(page, /const displayMoments = withResolvedPhotos\(moments, resolvedPhotoUrls\)/);
  assert.match(page, /moments=\{displayMoments\}/);
  assert.match(page, /buildPrivateStoryDays\([\s\S]*?displayMoments,/);
  assert.ok(!/saveMomentsLocal\(\s*[^)]*displayMoments/.test(page));
  assert.ok(!/setMoments\(\s*displayMoments/.test(page));
});

test("G2: 이미지 로드 실패 → 순간당 한 번만 재해석 (무한 재시도 금지)", () => {
  const page = read("src/app/itinerary/page.tsx");
  assert.match(page, /photoRetriedRef/);
  assert.match(page, /onPhotoError=\{handlePhotoError\}/);
  assert.match(page, /onPhotoError=\{\(m\) => handlePhotoError\(m\.id\)\}/);
  const tl = read("src/components/TripMomentTimeline.tsx");
  assert.match(tl, /onPhotoError\?:\s*\(momentId: string\) => void/);
  const sj = read("src/components/story/StoryJournal.tsx");
  assert.match(sj, /onPhotoError\?:\s*\(memory: StoryMemory, index: number\) => void/);
});

test("G3: 공개 경로는 소유자 해석기를 쓰지 않는다", () => {
  assert.ok(!read("src/lib/share/public-story.ts").includes("photo-resolve"));
  assert.ok(!read("src/app/shared/page.tsx").includes("withResolvedPhotos"));
});
