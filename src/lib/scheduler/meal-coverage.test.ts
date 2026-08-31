// 식사 기회는 "있으면 좋은 것" 이 아니라 사람이 하루를 보내는 기본 조건이다.
//
// 무엇을 막는가
//   실제 Gemini 프로필(attraction 1.0 / nature 1.0)을 넣었더니 12시간 일정에
//   식사가 **0개** 나왔다. 취향 보정이 매 자리를 가져가면서 아침·점심·저녁이
//   전부 그냥 지나가 버렸다.
//
// 어떻게 고쳤나
//   점수를 키우지 않았다. restaurant 에 큰 보너스를 주면 Selected 999·거리
//   페널티·zone 보너스가 전부 흔들린다. 대신 **고르는 단계에서 역할을 나눈다** —
//   아직 못 채운 식사창에 놓을 수 있는 식음 후보가 있으면 그 자리는 그중에서 고른다.
//
// 그래서 고정 비율은 여전히 어디에도 없다. 끼니 수는 그날 실제 식사 기회로만 정해진다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScheduler } from "./engine.ts";
import { activeMealWindows, mealWindowAt } from "./meal-opportunity.ts";
import type { PersonalizationProfile } from "./ai/personalization-profile.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const H = (h: number, m = 0) => h * 60 + m;

const BASE = { lat: 35.1587, lng: 129.1603 };
const near = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });
const cand = (id: string, cat: string, n = 1, score = 100) =>
  ({ place_id: id, category: cat, coordinate: near(n), zone_id: 1 as const, distance_m: 300, score });

function pool(food: number, attraction: number, nature: number) {
  const out = [];
  for (let i = 0; i < food; i++)       out.push(cand(`f${i}`, "food", 1 + i * 0.02, 100 - i * 0.01));
  for (let i = 0; i < attraction; i++) out.push(cand(`a${i}`, "attraction", 1 + i * 0.02, 100 - i * 0.01));
  for (let i = 0; i < nature; i++)     out.push(cand(`n${i}`, "nature", 1 + i * 0.02, 100 - i * 0.01));
  return out;
}

const prof = (w: Record<string, number>): PersonalizationProfile => ({
  profile_version: 1, category_weights: w as never, preferred_place_ids: [],
  time_preferences: {}, pace_bias: 0, day_density_preference: "balanced",
  cluster_preference: "balanced", meal_preference: "flexible",
  preference_summary: "", source: "ai",
});

function run(extra: Record<string, unknown> = {}) {
  const r = runScheduler({
    trip_date: "2026-09-01", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal", candidates: pool(40, 12, 12), ...extra,
  } as never);
  const items = (r as { data?: { items?: { item_type: string; place_id: string; start_time: string }[] } })
    .data?.items?.filter(i => i.item_type === "place") ?? [];
  const st = String((extra.start_time as string) ?? "09:00").split(":").map(Number);
  const en = String((extra.end_time as string) ?? "21:00").split(":").map(Number);
  const win = activeMealWindows(H(st[0], st[1]), H(en[0], en[1]));
  const satisfied = new Set<string>();
  for (const i of items.filter(x => /^f\d/.test(x.place_id))) {
    const [h, m] = i.start_time.split(":").map(Number);
    const w = mealWindowAt(h * 60 + m, win);
    if (w) satisfied.add(w.kind);
  }
  const n = (re: RegExp) => items.filter(i => re.test(i.place_id)).length;
  return { ok: (r as { success: boolean }).success, items, win, satisfied,
           food: n(/^f\d/), attraction: n(/^a\d/), nature: n(/^n\d/) };
}

// ── M1·M8·M9·M12 — 취향이 강해도 식사가 사라지지 않는다 ─────────────────────

test("★M1 full-day + 충분한 식당 → 세 끼 모두 확보", () => {
  const r = run();
  assert.equal(r.win.length, 3);
  assert.equal(r.satisfied.size, 3, `채운 끼니 ${[...r.satisfied]}`);
  assert.equal(r.food, 3);
});

test("★M8 attraction 취향이 최대여도 식사 0 이 되지 않는다 — 실제 결함 재현 방지", () => {
  const r = run({ personalization_profile: prof({ attraction: 1, nature: 0.8, restaurant: 0.6 }) });
  assert.equal(r.satisfied.size, 3, `취향이 세 끼를 전부 밀어냈다 (food ${r.food})`);
  assert.ok(r.attraction >= 4, "그러면서도 attraction 중심 성격은 유지돼야 한다");
});

test("★M9 nature 취향이 최대여도 식사는 보장되고 nature 중심은 유지된다", () => {
  const r = run({ personalization_profile: prof({ nature: 1, attraction: 0.7, restaurant: 0.5 }) });
  assert.equal(r.satisfied.size, 3);
  assert.ok(r.nature >= 4, "nature 중심 일정이 균등화되면 안 된다");
  assert.equal(r.attraction, 0, "카테고리 균등화가 목표가 아니다");
});

test("★M12 프로필이 없을 때 기존 동작에 회귀가 없다", () => {
  const r = run();
  assert.equal(r.ok, true);
  assert.ok(r.items.length >= 6);
  assert.equal(r.satisfied.size, 3);
});

// ── M2·M3 — 하루 창이 줄면 기회도 준다 ─────────────────────────────────────

test("★M2 오후 도착 → 저녁만", () => {
  const r = run({ start_time: "15:00", end_time: "21:00",
                  personalization_profile: prof({ attraction: 1 }) });
  assert.deepEqual(r.win.map(w => w.kind), ["dinner"]);
  assert.ok(r.food <= 1);
  assert.deepEqual([...r.satisfied], ["dinner"]);
});

test("★M3 오전 출발 → 그 뒤 식사 없음", () => {
  const r = run({ start_time: "09:00", end_time: "12:00",
                  personalization_profile: prof({ attraction: 1 }) });
  assert.deepEqual(r.win.map(w => w.kind), ["breakfast", "lunch"]);
  assert.ok(!r.satisfied.has("dinner"));
});

// ── M4·M5·M6 — 넣을 수 없으면 비워 둔다 ────────────────────────────────────

test("★M4 고정 일정이 점심창을 차지하면 침범하지 않는다", () => {
  const r = run({ fixed_events: [{ place_id: "evt", start_time: "11:00", end_time: "14:30", name: "Fixed" }] });
  for (const i of r.items) {
    if (i.place_id === "evt") continue;
    const [h, m] = i.start_time.split(":").map(Number);
    const t = h * 60 + m;
    assert.ok(t < H(11) || t >= H(14, 30), `${i.place_id}@${i.start_time} 가 고정 일정과 겹친다`);
  }
});

test("★M5 route-valid 식당이 없으면 끼니를 비워 둔다 — 가짜 장소를 만들지 않는다", () => {
  const r = run({ candidates: pool(0, 20, 20) });
  assert.equal(r.ok, true);
  assert.equal(r.food, 0);
  assert.equal(r.satisfied.size, 0);
  assert.ok(r.items.length > 0, "식당이 없다고 일정 전체가 실패하면 안 된다");
});

test("★M6 밥 먹으러 멀리 가지 않는다 — 먼 식당은 이동 제약이 막는다", () => {
  const far = Array.from({ length: 10 }, (_, i) => ({
    ...cand(`f${i}`, "food", 1),
    coordinate: { lat: BASE.lat + 0.36, lng: BASE.lng + 0.36 },
  }));
  const r = run({ candidates: [...far, ...pool(0, 12, 12)] });
  assert.equal(r.food, 0, "거리 제약을 무시하고 식사를 강행했다");
  assert.ok(r.items.length > 0);
});

// ── M7 — Selected 는 끼니 상한에 걸리지 않는다 ─────────────────────────────

test("★M7 Selected 식당 4개는 3식 규칙으로 잘려나가지 않는다", () => {
  const sel = ["s0", "s1", "s2", "s3"].map((id, i) => cand(id, "food", 1 + i * 0.03, 999));
  const r = run({
    candidates: [...sel, ...pool(20, 12, 12)],
    preferred_items: sel.map(s => ({ place_id: s.place_id })),
  });
  const placed = r.items.filter(i => /^s\d/.test(i.place_id)).length;
  assert.ok(placed >= 4, `Selected 식당 4개 중 ${placed} 개만 배치됐다`);
});

// ── M10·M11 — 후보 수와 취향은 끼니 수를 정하지 않는다 ─────────────────────

test("★M10 식당 후보가 300 이든 30 이든 끼니 수는 같다", () => {
  const a = run({ candidates: pool(300, 12, 12) });
  const b = run({ candidates: pool(30, 12, 12) });
  assert.equal(a.satisfied.size, b.satisfied.size);
  assert.equal(a.food, b.food);
});

test("★M11 food 취향은 어느 식당을 고를지에만 영향을 준다 — 끼니 수를 늘리지 않는다", () => {
  const plain = run();
  const foodie = run({ personalization_profile: prof({ restaurant: 1 }) });
  assert.equal(foodie.satisfied.size, plain.satisfied.size);
  assert.equal(foodie.food, plain.food, "취향이 자동 식사 수를 늘리면 안 된다");
});

// ── 구조 계약 ───────────────────────────────────────────────────────────────

test("★식사 보장을 점수 보너스로 해결하지 않았다", () => {
  const engine = code("src", "lib", "scheduler", "engine.ts");
  assert.doesNotMatch(engine, /(food|restaurant|meal)[A-Za-z]*(Bonus|Boost|Ratio|Quota|Percent)/i);
  assert.doesNotMatch(engine, /adjusted_score[^;]*\+\s*(100|200|500|999)/);
  assert.doesNotMatch(engine, /0\.(2\d|3\d|4\d)\b/);
  // 선택 단계에서 후보 집합을 좁히는 방식이어야 한다
  // P1: 같은/인접 권역 식당(localMeals)이 있으면 그 집합, 없으면 점수 floor 집합 — 여전히 "집합을 좁히는" 방식이다
  assert.match(engine, /const mealPicks = localMeals\.length > 0 \? localMeals : scored\.filter/);
  assert.match(engine, /pickPool = mealPicks/);
  // Selected 가 이 규칙보다 위다
  assert.match(engine, /if \(!isUserSelected\(scored\[0\]\.place_id, scored\[0\]\.score\)\)/);
});
