// 사용자가 고른 장소는 추천보다 먼저 자리를 잡는다.
//
// 무엇을 막는가
//   시간대를 정해 둔 This Trip 이 조용히 사라지던 일이다. 슬롯을 풀어 주는
//   pass 가 맨 뒤에 있어서, 그때쯤이면 추천이 하루치 자리와 HC-7(20개) 예산을
//   다 쓴 뒤였다. 실측으로 저녁 선호 3곳 + 추천 30곳 → This Trip **0곳**이었고,
//   추천이 5곳뿐이어서 자리가 남아도는 날조차 1곳만 들어갔다.
//
// 어떻게 고쳤나
//   점수를 올리지 않았다. 999 는 이미 같은 gap 에서 추천을 이긴다 — 문제는
//   점수가 아니라 차례였다. 있던 pass 의 순서만 앞으로 옮겼다.
//
//   `preferred_time_slot` 은 지키면 좋은 값이지 지키려고 장소를 버릴 값이 아니다.
//   시간을 반드시 지켜야 하는 장소는 Date/Start/End 로 고정하면 P2 가 hard
//   constraint 로 다룬다 — 그 계약은 이 변경과 무관하게 그대로다.

import test from "node:test";
import assert from "node:assert/strict";
import { runScheduler } from "./engine.ts";

const BASE = { lat: 35.1587, lng: 129.1603 };
const near = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });
const far  = (n: number) => ({ lat: BASE.lat + n * 0.05,   lng: BASE.lng + n * 0.05 });

function run(cands: unknown[], extra: Record<string, unknown> = {}) {
  const r = runScheduler({
    trip_date: "2026-09-01", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal", candidates: cands, ...extra,
  } as never) as { data?: { items?: { item_type: string; place_id: string; start_time: string }[] } };
  return (r.data?.items ?? []).filter(i => i.item_type === "place");
}
const ids   = (items: { place_id: string }[]) => items.map(i => i.place_id);
const carts = (items: { place_id: string }[]) => ids(items).filter(x => x.startsWith("C"));

/** 추천 후보 — 짧게 머물러서 하루에 많이 들어간다. */
const autos = (n: number, stay: number) => Array.from({ length: n }, (_, i) => ({
  place_id: `a${i}`, category: "attraction", coordinate: near(1 + i * 0.02),
  zone_id: 1, distance_m: 300, score: 100 - i * 0.01, stay_minutes_override: stay,
}));
/** This Trip 후보 — cart 합성 후보와 같은 모양(score 999). */
const cartPicks = (
  n: number, stay: number, coord: (i: number) => { lat: number; lng: number },
  zone = 1, dist = 300,
) => Array.from({ length: n }, (_, i) => ({
  place_id: `C${i}`, category: "event", coordinate: coord(i),
  zone_id: zone, distance_m: dist, score: 999, stay_minutes_override: stay,
}));
const eveningPrefs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ place_id: `C${i}`, preferred_time_slot: "evening" }));

// ── 고친 것 ──────────────────────────────────────────────────────────────────
test("★시간대를 정해 둔 This Trip 이 추천에 밀려 사라지지 않는다", () => {
  const items = run([...autos(30, 15), ...cartPicks(3, 30, i => near(1.5 + i * 0.02))],
    { preferred_items: eveningPrefs(3) });
  // 고치기 전에는 0 이었다
  assert.deepEqual(carts(items), ["C0", "C1", "C2"], ids(items).join(","));
});

test("★자리가 넉넉한 날에도 고른 곳이 전부 들어간다", () => {
  const items = run([...autos(5, 15), ...cartPicks(3, 30, i => near(1.5 + i * 0.02))],
    { preferred_items: eveningPrefs(3) });
  // 고치기 전에는 1 곳뿐이었다 — 슬롯을 지킨 것도 아니면서 둘을 버렸다
  assert.deepEqual(carts(items), ["C0", "C1", "C2"], ids(items).join(","));
});

test("★남는 시간은 여전히 추천이 채운다", () => {
  const items = run([...autos(5, 15), ...cartPicks(3, 30, i => near(1.5 + i * 0.02))],
    { preferred_items: eveningPrefs(3) });
  assert.ok(ids(items).filter(x => x.startsWith("a")).length > 0, "추천이 하나도 없다");
  assert.ok(items.length > carts(items).length, "This Trip 만으로 끝났다");
});

test("★This Trip 이 추천보다 앞자리를 갖는다", () => {
  const items = run([...autos(30, 15), ...cartPicks(5, 15, i => near(1.5 + i * 0.02))]);
  const firstAuto = ids(items).findIndex(x => x.startsWith("a"));
  const lastCart  = ids(items).map((x, i) => x.startsWith("C") ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  assert.ok(firstAuto > lastCart, `추천이 먼저 앉았다: ${ids(items).join(",")}`);
});

// ── 건드리지 않은 것 ─────────────────────────────────────────────────────────
test("★This Trip 이 없으면 결과가 예전과 같다", () => {
  const items = run(autos(30, 15));
  assert.equal(carts(items).length, 0);
  assert.equal(items.length, 20, "HC-7 상한은 그대로다");
});

test("★HC-7 상한을 넘겨 억지로 밀어 넣지 않는다", () => {
  const items = run([...autos(20, 15), ...cartPicks(25, 15, i => near(1 + i * 0.03), 1, 400)]);
  assert.equal(items.length, 20, ids(items).join(","));
  assert.equal(carts(items).length, 20, "상한 안에서는 고른 곳이 먼저다");
});

test("★멀어서 못 가는 곳은 여전히 배치하지 않는다", () => {
  const items = run([...autos(30, 20), ...cartPicks(2, 60, i => far(1 + i), 3, 7000)],
    { fixed_events: [{ event_id: "FX", coordinate: near(2), start_time: "15:00", end_time: "16:00", zone_id: 1 }] });
  assert.equal(carts(items).length, 2, ids(items).join(","));
  // 고정 일정은 그대로 남는다
  const all = run([...autos(30, 20), ...cartPicks(2, 60, i => far(1 + i), 3, 7000)],
    { fixed_events: [{ event_id: "FX", coordinate: near(2), start_time: "15:00", end_time: "16:00", zone_id: 1 }] });
  assert.equal(all.length, items.length);
});

test("★식사 계약은 그대로다 — This Trip 이 있어도 추천 식당이 들어간다", () => {
  const food = Array.from({ length: 25 }, (_, i) => ({
    place_id: `f${i}`, category: "food", coordinate: near(1 + i * 0.02),
    zone_id: 1, distance_m: 300, score: 120 - i * 0.01, stay_minutes_override: 60,
  }));
  const items = run([...food, ...cartPicks(4, 90, i => near(1.5 + i * 0.3), 1, 500)]);
  assert.equal(carts(items).length, 4);
  assert.ok(ids(items).some(x => x.startsWith("f")), "식사 후보가 하나도 없다");
});

test("★같은 입력은 같은 결과를 준다", () => {
  const build = () => [...autos(30, 15), ...cartPicks(3, 30, i => near(1.5 + i * 0.02))];
  const a = ids(run(build(), { preferred_items: eveningPrefs(3) }));
  const b = ids(run(build(), { preferred_items: eveningPrefs(3) }));
  assert.deepEqual(a, b);
});

test("★Pace 는 체류시간에만 작용한다 — 세 값 모두 배치가 성립한다", () => {
  for (const pace of ["relaxed", "normal", "packed"]) {
    const items = run([...autos(30, 15), ...cartPicks(3, 30, i => near(1.5 + i * 0.02))],
      { pace, preferred_items: eveningPrefs(3) });
    assert.deepEqual(carts(items), ["C0", "C1", "C2"], `${pace}: ${ids(items).join(",")}`);
  }
});
