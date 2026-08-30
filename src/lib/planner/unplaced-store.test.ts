import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// localStorage 흉내 — 브라우저 없이 저장소 계약만 본다.
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true };
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
};
(globalThis as unknown as { Event: unknown }).Event = class { type: string; constructor(type: string) { this.type = type; } };

const { readUnplaced, addUnplaced, removeUnplaced, UNPLACED_KEY } = await import("./unplaced-store.ts");
const keyOf = (i: { sourceKey?: string; id: string }) => i.sourceKey ?? i.id;
const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, sourceKey: `city_spot:${id}`, name: id, ...extra }) as never;

test("★여행별로 분리된다 — Trip A 의 미배정은 Trip B 에서 보이지 않는다", () => {
  assert.equal(addUnplaced("trip-A", [item("1"), item("2")], keyOf), 2);
  assert.equal(addUnplaced("trip-B", [item("9")], keyOf), 1);
  assert.deepEqual(readUnplaced("trip-A").map(keyOf), ["city_spot:1", "city_spot:2"]);
  assert.deepEqual(readUnplaced("trip-B").map(keyOf), ["city_spot:9"]);
  assert.deepEqual(readUnplaced(null), [], "저장 전 여행은 빈 목록");
});

test("★같은 장소를 두 번 줄여도 한 줄 — 되돌리면 그 여행에서만 빠진다", () => {
  assert.equal(addUnplaced("trip-A", [item("2"), item("3")], keyOf), 1);
  removeUnplaced("trip-A", "city_spot:2", keyOf);
  assert.deepEqual(readUnplaced("trip-A").map(keyOf), ["city_spot:1", "city_spot:3"]);
  assert.deepEqual(readUnplaced("trip-B").map(keyOf), ["city_spot:9"], "다른 여행은 그대로");
});

test("★fixed·unplacedMeta 가 그대로 남는다 (삭제 0·메타 보존)", () => {
  addUnplaced("trip-C", [item("7", { fixed: { date: "2026-09-01", startTime: "20:00", durationMinutes: 60 }, unplacedMeta: { time: "10:15", timeSource: "user", duration: "60m", fromDate: "2026-09-01" } })], keyOf);
  const u = readUnplaced("trip-C")[0] as { fixed?: unknown; unplacedMeta?: { time: string } };
  assert.deepEqual(u.fixed, { date: "2026-09-01", startTime: "20:00", durationMinutes: 60 });
  assert.equal(u.unplacedMeta?.time, "10:15");
  assert.ok(mem.get(UNPLACED_KEY)!.includes("trip-C"));
});

test("★page.tsx — 기간 축소 미배정은 여행 id 저장소로 가고, 되돌릴 때 그 저장소에서 뺀다 (source guard)", () => {
  const page = readFileSync(new URL("../../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /addUnplaced\(itinId, /, "미배정은 여행 id 에 묶인다");
  assert.match(page, /removeUnplaced\(itinId, /, "되돌리면 그 여행 목록에서 뺀다");
  assert.ok(!/addToCart\(event, cartCity\)/.test(page), "미배정을 도시 보관함(This Trip)에 섞지 않는다");
  assert.match(page, /readUnplaced\(itinId\)/, "재오픈 시 그 여행의 미배정을 읽는다");
});
