// 내 장소 저장 복구 → 사진 3장 → My Trip 바로 시작 (2026-10-01)
// node --experimental-strip-types --test src/lib/user-spots/my-place-trip.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyPlaceLink } from "./location-seed.ts";
import { parseExif, exifConflict } from "../photo-exif.ts";
import { runCreateFlow } from "./create-flow.ts";
import { appendStopToDays, buildPlaceStop, nowKst } from "./start-trip.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

// ── 링크 ────────────────────────────────────────────────────────────────────
test("링크 — 좌표 있음 / 짧은 링크 / 좌표 없는 지도 / 일반 링크 / 형식 아님을 가른다", () => {
  assert.equal(classifyPlaceLink("https://www.google.com/maps/place/X/@35.1532,129.1186,17z").kind, "coords");
  const k = classifyPlaceLink("https://map.kakao.com/link/map/해운대,35.1587,129.1604");
  assert.equal(k.kind, "coords"); assert.equal(k.provider, "kakao");
  assert.deepEqual(k.coordinate, { lat: 35.1587, lng: 129.1604 });
  assert.equal(classifyPlaceLink("https://map.naver.com/p/?c=129.16,35.15,15,0,0,0,dh").kind, "coords");
  for (const u of ["https://naver.me/abc", "https://kko.to/abc", "https://maps.app.goo.gl/abc"]) {
    assert.equal(classifyPlaceLink(u).kind, "short", u);
  }
  assert.equal(classifyPlaceLink("https://map.naver.com/p/entry/place/123").kind, "map");
  assert.equal(classifyPlaceLink("https://blog.naver.com/a/1").kind, "reference");
  assert.equal(classifyPlaceLink("https://www.google.com/search?q=cafe").kind, "reference");
  assert.equal(classifyPlaceLink("광안리 카페").kind, "invalid");
  assert.equal(classifyPlaceLink("").kind, "empty");
});

test("짧은 링크는 서버가 열지 않는다(SSRF) — 링크 해석 코드에 fetch 가 없다", () => {
  const src = read("src", "lib", "user-spots", "location-seed.ts");
  assert.doesNotMatch(src, /\bfetch\(/);
});

// ── EXIF ────────────────────────────────────────────────────────────────────
/** DateTimeOriginal + GPS 를 가진 최소 JPEG(APP1) 을 만든다(리틀 엔디언). */
function jpegWithExif(dt: string | null, gps: { lat: number; lng: number } | null): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => [v & 255, (v >> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  // header
  tiff.push(0x49, 0x49, ...u16(42), ...u32(8));
  // IFD0 at 8: entries ExifPtr(0x8769), GPSPtr(0x8825)
  const ifd0Entries = 2;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifOff = 8 + ifd0Size;
  const exifSize = 2 + 12 + 4;
  const dtOff = exifOff + exifSize;
  const dtBytes = dt ? [...Buffer.from(dt + "\0", "ascii")] : [];
  const gpsOff = dtOff + dtBytes.length;
  tiff.push(...u16(ifd0Entries));
  tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifOff));
  tiff.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(gps ? gpsOff : 0));
  tiff.push(...u32(0));
  // Exif IFD
  tiff.push(...u16(1));
  tiff.push(...u16(0x9003), ...u16(2), ...u32(dtBytes.length), ...u32(dtOff));
  tiff.push(...u32(0));
  tiff.push(...dtBytes);
  if (gps) {
    const n = 4;
    const ratOff = gpsOff + 2 + n * 12 + 4;
    const dms = (v: number) => { const d = Math.floor(v); const mf = (v - d) * 60; const m = Math.floor(mf); const s = Math.round((mf - m) * 60 * 1000); return [d, 1, m, 1, s, 1000]; };
    tiff.push(...u16(n));
    tiff.push(...u16(1), ...u16(2), ...u32(2), ...[gps.lat >= 0 ? 78 : 83, 0, 0, 0]);
    tiff.push(...u16(2), ...u16(5), ...u32(3), ...u32(ratOff));
    tiff.push(...u16(3), ...u16(2), ...u32(2), ...[gps.lng >= 0 ? 69 : 87, 0, 0, 0]);
    tiff.push(...u16(4), ...u16(5), ...u32(3), ...u32(ratOff + 24));
    tiff.push(...u32(0));
    for (const v of [...dms(Math.abs(gps.lat)), ...dms(Math.abs(gps.lng))]) tiff.push(...u32(v));
  }
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255, ...app1, 0xff, 0xd9]);
}

test("EXIF — 촬영 시각·위치를 읽는다, 없으면 빈 값", () => {
  const e = parseExif(jpegWithExif("2026:09:30 14:22:05", { lat: 35.1532, lng: 129.1186 }));
  assert.equal(e.date, "2026-09-30");
  assert.equal(e.time, "14:22");
  assert.ok(Math.abs((e.lat as number) - 35.1532) < 1e-4);
  assert.ok(Math.abs((e.lng as number) - 129.1186) < 1e-4);
  const none = parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  assert.deepEqual(none, { date: null, time: null, lat: null, lng: null });
  assert.deepEqual(parseExif(new Uint8Array([1, 2, 3])), none, "JPEG 가 아니면 빈 값");
  const onlyTime = parseExif(jpegWithExif("2026:09:30 09:05:00", null));
  assert.equal(onlyTime.time, "09:05"); assert.equal(onlyTime.lat, null);
});

test("EXIF — 사진끼리 시각(2시간)·위치(300m)가 다르면 충돌로 본다", () => {
  const a = { date: "2026-09-30", time: "10:00", lat: 35.15, lng: 129.11 };
  assert.deepEqual(exifConflict([a, { ...a, time: "11:30" }]), { time: false, place: false });
  assert.deepEqual(exifConflict([a, { ...a, time: "13:01" }]).time, true);
  assert.deepEqual(exifConflict([a, { ...a, lat: 35.16 }]).place, true);
});

test("EXIF 는 제안일 뿐 — 업로드 파일은 서버가 APP1 을 지운다(사진 3장 API 포함)", () => {
  const photos = read("functions", "api", "user-spots", "[id]", "photos.ts");
  assert.match(photos, /stripJpegApp1\(fileBytes\)/);
  assert.doesNotMatch(photos, /json\(\{[^}]*storage_path/);
  const form = read("src", "components", "UserSpotForm.tsx");
  assert.match(form, /exifAsk/);
  assert.match(form, /onClick=\{\(\) => \{\s*setForm\(p => \(\{ \.\.\.p, lat: exifChosen\.e\.lat/, "촬영 위치는 누를 때만 쓴다");
});

// ── 사진 여러 장 저장 흐름 ──────────────────────────────────────────────────
const FILE = (n: string) => ({ name: n } as unknown as File);
function deps(over: Partial<Parameters<typeof runCreateFlow>[2]> = {}) {
  const calls: string[] = [];
  const d = {
    compress: async (f: File) => { calls.push(`c:${(f as { name: string }).name}`); return new Blob(["x"]); },
    createJson: async () => { calls.push("json"); return "spot-1"; },
    createWithPhoto: async () => { calls.push("with"); return { ok: true, id: "spot-1" }; },
    uploadPhoto: async () => { calls.push("up"); return { ok: true }; },
    appendPhoto: async () => { calls.push("app"); return { ok: true }; },
    ...over,
  };
  return { d, calls };
}

test("이름만(위치 미정) — JSON 경로로 만든다", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ name: "광안리 카페", lat: null, lng: null }, [], d);
  assert.equal(r.created, true);
  assert.deepEqual(calls, ["json"]);
});

test("사진 3장 — 첫 장은 대표, 나머지는 덧붙이고 3장 모두 셌다", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ lat: 35, lng: 129 }, [FILE("a"), FILE("b"), FILE("c")], d);
  assert.equal(r.created, true); assert.equal(r.photosSaved, 3); assert.equal(r.photosFailed, 0);
  assert.deepEqual(calls, ["c:a", "json", "up", "c:b", "app", "c:c", "app"]);
});

test("사진 일부 실패 — 성공처럼 보이지 않게 몇 장 실패했는지 돌려준다", async () => {
  let n = 0;
  const { d } = deps({ appendPhoto: async () => ({ ok: ++n !== 1 }) });
  const r = await runCreateFlow({ lat: 35, lng: 129 }, [FILE("a"), FILE("b"), FILE("c")], d);
  assert.equal(r.created, true);
  assert.equal(r.notice, "savedPhotosPartial");
  assert.equal(r.photosSaved, 2); assert.equal(r.photosFailed, 1);
});

test("4장을 줘도 3장까지만 다룬다", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ lat: 35, lng: 129 }, [FILE("a"), FILE("b"), FILE("c"), FILE("d")], d);
  assert.equal(r.photosSaved, 3);
  assert.ok(!calls.includes("c:d"));
});

// ── My Trip 시작·추가 ───────────────────────────────────────────────────────
const SPOT = { id: "11111111-1111-4111-8111-111111111111", name: "강릉 안목 카페", city: "Gangneung", lat: 37.77, lng: 128.95 };

test("일정 칸 — sourceKey 는 user_spot:<id>, 좌표는 있을 때만, 없으면 지어내지 않는다", () => {
  const s = buildPlaceStop(SPOT, "강릉 안목 카페", "14:20");
  assert.equal(s.sourceKey, `user_spot:${SPOT.id}`);
  assert.equal(s.timeSource, "user");
  assert.equal(s.lat, 37.77);
  const noLoc = buildPlaceStop({ id: SPOT.id, name: "x" }, "x", null);
  assert.ok(!("lat" in noLoc) && !("lng" in noLoc));
  assert.ok(!("timeSource" in noLoc));
});

test("현재 여행에 추가 — 오늘 Day 에 시각과 함께, 없으면 마지막 Day 에 시각 없이, 중복은 막는다", () => {
  const days = { __v: 2, scheduled: [
    { date: "2026-09-30", dayNumber: 1, places: [{ name: "a" }] },
    { date: "2026-10-01", dayNumber: 2, places: [] },
  ], unscheduled: [] };
  const stop = buildPlaceStop(SPOT, "카페", null);
  const r = appendStopToDays(days, stop, "2026-10-01", "15:05");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.dayNumber, 2);
  const placed = (r.days as typeof days).scheduled[1].places[0] as Record<string, unknown>;
  assert.equal(placed.time, "15:05"); assert.equal(placed.timeSource, "user");
  assert.equal((days.scheduled[1].places as unknown[]).length, 0, "원본을 바꾸지 않는다");

  const r2 = appendStopToDays(days, stop, "2026-12-25", "15:05");
  assert.ok(r2.ok);
  if (r2.ok) {
    const p2 = (r2.days as typeof days).scheduled[1].places[0] as Record<string, unknown>;
    assert.equal(p2.time, ""); assert.ok(!("timeSource" in p2), "다른 날의 '지금' 은 넣지 않는다");
  }

  const dup = { ...days, scheduled: [{ ...days.scheduled[0], places: [stop] }, days.scheduled[1]] };
  const r3 = appendStopToDays(dup, stop, "2026-10-01", null);
  assert.deepEqual(r3, { ok: false, reason: "duplicate", dayNumber: 1 });
  assert.deepEqual(appendStopToDays({ foo: 1 }, stop, "2026-10-01", null), { ok: false, reason: "bad_days" });
});

test("오늘·지금은 KST 기준, 5분 단위", () => {
  assert.deepEqual(nowKst(new Date("2026-09-30T23:58:00Z")), { date: "2026-10-01", time: "08:55" });
});

test("여행 시작은 AI 를 부르지 않고, 기록은 비공개로 만든다", () => {
  const client = read("src", "lib", "user-spots", "start-trip-client.ts");
  const server = read("functions", "api", "trip-moments", "from-user-spot.ts");
  for (const src of [client, server]) {
    assert.doesNotMatch(src, /gemini|\/api\/import\/analyze|ai_user_reserve|\/api\/plan/i);
  }
  assert.doesNotMatch(server, /is_public\s*:/, "공개 여부를 여기서 정하지 않는다(기본 false)");
  assert.match(server, /stop_key:\s*stopKey/);
  assert.match(client, /travel_style: "my_place"/);
  // 5개 도시 강요 금지 — 장소 도시를 그대로(없으면 빈 값)
  assert.match(client, /city: tripCityKey\(input\.spot\.city \?\? ""\)/);
});

test("문구 — 곧은 따옴표가 {자리}를 가리지 않는다(ICU 에서 '{name}' 은 글자 그대로 찍힌다)", () => {
  for (const locale of ["ko", "en", "ja", "zh"]) {
    const picks = JSON.parse(read("src", "messages", `${locale}.json`)).picks as Record<string, string>;
    for (const [k, v] of Object.entries(picks)) {
      if (typeof v === "string") assert.doesNotMatch(v, /'[{}#|]/, `${locale}.picks.${k}`);
    }
  }
});

// ── HEIC (2026-10-02) ───────────────────────────────────────────────────────
// 시험 파일: libheif(x265)로 만든 HEIC, EXIF 촬영 시각 2026-09-30 14:20 · GPS 35.1532,129.1186.
test("HEIC — ftyp 로 알아보고, Exif 항목에서 촬영 시각·위치를 읽는다", async () => {
  const { isHeif, readPhotoExif } = await import("../photo-exif.ts");
  const buf = readFileSync(join(ROOT, "src", "lib", "__fixtures__", "exif-gwangalli.heic"));
  assert.equal(isHeif(new Uint8Array(buf.subarray(0, 64))), true);
  const e = await readPhotoExif(new Blob([buf]));
  assert.deepEqual(e, { date: "2026-09-30", time: "14:20", lat: 35.1532, lng: 129.1186 });
  assert.equal(isHeif(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), false);
});

test("열 수 없는 사진은 고를 때 걸러 내고 이유를 말한다(HEIC 따로)", () => {
  const form = read("src", "components", "UserSpotForm.tsx");
  assert.match(form, /checkPhotoPick\(f\)/);
  assert.match(form, /photoHeicUnsupported/);
  for (const locale of ["ko", "en", "ja", "zh"]) {
    const picks = JSON.parse(read("src", "messages", `${locale}.json`)).picks;
    for (const k of ["photoHeicUnsupported", "photoUnreadablePick", "photoOverLimit", "photoChecking"]) assert.ok(picks[k], `${locale}.${k}`);
  }
});
