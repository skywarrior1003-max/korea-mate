/**
 * photo-resolve — 기기 무관 순간 사진 (TASK-STORY-CROSS-DEVICE-PHOTOS-V1)
 * Run: node --experimental-strip-types --test src/lib/trip-moments/photo-resolve.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  needsPhotoResolution, isResolvedFresh, withResolvedPhotos, fetchMomentPhotoUrls,
} from "./photo-resolve.ts";
import type { TripMoment } from "./types.ts";
import { buildPrivateStoryDays } from "../share/private-story-adapter.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

const base = (over: Partial<TripMoment>): TripMoment => ({
  moment_id: "m1", itinerary_id: "t1", device_id: "d", photo_data: null, memo: "", category: "random",
  lat: null, lng: null, location_label: "", captured_at: "2026-08-19T10:00:00Z", day_number: 1, synced: true, ...over,
});

test("N1: 서버에 사진이 있고 로컬 미리보기가 없을 때만 해석 대상", () => {
  assert.equal(needsPhotoResolution(base({ has_photo: true })), true);
  assert.equal(needsPhotoResolution(base({ has_photo: true, photo_data: "data:image/jpeg;base64,A" })), false, "로컬 우선");
  assert.equal(needsPhotoResolution(base({ has_photo: false })), false);
  assert.equal(needsPhotoResolution(base({})), false);
});

test("N2: 만료 60초 전부터 stale — 다시 받는다", () => {
  const now = Date.parse("2026-08-21T10:00:00Z");
  assert.equal(isResolvedFresh({ urls: ["https://x/1"], expiresAt: "2026-08-21T10:05:00Z" }, now), true);
  assert.equal(isResolvedFresh({ urls: ["https://x/1"], expiresAt: "2026-08-21T10:00:30Z" }, now), false);
  assert.equal(isResolvedFresh(undefined, now), false);
  assert.equal(isResolvedFresh({ urls: [], expiresAt: "bad" }, now), false);
});

test("W1: 첫 장 + 추가 장이 서버 순서대로 photo_data / photo_data_extra 에 들어간다 (원본 불변)", () => {
  const m = base({ has_photo: true });
  const out = withResolvedPhotos([m], { m1: { urls: ["https://s/1", "https://s/2", "https://s/3", "https://s/4"], expiresAt: "2099-01-01T00:00:00Z" } });
  assert.equal(out[0]!.photo_data, "https://s/1");
  assert.deepEqual(out[0]!.photo_data_extra, ["https://s/2", "https://s/3", "https://s/4"]);
  assert.equal(m.photo_data, null, "원본 객체는 그대로");
});

test("W2: 로컬 미리보기가 있으면 서명 주소로 덮지 않는다", () => {
  const m = base({ has_photo: true, photo_data: "data:image/jpeg;base64,LOCAL", photo_data_extra: ["data:image/jpeg;base64,L2"] });
  const out = withResolvedPhotos([m], { m1: { urls: ["https://s/1"], expiresAt: "2099-01-01T00:00:00Z" } });
  assert.equal(out[0]!.photo_data, "data:image/jpeg;base64,LOCAL");
  assert.deepEqual(out[0]!.photo_data_extra, ["data:image/jpeg;base64,L2"]);
});

test("W3: 한 순간의 해석이 없어도 다른 순간은 그대로 — Story 전체가 깨지지 않는다", () => {
  const a = base({ moment_id: "a", has_photo: true, city_spot_id: 1 });
  const b = base({ moment_id: "b", has_photo: true, memo: "사진 못 받음" });
  const out = withResolvedPhotos([a, b], { a: { urls: ["https://s/a"], expiresAt: "2099-01-01T00:00:00Z" } });
  assert.equal(out[0]!.photo_data, "https://s/a");
  assert.equal(out[1]!.photo_data, null, "실패한 순간은 사진 없음 상태로 남는다 — 카탈로그 이미지로 위장하지 않는다");
  const days = buildPrivateStoryDays(
    [{ dayNumber: 1, date: "2026-08-19", places: [{ name: "Haeundae Beach", time: "10:00", place_id: "1", source: "city_spot", image: "https://images.unsplash.com/x.jpg" }] }],
    out, { todayISO: "2026-09-01", nowHHMM: "12:00", isPast: true },
  );
  assert.equal(days[0]!.memories[0]!.photos[0]!.url, "https://s/a", "개인화 항목은 사용자 사진");
  assert.equal(days[0]!.memories[1]!.photos.length, 0, "실패한 순간은 사진 0장으로 표시될 뿐 사라지지 않는다");
  assert.equal(days[0]!.memories[1]!.memo, "사진 못 받음");
});

// ── fetch 경계 ───────────────────────────────────────────────────────────────
const stub = (status: number, body: unknown): typeof fetch =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

test("F1: 소유자 목록 응답 → 순서 보존, 저장 경로·device 는 애초에 없다", async () => {
  const r = await fetchMomentPhotoUrls("m1", "dev", stub(200, { photos: [
    { id: "legacy", isFirst: true, url: "https://sign/1" }, { id: "p2", isFirst: false, url: "https://sign/2" }], expiresAt: "2099-01-01T00:00:00Z" }));
  assert.deepEqual(r?.urls, ["https://sign/1", "https://sign/2"]);
  assert.equal(r?.expiresAt, "2099-01-01T00:00:00Z");
});

test("F2: 비소유·미존재(404)·서버 오류(500)·네트워크 예외 → null (사유 미노출)", async () => {
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", stub(404, { error: "Not found" })), null);
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", stub(500, { error: "x" })), null);
  const boom = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
  assert.equal(await fetchMomentPhotoUrls("m1", "dev", boom), null);
});

test("F3: http(s) 가 아닌 값은 버린다 — 응답을 그대로 img 에 넣지 않는다", async () => {
  const r = await fetchMomentPhotoUrls("m1", "dev", stub(200, { photos: [{ url: "javascript:alert(1)" }, { url: "moments/a/b.jpg" }] }));
  assert.equal(r, null);
});

// ── 화면 연결 가드 ────────────────────────────────────────────────────────────
test("G1: 일정 화면은 Timeline·Story 둘 다 해석된 복사본을 그리고, 그것을 로컬 캐시에 저장하지 않는다", () => {
  const page = read("src/app/itinerary/page.tsx");
  assert.match(page, /const displayMoments = withResolvedPhotos\(moments, resolvedPhotoUrls\)/);
  assert.match(page, /moments=\{displayMoments\}/, "TripMomentTimeline 은 displayMoments 를 받는다");
  assert.match(page, /buildPrivateStoryDays\([\s\S]*?displayMoments,/, "Story 어댑터도 displayMoments 를 받는다");
  assert.ok(!/saveMomentsLocal\(\s*[^)]*displayMoments/.test(page), "해석 결과를 로컬에 저장하지 않는다");
  assert.ok(!/setMoments\(\s*displayMoments/.test(page), "해석 결과로 원본 state 를 덮지 않는다");
});

test("G2: 공개 serializer 는 이 작업과 무관하다 (private 주소가 공개 경로로 가지 않는다)", () => {
  const pub = read("src/lib/share/public-story.ts");
  assert.ok(!pub.includes("photo-resolve"), "공개 serializer 가 소유자 해석기를 import 하면 안 된다");
  const shared = read("src/app/shared/page.tsx");
  assert.ok(!shared.includes("withResolvedPhotos"), "공개 화면은 소유자 사진 해석을 쓰지 않는다");
});
