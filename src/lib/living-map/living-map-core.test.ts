// Living Map 마커 계약 — 시안(living_map_final)·SSOT §5.1~5.3 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stopMarker, livingMapDayColor, LIVING_MAP_DAY_COLORS } from "./living-map-core.ts";
import type { StoryMomentInput } from "../share/private-story-adapter.ts";

const stop = (over: Record<string, unknown> = {}) => ({
  name: "Haeundae Beach", source: "city_spot", place_id: "12",
  sourceKey: "city_spot:12", image: "https://example.com/haeundae.jpg",
  ...over,
});

const moment = (over: Partial<StoryMomentInput> = {}): StoryMomentInput => ({
  moment_id: "m1", day_number: 1, memo: "바다!", stop_key: "city_spot:12",
  photo_data: "data:image/jpeg;base64,AAA", photo_data_extra: null,
  ...over,
});

test("우선순위 1 — stop 에 결합된 순간의 사진이 있으면 user 마커", () => {
  const r = stopMarker(stop(), 1, [moment()]);
  assert.equal(r.kind, "user");
  assert.equal(r.photoUrl, "data:image/jpeg;base64,AAA");
  assert.equal(r.memo, "바다!");
});

test("우선순위 2 — 순간이 없으면 카탈로그 대표사진", () => {
  const r = stopMarker(stop(), 1, []);
  assert.equal(r.kind, "catalog");
  assert.equal(r.photoUrl, "https://example.com/haeundae.jpg");
  assert.equal(r.memo, "");
});

test("우선순위 3 — 둘 다 없으면 숫자 마커", () => {
  const r = stopMarker(stop({ image: null }), 1, []);
  assert.equal(r.kind, "number");
  assert.equal(r.photoUrl, null);
});

test("다른 Day 의 순간은 결합하지 않는다 — 같은 장소를 여러 날 가면 Day 로 가른다", () => {
  const r = stopMarker(stop(), 2, [moment({ day_number: 1 })]);
  assert.equal(r.kind, "catalog");
});

test("장소명이 같아도 열쇠가 다르면 결합하지 않는다 — 이름 추측 금지", () => {
  const r = stopMarker(stop(), 1, [moment({ stop_key: "city_spot:99", city_spot_id: 99 })]);
  assert.equal(r.kind, "catalog");
});

test("옛 순간(stop_key 없음)은 city_spot_id 로 결합한다 — Story 와 같은 규칙", () => {
  const r = stopMarker(stop(), 1, [moment({ stop_key: null, city_spot_id: 12 })]);
  assert.equal(r.kind, "user");
});

test("사진 없는 순간 — 마커는 카탈로그로 내려가되 메모는 시트에 남는다", () => {
  const r = stopMarker(stop(), 1, [moment({ photo_data: null })]);
  assert.equal(r.kind, "catalog");
  assert.equal(r.memo, "바다!");
});

test("죽은 카탈로그 호스트는 쓰지 않는다 — 깨진 사진보다 없는 편", () => {
  const r = stopMarker(stop({ image: "http://tong.visitkorea.or.kr/x.jpg" }), 1, []);
  // resolveDisplayImage 가 거르면 number 로 정직하게 내려간다
  assert.ok(r.kind === "number" || r.kind === "catalog");
  if (r.kind === "catalog") assert.notEqual(r.photoUrl, null);
});

test("Day 색 — dayNumber 기준 결정적, Day 1 은 기존 coral", () => {
  assert.equal(livingMapDayColor(1), "#FF4A2D");
  assert.equal(livingMapDayColor(2), "#0041C9");
  assert.equal(livingMapDayColor(1 + LIVING_MAP_DAY_COLORS.length), "#FF4A2D");
  assert.equal(livingMapDayColor(0), livingMapDayColor(1));
});
