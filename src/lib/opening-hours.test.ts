// opening-hours 정규화 단위 테스트
// 실행: node --experimental-strip-types src/lib/opening-hours.test.ts
//
// 검증 대상: structured 우선 · raw 는 표시 전용 · 부분 객체가 {open, close} 계약으로
// 새어 나가지 않는가 · 일정 변환 경계(place-detail-core)가 정규화를 사용하는가.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { structuredOpeningHours, rawOpeningHours } from "./opening-hours.ts";

test("structured 값은 그대로 통과한다", () => {
  assert.deepEqual(structuredOpeningHours({ open: "09:00", close: "18:00" }), { open: "09:00", close: "18:00" });
  assert.equal(rawOpeningHours({ open: "09:00", close: "18:00" }), null);
});

test("structured 와 raw 가 공존하면 structured 가 우선한다", () => {
  const v = { open: "10:00", close: "22:00", raw: "10:00-22:00 (브레이크 15-17)" };
  assert.deepEqual(structuredOpeningHours(v), { open: "10:00", close: "22:00" });
});

test("raw-only 는 structured 로 인정되지 않고 원문 그대로 반환된다", () => {
  const raw = "11:30 - 21:00 (20:30 라스트오더)";
  assert.equal(structuredOpeningHours({ raw }), null);
  assert.equal(rawOpeningHours({ raw }), raw);
});

test("부분 구조화(open 만/close 만)는 structured 가 아니다", () => {
  assert.equal(structuredOpeningHours({ open: "09:00" }), null);
  assert.equal(structuredOpeningHours({ close: "18:00" }), null);
  assert.equal(structuredOpeningHours({ open: "", close: "18:00" }), null);
});

test("null/undefined/빈 raw 는 전부 '없음'", () => {
  assert.equal(structuredOpeningHours(null), null);
  assert.equal(structuredOpeningHours(undefined), null);
  assert.equal(rawOpeningHours(null), null);
  assert.equal(rawOpeningHours({ raw: "  " }), null);
});

test("일정 변환 경계는 정규화를 통해서만 openingHours 를 전달한다 (raw 누출 차단)", () => {
  const core = readFileSync(new URL("./place-detail/place-detail-core.ts", import.meta.url), "utf8");
  assert.match(core, /openingHours:\s+structuredOpeningHours\(spot\.opening_hours\)/);
  const adapters = readFileSync(new URL("./city-spots.ts", import.meta.url), "utf8");
  assert.equal((adapters.match(/structuredOpeningHours\(row\.opening_hours\)/g) ?? []).length, 2);
});
