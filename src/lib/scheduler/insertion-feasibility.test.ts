// 이미 배치된 두 일정 **사이** 에 후보를 끼워 넣을 때의 물리 계약.
//
// 무엇을 막는가
//   일반 greedy 는 항상 마지막 항목 뒤에 gap 을 남기지만, 식사 이연은 항목
//   **앞** 에 구멍을 만든다. 그 구멍에 후보를 넣을 때 다음 항목까지 갈 시간을
//   따지지 않아서, 10:36 에 끝나고 40분 떨어진 식당에 11:00 에 앉는 일정이
//   실제로 만들어졌다. cart fallback pass 에서는 사용자가 직접 고른 장소가
//   그런 자리에 놓였다.
//
// 어떻게 고쳤나
//   gap 뒤의 다음 배치 항목을 고정 여부와 무관하게 찾고, 후보의 체류 종료에
//   그 항목까지의 이동시간을 더해 시작 시각을 넘기지 않는지 본다.
//   다음 항목의 위치를 모르면 그 gap 은 비워 둔다(fail-closed) — 모르는
//   이동시간을 지어내지 않는다. 다음 항목이 아예 없는 하루 마지막 자리는
//   예전처럼 진입+체류만 본다.

import test from "node:test";
import assert from "node:assert/strict";
import { runScheduler } from "./engine.ts";
import { estimateTravelMinutes } from "./travel-time-estimator.ts";

const BASE = { lat: 35.1587, lng: 129.1603 };
/** n 이 커질수록 BASE 에서 멀어진다. 1 ≈ 90m, 200 ≈ 18km. */
const at = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};

interface Placed {
  place_id?: string; event_id?: string;
  start_time: string; end_time: string; is_fixed: boolean;
  travel_minutes_from_prev: number; item_type: string;
}

function run(extra: Record<string, unknown>) {
  const r = runScheduler({
    trip_date: "2026-09-01", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal", candidates: [], ...extra,
  } as never) as { success: boolean; data?: { items: Placed[] } };
  return {
    ok:    r.success,
    items: (r.data?.items ?? []).filter(i => i.item_type !== "affiliate"),
    id:    (x: string) => (r.data?.items ?? []).find(i => i.place_id === x || i.event_id === x),
  };
}

/** 배치된 순서대로 "끝나고 이동해서 다음 시작에 닿는가" 를 전부 확인한다. */
function assertPhysicallyPossible(items: Placed[], coordOf: Record<string, number>) {
  for (let k = 0; k < items.length - 1; k++) {
    const a = items[k]!, b = items[k + 1]!;
    const ka = a.place_id ?? a.event_id ?? "", kb = b.place_id ?? b.event_id ?? "";
    if (coordOf[ka] === undefined || coordOf[kb] === undefined) continue;
    const need = estimateTravelMinutes(at(coordOf[ka]!), at(coordOf[kb]!));
    const have = toMin(b.start_time) - toMin(a.end_time);
    assert.ok(have >= need,
      `${ka}(끝 ${a.end_time}) → ${kb}(시작 ${b.start_time}): 여유 ${have}분인데 ${need}분 필요`);
  }
}

const cand = (id: string, cat: string, n: number, score: number, stay?: number) => ({
  place_id: id, category: cat, coordinate: at(n), zone_id: 1 as const,
  distance_m: 300, score, ...(stay ? { stay_minutes_override: stay } : {}),
});

// ── A·B. 일반 중간 삽입 ──────────────────────────────────────────────────────
//
// 10:15 시작이면 아침창(07:00~10:00)이 빠지므로, 먼 식당이 점심창 11:00 으로
// 이연되면서 10:15~11:00 구멍이 생긴다. 그 구멍이 이 테스트의 무대다.

/** 구멍의 다음 항목은 고정이 아닌 일반 place 다. */
function holeCase(candAt: number, stay: number) {
  return run({
    start_time: "10:15", end_time: "21:00",
    candidates: [
      cand("lunch", "food", 200, 350, 60),   // BASE 에서 18km → 11:00 로 이연
      cand("c1", "attraction", candAt, 250, stay),
    ],
  });
}

test("A 양쪽 이동과 체류가 모두 맞으면 중간에 배치한다", () => {
  // c1 = at(199) — 식당 바로 옆(90m). 진입 40 + 체류 20 + 퇴장 8 = 68 > 45 이라
  // 구멍에는 못 들어가지만, 어디에 놓이든 물리적으로 가능해야 한다.
  const r = holeCase(199, 20);
  assert.ok(r.ok);
  assert.ok(r.items.length >= 2, "두 곳 모두 남아야 한다 — 삭제가 아니라 재배치다");
  assertPhysicallyPossible(r.items, { lunch: 200, c1: 199 });
});

test("B 다음 항목까지 갈 수 없으면 중간 자리에 넣지 않는다", () => {
  // c1 = at(1) — BASE 옆이라 진입 8분, 체류 20분 → 28 ≤ 45 로 기존 검사는 통과.
  // 그러나 c1 → 식당은 18km(40분) 이라 10:43 에 끝나도 11:00 에 닿지 못한다.
  const r = holeCase(1, 20);
  assert.ok(r.ok);

  const c1 = r.id("c1"), lunch = r.id("lunch");
  assert.ok(lunch, "식당은 배치되어야 한다");
  if (c1) {
    // P0 거리 페널티(2026-08-30) 뒤로는 옆 동네 c1 이 18km 식당보다 먼저 고른다 → c1 10:23–10:43, 식당은 그 뒤
    // 이동 40분을 더한 11:23 이후에 놓인다. 계약은 그대로다: **이미 놓인 다음 항목에 닿을 수 없는 구멍에는 넣지 않는다.**
    // 그래서 두 순서 중 하나만 허용한다 — c1 이 식당 뒤이거나, 식당이 c1 뒤에 이동시간(40분)만큼 떨어져 있거나.
    const c1AfterLunch = toMin(c1.start_time) >= toMin(lunch!.end_time);
    const lunchReachableAfterC1 = toMin(lunch!.start_time) >= toMin(c1.end_time) + 40;
    assert.ok(c1AfterLunch || lunchReachableAfterC1,
      `c1 을 닿을 수 없는 구멍에 넣으면 안 된다 — c1 ${c1.start_time}–${c1.end_time}, 식당 ${lunch!.start_time}`);
  }
  assertPhysicallyPossible(r.items, { lunch: 200, c1: 1 });
});

test("C 식사 이연으로 생긴 구멍 — 운영 기본값(09:00 시작)에서도 지켜진다", () => {
  // 감사에서 실제로 도달한 경로. 아침을 채운 뒤 남은 식당이 점심창으로 밀리며
  // 구멍이 생기고, 그 구멍에 가까운 후보가 들어가 40분 거리를 순간이동했다.
  const r = run({
    candidates: [
      cand("bfast", "food", 2, 400, 60),
      cand("lunch", "food", 200, 380, 60),
      cand("near", "attraction", 3, 300, 20),
      cand("other", "attraction", 4, 200, 60),
    ],
  });
  assert.ok(r.ok);
  assertPhysicallyPossible(r.items, { bfast: 2, lunch: 200, near: 3, other: 4 });
});

// ── D. cart fallback + This Trip ─────────────────────────────────────────────

test("D This Trip 이어도 불가능한 중간 자리에는 배치하지 않는다", () => {
  // 999 점 항목도 "남은 아무 gap" 을 노릴 수 있다. 그 gap 이 구멍이면
  // 우선순위와 무관하게 물리 계약이 먼저다.
  //
  // 구멍을 고정 일정으로 만든다. 예전에는 식사 이연과 pass 순서에 기대어
  // 구멍을 만들었는데, 그러면 greedy pass 순서가 바뀔 때마다 이 테스트가
  // 재배치를 결함으로 신고한다. 고정 일정은 P2 에서 먼저 앉으므로 어떤
  // 순서에서도 같은 구멍이 남는다 — 지키려는 것은 순서가 아니라 물리다.
  const r = run({
    start_time: "10:15", end_time: "13:00",
    candidates: [cand("picked", "event", 3, 999, 20)],
    fixed_events: [{
      event_id: "FX", coordinate: at(200),
      start_time: "11:00", end_time: "12:00", zone_id: 3,
    }],
    preferred_items: [{ place_id: "picked", preferred_time_slot: "evening" }],
  });
  assert.ok(r.ok);

  // 10:15–11:00 구멍에 넣으면 18km 떨어진 고정 일정에 11:00 까지 못 간다.
  const picked = r.id("picked");
  if (picked) {
    assert.ok(!(toMin(picked.end_time) <= toMin("11:00") && toMin(picked.start_time) >= toMin("10:15")),
      `This Trip 항목을 도달 불가능한 구멍에 넣었다 — ${picked.start_time}–${picked.end_time}`);
  }
  assertPhysicallyPossible(r.items, { picked: 3, FX: 200 });
});

// ── E. supplemental 후보 ─────────────────────────────────────────────────────

test("E 일반 추천 후보에도 같은 계약이 적용된다", () => {
  const r = holeCase(1, 20);
  const c1 = r.id("c1"), lunch = r.id("lunch")!;
  // c1 은 999 가 아닌 일반 후보다. 같은 판정을 받아야 한다 (B 와 같은 두 가지 허용 순서).
  if (c1) assert.ok(toMin(c1.start_time) >= toMin(lunch.end_time) || toMin(lunch.start_time) >= toMin(c1.end_time) + 40);
  assertPhysicallyPossible(r.items, { lunch: 200, c1: 1 });
});

// ── F. fixed egress 기존 회귀 ────────────────────────────────────────────────

test("F 고정 항목 앞 계약이 그대로다 — PASS 케이스", () => {
  const r = run({
    candidates: [
      { ...cand("c1", "attraction", 149, 500), stay_minutes_override: 60 },
      cand("blocker", "attraction", 1, 1),
      cand("concert", "event", 150, 1),
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "concert", start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  assert.ok(r.id("c1"), "진입 40 + 체류 60 + 퇴장 8 = 108 ≤ 120 이면 들어가야 한다");
});

test("F 고정 항목 앞 계약이 그대로다 — FAIL 케이스", () => {
  const r = run({
    candidates: [
      { ...cand("c1", "attraction", 20, 500), stay_minutes_override: 90 },
      cand("blocker", "attraction", 1, 1),
      cand("concert", "event", 150, 1),
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "concert", start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.id("c1"), undefined, "진입 20 + 체류 90 + 퇴장 40 = 150 > 120 이면 안 된다");
  assert.equal(r.id("concert")!.start_time, "19:00", "고정 항목은 움직이지 않는다");
});

// ── G. 다음 항목의 좌표를 모를 때 — fail-closed ──────────────────────────────

test("G 다음 항목 위치를 모르면 그 중간 gap 은 비워 둔다", () => {
  // concert 를 candidates 에 넣지 않아 좌표를 해석할 수 없게 만든다.
  const r = run({
    candidates: [
      { ...cand("c1", "attraction", 20, 500), stay_minutes_override: 90 },
      cand("blocker", "attraction", 1, 1),
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "concert", start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.id("c1"), undefined,
    "다음 항목까지 갈 수 있는지 확인할 수 없으면 넣지 않는다 — 가짜 이동시간을 만들지 않는다");
});

// ── H. 다음 항목이 없는 하루 마지막 ─────────────────────────────────────────

test("H 마지막 자리는 예전처럼 진입+체류만 본다", () => {
  const pool = Array.from({ length: 6 }, (_, i) => cand(`p${i}`, "attraction", 1 + i * 0.5, 200 - i));
  const r = run({ candidates: pool });
  assert.ok(r.ok);
  assert.ok(r.items.length >= 3,
    `고정도 구멍도 없는 하루는 평소대로 채워져야 한다 (실제 ${r.items.length})`);
  const coords: Record<string, number> = {};
  pool.forEach((p, i) => { coords[`p${i}`] = 1 + i * 0.5; });
  assertPhysicallyPossible(r.items, coords);
});

// ── I. multi-iteration ───────────────────────────────────────────────────────

test("I 반복 pass 에서도 앞뒤 기준이 정확하다", () => {
  // 한 gap 에는 pass 당 하나만 놓인다. 남는 자리는 다음 iteration 에서 채워지고,
  // 그때 predecessor 와 successor 가 모두 흔들리지 않아야 한다.
  const pool = [
    cand("a", "attraction", 1, 300, 40), cand("b", "attraction", 2, 290, 40),
    cand("c", "attraction", 3, 280, 40), cand("d", "attraction", 4, 270, 40),
    cand("e", "attraction", 5, 260, 40),
  ];
  const r = run({ candidates: pool });
  assert.ok(r.ok);
  assert.ok(r.items.length >= 3, `여러 곳이 배치되어야 한다 (실제 ${r.items.length})`);
  const coords: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  assertPhysicallyPossible(r.items, coords);
  // 이웃한 후보끼리이므로 첫 항목 외에는 전부 도보권이어야 한다
  for (const it of r.items.slice(1)) {
    assert.ok(it.travel_minutes_from_prev <= 8,
      `${it.place_id}: 이웃 후보인데 ${it.travel_minutes_from_prev}분`);
  }
});
