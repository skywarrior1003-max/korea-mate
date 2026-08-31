import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reorderFlexibleSegments } from "./segment-reorder.ts";
import type { ScheduledItem, SchedulerInput } from "./types.ts";

const C = (place_id: string, lat: number, lng: number, extra: Partial<SchedulerInput["candidates"][number]> = {}) =>
  ({ place_id, category: "attraction" as const, coordinate: { lat, lng }, zone_id: 1 as const, score: 50, ...extra });
const I = (place_id: string, start: string, end: string, extra: Partial<ScheduledItem> = {}): ScheduledItem =>
  ({ slot_order: 0, item_type: "place", source: "greedy", place_id, start_time: start, end_time: end, stay_minutes: 60, travel_minutes_from_prev: 8, is_fixed: false, stay_source: "category_default", ...extra });

// 해운대(기준) → 청사포(동쪽 3km) → 해운대 → 센텀(서쪽 3km): 지그재그
const HAEUNDAE = { lat: 35.1587, lng: 129.1603 }, CHEONGSAPO = { lat: 35.1585, lng: 129.1905 }, DONGBAEK = { lat: 35.1535, lng: 129.1525 }, CENTUM = { lat: 35.1690, lng: 129.1310 };
const base: SchedulerInput = { trip_date: "2026-08-30", start_time: "09:00", end_time: "21:00", base_coordinate: HAEUNDAE, pace: "normal",
  candidates: [C("c", CHEONGSAPO.lat, CHEONGSAPO.lng), C("d", DONGBAEK.lat, DONGBAEK.lng), C("s", CENTUM.lat, CENTUM.lng), C("h", HAEUNDAE.lat, HAEUNDAE.lng)] };

test("★지그재그 구간은 같은 장소 집합으로 더 짧은 순서가 되고 시각이 앞에서부터 다시 계산된다", () => {
  const placed = [I("c", "09:20", "10:20", { travel_minutes_from_prev: 20 }), I("d", "10:40", "11:40", { travel_minutes_from_prev: 20 }), I("s", "12:00", "13:00", { travel_minutes_from_prev: 20 })];
  const r = reorderFlexibleSegments(placed, base);
  assert.ok(r.reorderedSegments >= 1);
  assert.ok(r.minutesAfter < r.minutesBefore, `${r.minutesBefore} → ${r.minutesAfter}`);
  assert.deepEqual(new Set(r.items.map(i => i.place_id)), new Set(["c", "d", "s"]), "장소를 버리거나 더하지 않는다");
  for (let k = 1; k < r.items.length; k++) assert.ok(r.items[k]!.start_time > r.items[k - 1]!.end_time || r.items[k]!.start_time >= r.items[k - 1]!.end_time, "시각 단조");
  assert.ok(r.items[0]!.start_time >= "09:00", "하루 시작보다 앞당기지 않는다");
});

test("★고정·사용자 픽·식당·anchor 는 핀 — 자리가 움직이지 않는다", () => {
  const input: SchedulerInput = { ...base, candidates: [...base.candidates, C("pick", CENTUM.lat, CENTUM.lng, { score: 999 }), C("lunch", DONGBAEK.lat, DONGBAEK.lng, { category: "food" })] };
  const placed = [I("c", "09:20", "10:20"), I("pick", "10:40", "11:40"), I("lunch", "12:00", "13:00"), I("s", "13:20", "14:20"), I("d", "14:40", "15:40", { is_fixed: true, source: "fixed_event" })];
  const r = reorderFlexibleSegments(placed, input);
  const at = (id: string) => r.items.find(i => i.place_id === id)!;
  assert.equal(at("pick").start_time, "10:40"); assert.equal(at("lunch").start_time, "12:00"); assert.equal(at("d").start_time, "14:40");
  assert.equal(r.items.length, 5);
});

test("★재정렬이 다음 핀에 못 닿으면(HC-8) 원래 순서를 그대로 둔다", () => {
  const far = { lat: 35.30, lng: 129.30 };
  const input: SchedulerInput = { ...base, candidates: [...base.candidates, C("fixed", far.lat, far.lng)] };
  // 구간 뒤 핀이 촘촘히 붙어 있어 어떤 재정렬도 시간을 넘긴다
  const placed = [I("c", "09:20", "10:20"), I("d", "10:40", "11:40"), I("s", "12:00", "13:00"), I("fixed", "13:10", "14:10", { is_fixed: true, source: "fixed_event" })];
  const r = reorderFlexibleSegments(placed, input);
  assert.equal(r.reorderedSegments, 0);
  assert.deepEqual(r.items, placed);
});

test("★엔진에 연결되어 있고 affiliate 주입·타임라인 전에 돈다 (source guard)", () => {
  const eng = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
  assert.match(eng, /reorderFlexibleSegments\(placed, input\)/);
  assert.ok(eng.indexOf("reorderFlexibleSegments(placed, input)") < eng.indexOf("injectAffiliates(placed, input)"));
});
