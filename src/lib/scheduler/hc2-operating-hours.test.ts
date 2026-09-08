// HC-2 운영시간 제약 — TASK-GOKOREAMATE-PLANNER-OPENING-HOURS-HC2-PRODUCTION-V1
// 실행: node --test --experimental-strip-types src/lib/scheduler/hc2-operating-hours.test.ts
//
// 계약: KNOWN(구조화 {open, close})만 판정한다. 방문 전체 구간이 창 안이어야
// 배치한다. UNKNOWN(null)·malformed 는 추측하지 않고 통과한다 — "영업중 보장"
// 이 아니라 "알려진 폐관 시간에 놓지 않는다" 뿐이다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hc2OperatingHours } from "./constraint-validator.ts";
import { fixedFitsOpeningHours } from "../trip-fixed/fixed-core.ts";
import { planDayAnchors, mergeDayHints } from "../trip-fixed/anchor-build.ts";

const H = { open: "09:00", close: "18:00" };
const cand = (hours: { open: string; close: string } | null | undefined) =>
  ({ place_id: "p1", openingHours: hours });
const min = (h: number, m = 0) => h * 60 + m;

// ── 판정 규칙 ────────────────────────────────────────────────────────────────
test("open 전 시작은 배치 불가 (08:30 시작)", () => {
  assert.notEqual(hc2OperatingHours(cand(H), min(8, 30), 60), null);
});

test("close 후 시작은 배치 불가 (18:23 시작)", () => {
  assert.notEqual(hc2OperatingHours(cand(H), min(18, 23), 60), null);
});

test("duration 이 close 를 넘으면 배치 불가 (17:30 + 60분 > 18:00)", () => {
  assert.notEqual(hc2OperatingHours(cand(H), min(17, 30), 60), null);
});

test("창 안의 방문은 배치 가능 (14:00-15:00)", () => {
  assert.equal(hc2OperatingHours(cand(H), min(14), 60), null);
});

test("경계에 정확히 맞으면 가능 (09:00 시작 · 17:00+60분 = 18:00 종료)", () => {
  assert.equal(hc2OperatingHours(cand(H), min(9), 60), null);
  assert.equal(hc2OperatingHours(cand(H), min(17), 60), null);
});

test("UNKNOWN(null/undefined) 은 기존 fallback — 제약하지 않는다", () => {
  assert.equal(hc2OperatingHours(cand(null), min(23), 60), null);
  assert.equal(hc2OperatingHours(cand(undefined), min(3), 999), null);
});

test("malformed 는 safe UNKNOWN — HH:MM 아님·open>=close(야간영업 형태 포함)", () => {
  assert.equal(hc2OperatingHours(cand({ open: "휴무", close: "18:00" }), min(23), 60), null);
  assert.equal(hc2OperatingHours(cand({ open: "17:00", close: "02:00" }), min(3), 60), null);
  assert.equal(hc2OperatingHours(cand({ open: "12:00", close: "12:00" }), min(12), 30), null);
});

// ── Fixed (§7) ───────────────────────────────────────────────────────────────
const fx = (startTime: string, durationMinutes: number) =>
  ({ date: "2026-10-01", startTime, durationMinutes });

test("고정: 창 안이면 true, open 전·close 초과면 false, UNKNOWN/malformed 는 true", () => {
  assert.equal(fixedFitsOpeningHours(fx("14:00", 60), H), true);
  assert.equal(fixedFitsOpeningHours(fx("08:30", 60), H), false);
  assert.equal(fixedFitsOpeningHours(fx("17:30", 60), H), false);
  assert.equal(fixedFitsOpeningHours(fx("10:30", 60), null), true);
  assert.equal(fixedFitsOpeningHours(fx("10:30", 60), { open: "x", close: "18:00" }), true);
});

test("고정: 운영시간 밖이면 anchor 로도, 오늘 일반 후보로도 내려가지 않는다", () => {
  const hint = { place_id: "p9", lat: 35.1, lng: 129.0, name: "박물관",
    fixed: fx("18:30", 60), openingHours: H };
  const plan = planDayAnchors([hint], "2026-10-01", null, null);
  assert.equal(plan.anchors.length, 0);
  assert.equal(plan.outOfHours.length, 1);
  assert.deepEqual(mergeDayHints([hint], plan), []);   // 조용히 다른 시각에 놓이지 않는다
});

test("고정: 경계 검사(도착·출발)가 운영시간 검사보다 먼저다 — 이유가 섞이지 않는다", () => {
  const hint = { place_id: "p9", lat: 35.1, lng: 129.0, name: "박물관",
    fixed: fx("08:00", 60), openingHours: H };
  const plan = planDayAnchors([hint], "2026-10-01", "09:00", null);
  assert.equal(plan.outOfBoundary.length, 1);
  assert.equal(plan.outOfHours.length, 0);
});

test("고정: 창 안 고정 + UNKNOWN 고정은 기존과 동일하게 anchor 가 된다", () => {
  const ok      = { place_id: "a", lat: 35.1, lng: 129.0, fixed: fx("14:00", 60), openingHours: H };
  const unknown = { place_id: "b", lat: 35.1, lng: 129.0, fixed: fx("22:00", 60), openingHours: null };
  const plan = planDayAnchors([ok, unknown], "2026-10-01", null, null);
  assert.equal(plan.anchors.length, 2);
  assert.equal(plan.outOfHours.length, 0);
});

// ── 배선 가드 — stub 회귀 방지 ───────────────────────────────────────────────
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

test("★engine 후보 루프가 hc2 를 실제로 부른다 (scored.push 이전)", () => {
  const src = read("src", "lib", "scheduler", "engine.ts");
  const call = src.indexOf("hc2OperatingHours(c, placeStart, stayMin)");
  const push = src.indexOf("scored.push({");
  assert.ok(call > 0, "engine 에 hc2 호출이 없다 — stub 회귀");
  assert.ok(push > call, "hc2 는 점수 산정(scored.push) 전에 걸러야 AI 가중치가 이길 수 없다");
});

test("★reorder pass 도 재계산 시각에 hc2 를 다시 검사한다", () => {
  const src = read("src", "lib", "scheduler", "segment-reorder.ts");
  assert.ok(src.includes("hc2OperatingHours(cand, start, n.item.stay_minutes)"),
    "segment-reorder 가 HC-2 를 재검사하지 않는다 — 14시 배치를 18:30 으로 옮길 수 있게 된다");
});

test("★plan.ts 공급 쿼리가 opening_hours 를 조회해 후보에 붙인다", () => {
  const src = read("functions", "api", "trip", "plan.ts");
  assert.ok(src.includes("opening_hours"), "공급 select 에 opening_hours 가 없다");
  assert.ok(src.includes("hoursById"), "후보에 운영시간을 붙이는 조인이 없다");
  assert.ok(src.includes("openingHours:          hint.openingHours ?? null"),
    "This Trip 픽(cartCandidates)에 운영시간이 붙지 않는다");
});
