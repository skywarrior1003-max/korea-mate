// 연속된 고정 일정 사이의 물리적 이동 가능성.
//
// 무엇을 막는가
//   10:00–10:45 약속 다음에 11:00 공연이 있고 그 둘이 18km 떨어져 있으면,
//   시계상으로는 겹치지 않지만 사람은 갈 수 없다. HC-5 는 시간 겹침만 보므로
//   이 일정이 그대로 성공으로 나왔다.
//
// 어떻게 고쳤나
//   P1·P2 로 고정을 전부 놓은 뒤, 시간순으로 이웃한 고정 쌍마다
//   끝 시각 + 이동시간 ≤ 다음 시작 시각 인지 본다. 아니면 실패시킨다.
//
//   고정은 사용자가 정한 사실이다. 앞당기지도 늦추지도 줄이지도 지우지도
//   않는다 — 대신 일정을 만들지 않고 사용자가 직접 고치게 한다.
//
//   좌표를 모르면 확인하지 않는다. 모르는 이동시간을 지어내지 않고, 확인하지
//   못했다는 이유로 고정 자체를 막지도 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { runScheduler } from "./engine.ts";
import { estimateTravelMinutes } from "./travel-time-estimator.ts";
import { planDayAnchors, mergeDayHints } from "../trip-fixed/anchor-build.ts";

const BASE = { lat: 35.1587, lng: 129.1603 };
/** 1 ≈ 90m, 200 ≈ 18km. */
const at = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });

interface Anchor { place_id: string; start_time: string; end_time: string; is_fixed: true }

/** 좌표를 넘긴 항목만 candidates 에 들어간다 — 넘기지 않으면 해석 불가 상태가 된다. */
function run(anchors: Anchor[], coords: Record<string, number>) {
  const r = runScheduler({
    trip_date: "2026-10-17", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal",
    candidates: Object.entries(coords).map(([id, n]) => ({
      place_id: id, category: "event", coordinate: at(n),
      zone_id: 1 as const, distance_m: 300, score: 1,
    })),
    anchors,
  } as never) as {
    success: boolean;
    error?: { code: string };
    data?: { items: { place_id?: string; start_time: string; end_time: string; is_fixed: boolean }[] };
  };
  return {
    ok: r.success, code: r.error?.code,
    id: (x: string) => (r.data?.items ?? []).find(i => i.place_id === x),
  };
}

const A = { place_id: "A", start_time: "10:00", end_time: "10:45", is_fixed: true } as const;

// ── A. 물리 충돌 FAIL ────────────────────────────────────────────────────────

test("A 시간은 안 겹쳐도 갈 수 없으면 일정을 만들지 않는다", () => {
  // A(at 1) → B(at 200) = 18km → 40분. 여유는 10:45~11:00 의 15분뿐이다.
  const need = estimateTravelMinutes(at(1), at(200));
  assert.equal(need, 40, "표 기준 40분이어야 이 케이스가 성립한다");

  const r = run(
    [A, { place_id: "B", start_time: "11:00", end_time: "12:00", is_fixed: true }],
    { A: 1, B: 200 },
  );
  assert.equal(r.ok, false, "성공으로 내보내면 안 된다");
  assert.equal(r.code, "HC-9");
});

// ── B. 물리 가능 PASS ────────────────────────────────────────────────────────

test("B 이동할 시간이 있으면 그대로 배치한다", () => {
  // 여유 45분 ≥ 필요 40분.
  const r = run(
    [A, { place_id: "B", start_time: "11:30", end_time: "12:30", is_fixed: true }],
    { A: 1, B: 200 },
  );
  assert.ok(r.ok);
  assert.equal(r.id("A")!.start_time, "10:00");
  assert.equal(r.id("A")!.end_time,   "10:45");
  assert.equal(r.id("B")!.start_time, "11:30");
  assert.equal(r.id("B")!.end_time,   "12:30");
});

test("B 경계값 — 필요 시간과 여유가 같으면 통과한다", () => {
  // 10:45 + 40분 = 11:25. 정확히 도착한다.
  const r = run(
    [A, { place_id: "B", start_time: "11:25", end_time: "12:00", is_fixed: true }],
    { A: 1, B: 200 },
  );
  assert.ok(r.ok, "딱 맞으면 막지 않는다");
});

// ── C. 시간 overlap 은 기존 HC-5 그대로 ──────────────────────────────────────

test("C 시간이 겹치면 예전처럼 HC-5 다", () => {
  const r = run(
    [A, { place_id: "B", start_time: "10:30", end_time: "11:30", is_fixed: true }],
    { A: 1, B: 2 },   // 붙어 있어 이동은 문제없다 — 겹침만 남는다
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "HC-5", "겹침은 HC-9 가 아니라 HC-5 로 남아야 한다");
});

// ── D. 고정 1개 ──────────────────────────────────────────────────────────────

test("D 고정이 하나뿐이면 이 검사가 아무것도 하지 않는다", () => {
  const r = run([A], { A: 1 });
  assert.ok(r.ok);
  assert.equal(r.id("A")!.start_time, "10:00");
});

// ── E. 고정 3개 — 연속 pair 각각 ─────────────────────────────────────────────

test("E 세 개 중 뒤쪽 한 쌍만 불가능해도 전체가 실패한다", () => {
  // A→B 가능(붙어 있음), B→C 불가능(18km 인데 여유 15분)
  const r = run(
    [
      A,
      { place_id: "B", start_time: "11:00", end_time: "11:45", is_fixed: true },
      { place_id: "C", start_time: "12:00", end_time: "13:00", is_fixed: true },
    ],
    { A: 1, B: 2, C: 200 },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "HC-9");
});

test("E 세 개가 모두 가능하면 전부 배치된다", () => {
  const r = run(
    [
      A,
      { place_id: "B", start_time: "11:00", end_time: "11:45", is_fixed: true },
      { place_id: "C", start_time: "12:30", end_time: "13:30", is_fixed: true },
    ],
    { A: 1, B: 2, C: 200 },
  );
  assert.ok(r.ok);
  for (const id of ["A", "B", "C"]) assert.ok(r.id(id), `${id} 가 있어야 한다`);
});

// ── F. 입력 순서 역전 ────────────────────────────────────────────────────────

test("F 배열 순서가 뒤섞여도 시간순 이웃 쌍을 본다", () => {
  // C, A, B 순으로 넣는다. 확인해야 하는 것은 A→B 와 B→C 다.
  // B→C 가 불가능하므로 실패해야 한다. 배열 이웃(C,A / A,B)만 보면 놓친다.
  const shuffled = [
    { place_id: "C", start_time: "12:00", end_time: "13:00", is_fixed: true } as const,
    A,
    { place_id: "B", start_time: "11:00", end_time: "11:45", is_fixed: true } as const,
  ];
  const r = run(shuffled as never, { A: 1, B: 2, C: 200 });
  assert.equal(r.ok, false, "시간순으로 정렬하지 않으면 이 결함을 놓친다");
  assert.equal(r.code, "HC-9");
});

test("F 순서가 뒤섞이고 실제로 가능하면 통과한다", () => {
  const shuffled = [
    { place_id: "C", start_time: "12:30", end_time: "13:30", is_fixed: true } as const,
    A,
    { place_id: "B", start_time: "11:00", end_time: "11:45", is_fixed: true } as const,
  ];
  const r = run(shuffled as never, { A: 1, B: 2, C: 200 });
  assert.ok(r.ok);
});

// ── G. 좌표 없음 — UNVERIFIED ────────────────────────────────────────────────

test("G 좌표를 모르면 검증하지 않고 고정을 그대로 둔다", () => {
  // B 를 candidates 에서 빼 좌표를 해석할 수 없게 만든다.
  // 같은 시간 배치가 A 케이스에서는 HC-9 였다.
  const r = run(
    [A, { place_id: "B", start_time: "11:00", end_time: "12:00", is_fixed: true }],
    { A: 1 },
  );
  assert.ok(r.ok, "확인하지 못했다는 이유로 사용자의 고정을 막지 않는다");
  assert.ok(r.id("A"), "A 가 남아야 한다");
  assert.ok(r.id("B"), "B 가 남아야 한다 — 자동 삭제·이동 금지");
  assert.equal(r.id("B")!.start_time, "11:00");
});

test("G 양쪽 다 좌표가 없어도 마찬가지다", () => {
  const r = run(
    [A, { place_id: "B", start_time: "11:00", end_time: "12:00", is_fixed: true }],
    {},
  );
  assert.ok(r.ok);
  assert.ok(r.id("A") && r.id("B"));
});

// ── I. This Trip Fixed 실제 경로 ─────────────────────────────────────────────

test("I This Trip 고정 두 개가 같은 conflict 를 만든다", () => {
  const DATE = "2026-10-17";
  const hints = [
    { place_id: "meet", lat: at(1).lat,   lng: at(1).lng,
      fixed: { date: DATE, startTime: "10:00", durationMinutes: 45 } },
    { place_id: "gig",  lat: at(200).lat, lng: at(200).lng,
      fixed: { date: DATE, startTime: "11:00", durationMinutes: 60 } },
  ];

  const plan = planDayAnchors(hints, DATE, "09:00", "21:00");
  assert.equal(plan.anchors.length, 2, "둘 다 anchor 로 나가야 한다");

  const merged = mergeDayHints([], plan);
  const r = runScheduler({
    trip_date: DATE, start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal",
    candidates: merged.map(h => ({
      place_id: h.place_id, category: "event",
      coordinate: { lat: h.lat, lng: h.lng },
      zone_id: 1 as const, distance_m: 300, score: 1,
    })),
    anchors: plan.anchors,
  } as never) as { success: boolean; error?: { code: string } };

  assert.equal(r.success, false, "This Trip 경로에서도 동일하게 실패해야 한다");
  assert.equal(r.error!.code, "HC-9");
});

test("I This Trip 고정이 물리적으로 가능하면 정상 생성된다", () => {
  const DATE = "2026-10-17";
  const hints = [
    { place_id: "meet", lat: at(1).lat,   lng: at(1).lng,
      fixed: { date: DATE, startTime: "10:00", durationMinutes: 45 } },
    { place_id: "gig",  lat: at(200).lat, lng: at(200).lng,
      fixed: { date: DATE, startTime: "11:30", durationMinutes: 60 } },
  ];
  const plan = planDayAnchors(hints, DATE, "09:00", "21:00");
  const merged = mergeDayHints([], plan);
  const r = runScheduler({
    trip_date: DATE, start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal",
    candidates: merged.map(h => ({
      place_id: h.place_id, category: "event",
      coordinate: { lat: h.lat, lng: h.lng },
      zone_id: 1 as const, distance_m: 300, score: 1,
    })),
    anchors: plan.anchors,
  } as never) as { success: boolean; data?: { items: { place_id?: string; start_time: string }[] } };

  assert.equal(r.success, true);
  const gig = (r.data?.items ?? []).find(i => i.place_id === "gig");
  assert.equal(gig?.start_time, "11:30", "사용자가 정한 시각 그대로여야 한다");
});

// ── 고정을 건드리지 않았다는 확인 ────────────────────────────────────────────

test("실패해도 고정 시간을 바꾸거나 지우지 않는다 — 실패만 한다", () => {
  const r = run(
    [A, { place_id: "B", start_time: "11:00", end_time: "12:00", is_fixed: true }],
    { A: 1, B: 200 },
  );
  assert.equal(r.ok, false);
  // 실패 결과에는 data 가 없다 — 절충된 일정을 내놓지 않는다.
  assert.equal(r.id("A"), undefined);
  assert.equal(r.id("B"), undefined);
});
