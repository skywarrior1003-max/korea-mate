// Page 1 판정 테스트
// 실행: node --experimental-strip-types src/components/home/home-experience-selector.test.ts
//
// 가장 중요한 규칙은 "Memory 가 있어도 마무리 신호가 없으면 넘어가지 않는다" 다.
// 자동 전환은 사용자가 하지 않은 결정을 대신 내리는 것이라, 여기서 고정해 둔다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectHomeExperience, NO_FINISH_SIGNAL } from "./home-experience-selector.ts";

type Row = { id: string; city: string; start_date: string; end_date: string;
             travelers: string; travel_style: string; days: unknown; updated_at?: string };

const trip = (id: string, o: Partial<Row> = {}): Row => ({
  id, city: "Busan", start_date: "2026-05-01", end_date: "2026-05-03",
  travelers: "2", travel_style: "Couple", days: [], updated_at: "2026-05-04T00:00:00Z", ...o,
});

const moment = (id: string, itin: string, at: string, photo: string | null = "data:image/jpeg;base64,AA") => ({
  moment_id: id, itinerary_id: itin, device_id: "d", photo_data: photo,
  memo: "좋았다", category: "food" as const, lat: null, lng: null,
  location_label: "", captured_at: at, day_number: 1, synced: true,
});

/** momentsOf 를 맵에서 만든다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (m: Record<string, any[]>) => (id: string) => m[id] ?? [];
const ALWAYS = () => true;

// ── 마무리 신호 없음 → 항상 storytelling ────────────────────────────────────
test("no trips → storytelling", () => {
  const r = selectHomeExperience({ trips: [], momentsOf: from({}), finishSignalOf: ALWAYS });
  assert.equal(r.page1, "storytelling");
  assert.equal(r.trip, undefined);
});

test("trips but no moments → storytelling", () => {
  const r = selectHomeExperience({
    trips: [trip("a")], momentsOf: from({}), finishSignalOf: ALWAYS,
  });
  assert.equal(r.page1, "storytelling");
});

test("moments exist but no finish signal → storytelling (자동 전환 금지)", () => {
  const r = selectHomeExperience({
    trips: [trip("a")],
    momentsOf: from({ a: [moment("m1", "a", "2026-05-02T10:00:00Z")] }),
    finishSignalOf: NO_FINISH_SIGNAL,
  });
  assert.equal(r.page1, "storytelling");
  assert.equal(r.trip, undefined);
});

test("finish signal but no moments → storytelling", () => {
  const r = selectHomeExperience({
    trips: [trip("a")], momentsOf: from({}), finishSignalOf: ALWAYS,
  });
  assert.equal(r.page1, "storytelling");
});

// ── 신호 + Memory → memory ──────────────────────────────────────────────────
test("finish signal + moment → memory", () => {
  const r = selectHomeExperience({
    trips: [trip("a")],
    momentsOf: from({ a: [moment("m1", "a", "2026-05-02T10:00:00Z")] }),
    finishSignalOf: ALWAYS,
  });
  assert.equal(r.page1, "memory");
  assert.equal(r.trip?.id, "a");
  assert.equal(r.moments.length, 1);
});

test("사진 없는 Memory 도 Memory 로 센다", () => {
  const r = selectHomeExperience({
    trips: [trip("a")],
    momentsOf: from({ a: [moment("m1", "a", "2026-05-02T10:00:00Z", null)] }),
    finishSignalOf: ALWAYS,
  });
  assert.equal(r.page1, "memory");
});

test("신호가 켜진 여행만 후보가 된다", () => {
  const r = selectHomeExperience({
    trips: [trip("a"), trip("b")],
    momentsOf: from({
      a: [moment("m1", "a", "2026-06-01T10:00:00Z")],
      b: [moment("m2", "b", "2026-05-01T10:00:00Z")],
    }),
    finishSignalOf: id => id === "b",
  });
  assert.equal(r.trip?.id, "b");
});

// ── 정렬 ────────────────────────────────────────────────────────────────────
test("1순위 — Memory 최신 captured_at 이 늦은 여행", () => {
  const r = selectHomeExperience({
    trips: [trip("a"), trip("b")],
    momentsOf: from({
      a: [moment("m1", "a", "2026-05-02T10:00:00Z")],
      b: [moment("m2", "b", "2026-05-09T10:00:00Z")],
    }),
    finishSignalOf: ALWAYS,
  });
  assert.equal(r.trip?.id, "b");
});

test("2순위 — captured_at 동률이면 updated_at 늦은 쪽", () => {
  const at = "2026-05-02T10:00:00Z";
  const r = selectHomeExperience({
    trips: [trip("a", { updated_at: "2026-05-03T00:00:00Z" }),
            trip("b", { updated_at: "2026-05-07T00:00:00Z" })],
    momentsOf: from({ a: [moment("m1", "a", at)], b: [moment("m2", "b", at)] }),
    finishSignalOf: ALWAYS,
  });
  assert.equal(r.trip?.id, "b");
});

test("3순위 — 둘 다 동률이면 id 오름차순", () => {
  const at = "2026-05-02T10:00:00Z";
  const u  = "2026-05-03T00:00:00Z";
  const r = selectHomeExperience({
    trips: [trip("zz", { updated_at: u }), trip("aa", { updated_at: u })],
    momentsOf: from({ zz: [moment("m1", "zz", at)], aa: [moment("m2", "aa", at)] }),
    finishSignalOf: ALWAYS,
  });
  assert.equal(r.trip?.id, "aa");
});

test("같은 입력이면 결과가 항상 같다", () => {
  const input = {
    trips: [trip("a"), trip("b"), trip("c")],
    momentsOf: from({
      a: [moment("m1", "a", "2026-05-02T10:00:00Z")],
      b: [moment("m2", "b", "2026-05-02T10:00:00Z")],
      c: [moment("m3", "c", "2026-05-02T10:00:00Z")],
    }),
    finishSignalOf: ALWAYS,
  };
  const first = selectHomeExperience(input).trip?.id;
  for (let i = 0; i < 5; i++) {
    assert.equal(selectHomeExperience(input).trip?.id, first);
  }
});

// ── 날짜 무관 ───────────────────────────────────────────────────────────────
test("end_date 를 미래로 바꿔도 결과가 변하지 않는다", () => {
  const m = { a: [moment("m1", "a", "2026-05-02T10:00:00Z")] };
  const past   = selectHomeExperience({ trips: [trip("a", { end_date: "2020-01-01" })], momentsOf: from(m), finishSignalOf: ALWAYS });
  const future = selectHomeExperience({ trips: [trip("a", { end_date: "2099-01-01" })], momentsOf: from(m), finishSignalOf: ALWAYS });
  assert.equal(past.page1, future.page1);
  assert.equal(past.trip?.id, future.trip?.id);
});

// ── 타임라인 정렬 ───────────────────────────────────────────────────────────
test("moments 는 오래된 순으로 정렬된다", () => {
  const r = selectHomeExperience({
    trips: [trip("a")],
    momentsOf: from({ a: [
      moment("m3", "a", "2026-05-04T10:00:00Z"),
      moment("m1", "a", "2026-05-02T10:00:00Z"),
      moment("m2", "a", "2026-05-03T10:00:00Z"),
    ] }),
    finishSignalOf: ALWAYS,
  });
  assert.deepEqual(r.moments.map(m => m.moment_id), ["m1", "m2", "m3"]);
});

test("운영 기본 신호는 항상 false", () => {
  assert.equal(NO_FINISH_SIGNAL(), false);
});
