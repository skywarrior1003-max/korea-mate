// 자동 추천 범위와 사용자가 직접 정한 시각을 섞지 않는다.
//
// 무엇을 막는가
//   09:00~21:00 은 "이 시간대에 알아서 채워 준다" 는 기본값이다. 그런데 그
//   기본값으로 사용자가 정한 19:00~22:00 공연을 걸러 냈고, 걸러진 장소가
//   일반 후보로 되돌아가 **09:08 에 배치**됐다. 사용자는 19시라고 적었는데
//   아침에 놓인 일정을 보게 된다.
//
// 어떻게 고쳤나
//   판정 기준을 자동 창이 아니라 **진짜 못 넘는 선**으로 바꿨다. 첫날의 도착
//   시각과 마지막 날의 출발 시각만 실제 경계다. 그리고 경계에 걸린 항목은
//   후보 풀에서도 빼서 다른 시각에 슬그머니 놓이지 않게 했다.
//
//   자동 추천 범위 자체는 넓히지 않는다. 22시에 끝나는 공연이 있다고 해서
//   22:20 카페를 붙여 주지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { runScheduler } from "../scheduler/engine.ts";
import { fixedFitsHardBoundary, fixedFitsDayWindow, tripDates } from "./fixed-core.ts";
import { planDayAnchors, mergeDayHints } from "./anchor-build.ts";

const DAYS = tripDates("2026-10-16", 3);
const DATE = DAYS[1]!;

const BASE = { lat: 37.5665, lng: 126.9780 };
const at = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });

const hint = (id: string, n: number, fixed: { startTime: string; durationMinutes: number } | null) => ({
  place_id: id, lat: at(n).lat, lng: at(n).lng,
  fixed: fixed ? { date: DATE, ...fixed } : null,
});

/** 자동 창은 늘 09:00~21:00 이다. 경계는 인자로 따로 준다. */
function schedule(
  hints: ReturnType<typeof hint>[],
  hardStart: string | null,
  hardEnd: string | null,
  extra: Record<string, unknown> = {},
) {
  const plan   = planDayAnchors(hints, DATE, hardStart, hardEnd);
  const merged = mergeDayHints(hints, plan);
  const r = runScheduler({
    trip_date: DATE, start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal",
    candidates: merged.map(h => ({
      place_id: h.place_id, category: "attraction",
      coordinate: { lat: h.lat, lng: h.lng },
      zone_id: 1 as const, distance_m: 300, score: 500,
    })),
    anchors: plan.anchors,
    ...extra,
  } as never) as { success: boolean; error?: { code: string }; data?: { items: never[] } };

  const items = ((r.data?.items ?? []) as { place_id?: string; start_time: string; end_time: string; is_fixed: boolean }[])
    .filter(i => i.place_id);
  return {
    plan, merged, ok: r.success, code: r.error?.code, items,
    id: (x: string) => items.find(i => i.place_id === x),
  };
}

// ── B·F. 이번 수정의 핵심 ────────────────────────────────────────────────────

test("B 자동 종료가 21:00 이어도 사용자가 정한 19:00–22:00 은 그대로 간다", () => {
  const r = schedule([hint("gig", 2, { startTime: "19:00", durationMinutes: 180 })], null, null);
  assert.ok(r.ok);
  const gig = r.id("gig");
  assert.ok(gig, "사용자가 정한 일정이 사라지면 안 된다");
  assert.equal(gig!.start_time, "19:00");
  assert.equal(gig!.end_time,   "22:00");
  assert.equal(gig!.is_fixed,   true);
});

test("F 경계에 걸린 사용자 지정은 일반 후보로 강등되지 않는다", () => {
  // 21:00 에 실제로 떠나는 날. 19:00–22:00 은 성립할 수 없다.
  const r = schedule([hint("gig", 2, { startTime: "19:00", durationMinutes: 180 })], null, "21:00");
  assert.deepEqual(r.plan.anchors, [], "경계 밖이면 anchor 가 아니다");
  assert.deepEqual(r.plan.outOfBoundary.map(h => h.place_id), ["gig"], "이름은 남는다");
  assert.deepEqual(r.merged.map(h => h.place_id), [], "후보 풀에서도 빠져야 한다");
  assert.equal(r.id("gig"), undefined,
    "사용자가 19시라고 적은 것을 다른 시각에 놓아 주지 않는다");
});

test("F 수정 전 결함 재현 — 자동 창으로 판정하면 아침에 놓인다", () => {
  // 자동 창(09:00~21:00) 기준으로는 19:00~22:00 이 '창 밖' 이다.
  // 그 기준을 쓰면 anchor 에서 빠지고, 빠진 장소가 후보로 남아 아침에 놓였다.
  const fixed = { date: DATE, startTime: "19:00", durationMinutes: 180 };
  assert.equal(fixedFitsDayWindow(fixed, "09:00", "21:00"), false,
    "자동 창 기준으로는 벗어난다 — 이 값으로 판정하면 안 되는 이유");
  assert.equal(fixedFitsHardBoundary(fixed, null, null), true,
    "실제 경계가 없으면 허용해야 한다");
});

// ── A·C. 자동 추천 범위는 넓어지지 않는다 ────────────────────────────────────

test("A·C 22시에 끝나는 공연이 있어도 그 뒤에 자동 후보를 붙이지 않는다", () => {
  const r = schedule([
    hint("gig",  2, { startTime: "19:00", durationMinutes: 180 }),
    hint("c1",   3, null),
    hint("c2",   4, null),
    hint("c3",   5, null),
  ], null, null);
  assert.ok(r.ok);

  const auto = r.items.filter(i => !i.is_fixed);
  assert.ok(auto.length > 0, "자동 후보는 낮 시간에 들어가야 한다");
  for (const a of auto) {
    assert.ok(a.end_time <= "21:00",
      `${a.place_id} 가 ${a.end_time} 까지 간다 — 자동 추천 창이 넓어졌다`);
  }
});

// ── D. 오전 explicit ─────────────────────────────────────────────────────────

test("D 자동 시작이 09:00 이어도 07:30 예약은 유지된다", () => {
  const r = schedule([hint("early", 2, { startTime: "07:30", durationMinutes: 60 })], null, null);
  assert.ok(r.ok);
  const e = r.id("early");
  assert.ok(e, "이른 예약이 사라지면 안 된다");
  assert.equal(e!.start_time, "07:30");
  assert.equal(e!.end_time,   "08:30");
});

test("D 도착 시각보다 이른 일정은 성립하지 않는다", () => {
  // 첫날 11:00 도착. 07:30 일정은 그날 존재할 수 없다.
  const r = schedule([hint("early", 2, { startTime: "07:30", durationMinutes: 60 })], "11:00", null);
  assert.deepEqual(r.plan.anchors, []);
  assert.deepEqual(r.plan.outOfBoundary.map(h => h.place_id), ["early"]);
  assert.equal(r.id("early"), undefined, "다른 시각으로 옮기지 않는다");
});

// ── E. 출발 hard boundary ────────────────────────────────────────────────────

test("E 출발이 앞서면 옮기지 않고 표면화한다", () => {
  const r = schedule([hint("gig", 2, { startTime: "19:00", durationMinutes: 180 })], null, "21:30");
  assert.deepEqual(r.plan.outOfBoundary.map(h => h.place_id), ["gig"],
    "22:00 종료는 21:30 출발을 넘는다");
  assert.equal(r.id("gig"), undefined, "축소하지도 앞당기지도 않는다");
});

test("E 출발 안에 들어가면 그대로 간다", () => {
  const r = schedule([hint("gig", 2, { startTime: "19:00", durationMinutes: 120 })], null, "21:30");
  assert.ok(r.ok);
  assert.equal(r.id("gig")!.end_time, "21:00");
});

// ── 경계 함수 자체 ───────────────────────────────────────────────────────────

test("경계 판정 — 없는 쪽은 검사하지 않는다", () => {
  const f = (s: string, d: number) => ({ date: DATE, startTime: s, durationMinutes: d });
  assert.equal(fixedFitsHardBoundary(f("19:00", 180), null, null),      true);
  assert.equal(fixedFitsHardBoundary(f("19:00", 180), null, "22:00"),   true,  "딱 맞으면 통과");
  assert.equal(fixedFitsHardBoundary(f("19:00", 180), null, "21:59"),   false);
  assert.equal(fixedFitsHardBoundary(f("07:30", 60),  "07:30", null),   true,  "시작과 같으면 통과");
  assert.equal(fixedFitsHardBoundary(f("07:29", 60),  "07:30", null),   false);
  assert.equal(fixedFitsHardBoundary(f("23:30", 60),  null, null),      false, "자정을 넘길 수 없다");
});

// ── I·J. 기존 계약 유지 ──────────────────────────────────────────────────────

test("I 사용자 지정은 넘침 정리 대상이 아니다", () => {
  const r = schedule([
    hint("gig", 2, { startTime: "19:00", durationMinutes: 180 }),
    hint("c1",  3, null), hint("c2", 4, null), hint("c3", 5, null),
  ], null, null);
  assert.ok(r.id("gig"), "지정 일정은 남는다");
  // 미배치가 생기더라도 지정 일정은 그 안에 없다
  const placed = new Set(r.items.map(i => i.place_id));
  const unplaced = r.merged.filter(h => !placed.has(h.place_id));
  assert.ok(!unplaced.some(h => h.fixed), "지정 일정이 미배치로 밀리면 안 된다");
});

test("J My Place 도 같은 계약을 받는다", () => {
  const key = "user_spot:11111111-2222-3333-4444-555555555555";
  const r = schedule([{ place_id: key, lat: at(2).lat, lng: at(2).lng,
    fixed: { date: DATE, startTime: "19:00", durationMinutes: 180 } }], null, null);
  assert.ok(r.ok);
  const it = r.id(key);
  assert.ok(it, "My Place 지정 일정도 유지된다");
  assert.equal(it!.start_time, "19:00");
  assert.equal(it!.end_time,   "22:00");
});

// ── G·H. 기존 안전망 회귀 ────────────────────────────────────────────────────

test("G 겹치는 지정은 여전히 HC-5 로 실패한다", () => {
  const r = schedule([
    hint("a", 2, { startTime: "19:00", durationMinutes: 120 }),
    hint("b", 3, { startTime: "20:00", durationMinutes: 60 }),
  ], null, null);
  assert.equal(r.ok, false);
  assert.equal(r.code, "HC-5");
});

test("G 갈 수 없는 지정 쌍은 여전히 HC-9 로 실패한다", () => {
  const r = schedule([
    hint("a", 1,   { startTime: "10:00", durationMinutes: 45 }),
    hint("b", 200, { startTime: "11:00", durationMinutes: 60 }),
  ], null, null);
  assert.equal(r.ok, false);
  assert.equal(r.code, "HC-9");
});
