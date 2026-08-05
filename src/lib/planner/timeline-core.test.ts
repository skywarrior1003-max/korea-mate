import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, visibleSlots, SLOT_ORDER } from "./timeline-core.ts";

const mk = (slot: string, name: string, index: number) => ({ item: name, index, slot });

// ── 연속성 — 이게 이 파일의 핵심이다 ────────────────────────────────────────
test("★첫 장소 위·마지막 장소 아래에는 선이 없다", () => {
  const r = buildTimeline([mk("morning", "A", 0), mk("lunch", "B", 1), mk("evening", "C", 2)]);
  assert.equal(r[0].railAbove, false, "첫 항목 위");
  assert.equal(r[0].railBelow, true);
  assert.equal(r[2].railBelow, false, "마지막 항목 아래");
  assert.equal(r[2].railAbove, true);
});

test("★장소가 1개면 선이 아예 없다", () => {
  const r = buildTimeline([mk("afternoon", "A", 0)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].railAbove, false);
  assert.equal(r[0].railBelow, false);
});

test("★슬롯이 바뀌는 자리에서도 선이 끊기지 않는다", () => {
  // Morning 2곳 → Lunch 1곳 → Afternoon 1곳. 경계에 있는 항목도 위·아래가 이어져야 한다.
  const r = buildTimeline([
    mk("morning", "A", 0), mk("morning", "B", 1), mk("lunch", "C", 2), mk("afternoon", "D", 3),
  ]);
  assert.deepEqual(r.map(x => x.item), ["A", "B", "C", "D"]);
  // 가운데 두 항목(B=Morning 마지막, C=Lunch 첫)이 서로 이어진다
  assert.equal(r[1].railBelow, true, "Morning 마지막 아래로 이어짐");
  assert.equal(r[2].railAbove, true, "Lunch 첫 장소 위로 이어짐");
  assert.equal(r[2].railBelow, true);
  assert.equal(r[3].railAbove, true);
});

test("★하루 전체에서 선이 끊기는 지점은 양 끝뿐이다", () => {
  const items = ["morning", "morning", "lunch", "afternoon", "afternoon", "evening"]
    .map((s, i) => mk(s, `P${i}`, i));
  const r = buildTimeline(items);
  for (let i = 0; i < r.length; i++) {
    assert.equal(r[i].railAbove, i > 0, `#${i} 위`);
    assert.equal(r[i].railBelow, i < r.length - 1, `#${i} 아래`);
  }
});

// ── 슬롯 라벨 ────────────────────────────────────────────────────────────────
test("★같은 시간대에 여러 장소가 있어도 라벨은 한 번만", () => {
  const r = buildTimeline([mk("morning", "A", 0), mk("morning", "B", 1), mk("morning", "C", 2)]);
  assert.deepEqual(r.map(x => x.showSlotLabel), [true, false, false]);
});

test("★장소가 없는 시간대는 라벨도 없다", () => {
  // Lunch 가 비어 있다
  const r = buildTimeline([mk("morning", "A", 0), mk("afternoon", "B", 1), mk("evening", "C", 2)]);
  assert.deepEqual(visibleSlots(r), ["morning", "afternoon", "evening"]);
  assert.ok(!visibleSlots(r).includes("lunch"));
});

test("★한 시간대만 있으면 라벨도 하나", () => {
  const r = buildTimeline([mk("evening", "A", 0), mk("evening", "B", 1)]);
  assert.deepEqual(visibleSlots(r), ["evening"]);
});

test("장소가 0개면 빈 배열", () => {
  assert.deepEqual(buildTimeline([]), []);
});

// ── 정렬 ─────────────────────────────────────────────────────────────────────
test("★입력 순서와 무관하게 Morning → Lunch → Afternoon → Evening", () => {
  const r = buildTimeline([
    mk("evening", "E", 0), mk("morning", "M", 1), mk("afternoon", "A", 2), mk("lunch", "L", 3),
  ]);
  assert.deepEqual(r.map(x => x.item), ["M", "L", "A", "E"]);
  assert.deepEqual(r.map(x => x.slot), [...SLOT_ORDER]);
});

test("★원래 배열 index 를 잃지 않는다 — 삭제·순서변경이 이 값을 쓴다", () => {
  const r = buildTimeline([mk("evening", "E", 7), mk("morning", "M", 2)]);
  assert.deepEqual(r.map(x => x.index), [2, 7]);
});

test("★같은 슬롯 안에서는 입력 순서를 지킨다", () => {
  const r = buildTimeline([mk("morning", "A", 0), mk("morning", "B", 1), mk("morning", "C", 2)]);
  assert.deepEqual(r.map(x => x.item), ["A", "B", "C"]);
});

test("호출부가 넘긴 정렬 순서를 따른다 — 정의는 한 곳만 있으면 된다", () => {
  const r = buildTimeline(
    [mk("evening", "E", 0), mk("morning", "M", 1)],
    ["morning", "lunch", "afternoon", "evening"],
  );
  assert.deepEqual(r.map(x => x.item), ["M", "E"]);
});

test("모르는 슬롯 값은 morning 으로 본다 — 장소를 화면에서 잃지 않는다", () => {
  const r = buildTimeline([mk("brunch", "X", 0), mk("evening", "E", 1)]);
  assert.equal(r.length, 2, "한 장소도 사라지면 안 된다");
  assert.deepEqual(r.map(x => x.item), ["X", "E"]);
});

test("★모든 입력 장소가 정확히 한 번씩 나온다", () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    mk(SLOT_ORDER[i % SLOT_ORDER.length], `P${i}`, i));
  const r = buildTimeline(items);
  assert.equal(r.length, 12);
  assert.deepEqual([...r.map(x => x.index)].sort((a, b) => a - b), items.map(x => x.index));
});
