// 식사는 비율이 아니라 기회다 — 계약 고정.
//
// 무엇을 막는가
//   ① DB 에 식당이 많다는 이유로 하루가 식당으로 차는 것
//   ② 고정 비율(33%·30%·25% …)이 최종 일정의 식당 수를 정하는 것
//   ③ 밥 먹으러 route coherence 를 깨는 것
//   ④ 사용자가 직접 고른 식당을 "이미 세 끼 찼다" 는 이유로 지우는 것

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  activeMealWindows, mealWindowAt, canPlaceAutoMeal, isFoodCategory,
  MEAL_TIME_RANGES, MIN_MEAL_OVERLAP_MINUTES, MEAL_KINDS, type MealKind,
} from "./meal-opportunity.ts";
import { runScheduler } from "./engine.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
/** 주석을 걷어낸 실제 코드만 본다 — 설명문이 자기 자신을 걸지 않게 한다 */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const H = (h: number, m = 0) => h * 60 + m;

// ── fixture ─────────────────────────────────────────────────────────────────
const BASE = { lat: 35.1587, lng: 129.1603 };
const near = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });

function cand(id: string, category: string, n = 1, score = 100) {
  return { place_id: id, category, coordinate: near(n), zone_id: 1 as const, distance_m: 300, score };
}
function pool(food: number, attraction: number, nature: number) {
  const out = [];
  for (let i = 0; i < food; i++)       out.push(cand(`f${i}`, "food", 1 + i * 0.02, 100 - i * 0.01));
  for (let i = 0; i < attraction; i++) out.push(cand(`a${i}`, "attraction", 1 + i * 0.02, 100 - i * 0.01));
  for (let i = 0; i < nature; i++)     out.push(cand(`n${i}`, "nature", 1 + i * 0.02, 100 - i * 0.01));
  return out;
}
function run(extra: Record<string, unknown> = {}) {
  const r = runScheduler({
    trip_date: "2026-09-01", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal", candidates: pool(40, 10, 10), ...extra,
  } as never);
  const items = (r as { data?: { items?: { item_type: string; place_id: string; start_time: string }[] } })
    .data?.items?.filter(i => i.item_type === "place") ?? [];
  return { ok: (r as { success: boolean }).success, items,
           food: items.filter(i => /^f\d/.test(i.place_id)) };
}

// ── M1~M3. 실제 하루 창에서만 기회가 생긴다 ─────────────────────────────────

test("★M1 하루 전체를 쓰면 아침·점심·저녁 세 기회", () => {
  const w = activeMealWindows(H(8), H(22));
  assert.deepEqual(w.map(x => x.kind), ["breakfast", "lunch", "dinner"]);
  // 자동 식당은 끼니당 하나뿐이다
  const filled = new Set<MealKind>();
  assert.equal(canPlaceAutoMeal(H(12), w, filled).allowed, true);
  filled.add("lunch");
  assert.equal(canPlaceAutoMeal(H(13), w, filled).allowed, false);
  assert.match(canPlaceAutoMeal(H(13), w, filled).reason, /이미 채워졌다/);
});

test("★M2 오후 도착 — 아침 없음, 점심도 지났으면 없음", () => {
  assert.deepEqual(activeMealWindows(H(15), H(22)).map(x => x.kind), ["dinner"]);
  assert.deepEqual(activeMealWindows(H(13), H(22)).map(x => x.kind), ["lunch", "dinner"]);
  // 14:00 도착이면 점심 창이 30분밖에 안 남아 기회로 세지 않는다
  assert.deepEqual(activeMealWindows(H(14), H(22)).map(x => x.kind), ["dinner"]);
});

test("★M3 오전 출발 — 이후 식사 기회 없음", () => {
  assert.deepEqual(activeMealWindows(H(7), H(10)).map(x => x.kind), ["breakfast"]);
  assert.deepEqual(activeMealWindows(H(7), H(12, 30)).map(x => x.kind), ["breakfast", "lunch"]);
  assert.deepEqual(activeMealWindows(H(7), H(11, 30)).map(x => x.kind), ["breakfast"]);   // 점심 30분 → 미달
  assert.deepEqual(activeMealWindows(H(22), H(23)), []);
});

test("★기회 판정은 시간창 겹침으로만 결정된다", () => {
  assert.equal(MIN_MEAL_OVERLAP_MINUTES, 45);
  assert.deepEqual(MEAL_TIME_RANGES.breakfast, [7 * 60, 10 * 60]);
  assert.deepEqual(MEAL_TIME_RANGES.lunch,     [11 * 60, 14 * 60 + 30]);
  assert.deepEqual(MEAL_TIME_RANGES.dinner,    [17 * 60, 21 * 60]);
  assert.deepEqual([...MEAL_KINDS], ["breakfast", "lunch", "dinner"]);
  const w = activeMealWindows(H(9), H(21));
  assert.equal(mealWindowAt(H(12), w)?.kind, "lunch");
  assert.equal(mealWindowAt(H(15, 30), w), null);   // 점심과 저녁 사이는 식사 시간이 아니다
});

// ── M1 실제 스케줄 ───────────────────────────────────────────────────────────

test("★M1-run 식당 40개를 줘도 자동 식당은 기회 수를 넘지 않는다", () => {
  const r = run();                       // 09:00~21:00 → breakfast·lunch·dinner
  assert.equal(r.ok, true);
  assert.ok(r.items.length > 3, "일정이 비어 있으면 검증 의미가 없다");
  assert.ok(r.food.length <= 3, `자동 식당 ${r.food.length} 개 — 식사 기회(3)를 넘었다`);
  // 배치된 식당은 전부 실제 식사 시간대 안이다
  const w = activeMealWindows(H(9), H(21));
  for (const f of r.food) {
    const [hh, mm] = f.start_time.split(":").map(Number);
    assert.ok(mealWindowAt(hh * 60 + mm, w), `${f.place_id} 가 ${f.start_time} — 식사 시간대가 아니다`);
  }
});

test("★M2-run 오후 도착이면 자동 식당이 줄어든다", () => {
  const r = run({ start_time: "15:00", end_time: "21:00" });
  assert.equal(activeMealWindows(H(15), H(21)).length, 1);
  assert.ok(r.food.length <= 1, `저녁 하나뿐인데 ${r.food.length} 개가 들어갔다`);
});

test("★M3-run 오전 출발이면 자동 식당이 줄어든다", () => {
  const r = run({ start_time: "09:00", end_time: "12:00" });
  assert.equal(activeMealWindows(H(9), H(12)).length, 2);   // breakfast + lunch(11:00~12:00)
  assert.ok(r.food.length <= 2);
});

// ── M4. 고정 일정 충돌 ───────────────────────────────────────────────────────

test("★M4 식사 시간대가 고정 일정으로 차 있으면 억지로 끼워 넣지 않는다", () => {
  const r = run({
    fixed_events: [{ place_id: "evt", start_time: "11:00", end_time: "14:30", name: "Fixed" }],
  });
  // 고정 일정 구간을 침범하지 않는다
  for (const i of r.items) {
    const [h, m] = i.start_time.split(":").map(Number);
    const t = h * 60 + m;
    if (i.place_id !== "evt") assert.ok(t < H(11) || t >= H(14, 30), `${i.place_id}@${i.start_time} 가 고정 일정과 겹친다`);
  }
});

// ── M6. Selected 는 끼니 상한에 걸리지 않는다 ───────────────────────────────

test("★M6 Selected 식당은 3식을 넘어도 자동 삭제되지 않는다", () => {
  const selected = ["s0", "s1", "s2", "s3"].map((id, i) => cand(id, "food", 1 + i * 0.03, 999));
  const r = run({
    candidates: [...selected, ...pool(20, 10, 10)],
    preferred_items: selected.map(s => ({ place_id: s.place_id })),
  });
  const placedSelected = r.items.filter(i => /^s\d/.test(i.place_id));
  assert.ok(placedSelected.length >= 4,
    `Selected 식당 4개 중 ${placedSelected.length} 개만 배치됐다 — 끼니 수로 지우면 안 된다`);
});

// ── M8~M9. 후보량이 식사 수를 정하지 않는다 ────────────────────────────────

test("★M8·M9 후보 300 vs 40 vs 30 이어도 자동 식당 수는 기회 수로만 정해진다", () => {
  const a = run({ candidates: pool(300, 40, 30) });
  const b = run({ candidates: pool(30,  40, 30) });
  assert.ok(a.food.length <= 3);
  assert.ok(b.food.length <= 3);
  assert.equal(a.food.length, b.food.length,
    "후보 수가 10배 달라도 자동 식당 수가 달라지면 volume 이 preference 가 된 것이다");
});

test("★M10 유효한 식당이 없으면 기회를 비워 둔다 — 가짜 장소를 만들지 않는다", () => {
  const r = run({ candidates: pool(0, 20, 20) });
  assert.equal(r.ok, true);
  assert.equal(r.food.length, 0);
  assert.ok(r.items.length > 0, "식당이 없다고 일정 전체가 실패하면 안 된다");
});

// ── M12. 고정 비율이 코드에 없다 ────────────────────────────────────────────

test("★M12 최종 일정의 식당 수를 고정 percentage 로 계산하는 코드가 없다", () => {
  const meal   = code("src", "lib", "scheduler", "meal-opportunity.ts");
  const engine = code("src", "lib", "scheduler", "engine.ts");
  const pool   = code("src", "lib", "near-me", "candidate-diversity.ts");

  // ① 세 파일 어디에도 식음 비율 상수·산술이 없다
  for (const src of [meal, engine, pool]) {
    assert.doesNotMatch(src, /(FOOD|RESTAURANT|MEAL)_(RATIO|PERCENT|SHARE|QUOTA|FRACTION)/i);
    assert.doesNotMatch(src, /0\.(2\d|3\d|4\d)/);
    assert.doesNotMatch(src, /\/\s*100|percent/i);
  }
  // ② 후보 수·일정 길이에서 식당 목표치를 계산하는 코드가 없다
  for (const src of [meal, engine, pool]) {
    assert.doesNotMatch(src, /(food|restaurant|meal)[A-Za-z]*\s*=\s*[^;\n]*\.length\s*[*/]/i);
    assert.doesNotMatch(src, /Math\.(round|floor|ceil)\([^)]*\.length\s*\*\s*0?\.\d/);
  }
  // ③ 엔진의 식음 게이트는 식사 기회 함수 하나뿐이다
  assert.equal((engine.match(/canPlaceAutoMeal\(/g) ?? []).length, 2);   // 후보 검사 1 + 소진 기록 1
  assert.doesNotMatch(engine, /FOOD_(RATIO|PERCENT|SHARE|QUOTA)/i);
  // ④ 풀은 균등 분배가 아니라 절대 개수 하한이다
  assert.doesNotMatch(pool, /round.?robin|번갈아|균등/i);
  assert.match(pool, /MIN_RECALL_PER_CATEGORY/);
});

test("★식음 카테고리 판정은 taxonomy 안에서만", () => {
  for (const c of ["food", "cafe", "restaurant", "FOOD"]) assert.equal(isFoodCategory(c), true, c);
  for (const c of ["attraction", "nature", "walking", "event", "", null, undefined]) {
    assert.equal(isFoodCategory(c as never), false, String(c));
  }
});
