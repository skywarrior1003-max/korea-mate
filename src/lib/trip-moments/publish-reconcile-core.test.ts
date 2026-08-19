// 최초 공개의 순서와 판단.
//
// 지키는 것
//   1. 고른 것만 켜는 게 아니라, 고르지 않은 것은 끈다(지난 시도의 잔재 제거).
//   2. Memory 가 원하는 모양이 되기 전에는 여행을 공개하지 않는다.
//   3. 한 번의 Publish 에 한 개의 답. 성공 개수를 결과에 담지 않는다.
//   4. 재시도는 지난 목록이 아니라 지금 서버 상태를 다시 읽는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  computeMemoryDiff, isReconciled, summarizeSelection, runFirstPublish,
  type MemoryPublicState, type PublishDeps,
} from "./publish-reconcile-core.ts";

const rows = (spec: Record<string, boolean>): MemoryPublicState[] =>
  Object.entries(spec).map(([moment_id, is_public]) => ({ moment_id, is_public }));

// ── D: 차이 계산 ─────────────────────────────────────────────────────────────

test("D1 켤 것과 끌 것을 둘 다 낸다", () => {
  const diff = computeMemoryDiff(rows({ A: true, B: true, C: false, D: false, E: false }), ["A", "C", "E"]);
  assert.deepEqual(diff.sort((x, y) => x.momentId < y.momentId ? -1 : 1),
    [{ momentId: "B", next: false }, { momentId: "C", next: true }, { momentId: "E", next: true }]);
});

test("D2 이미 원하는 모양인 건은 건드리지 않는다 — 동의 시각을 헛되이 밀지 않는다", () => {
  assert.deepEqual(computeMemoryDiff(rows({ A: true, B: false }), ["A"]), []);
});

test("D3 지난 실패로 켜진 채 남은 것은 반드시 꺼진다", () => {
  // 이것이 빠지면 이번에 고르지 않은 Memory 가 그대로 공개된다
  const diff = computeMemoryDiff(rows({ STALE: true }), []);
  assert.deepEqual(diff, [{ momentId: "STALE", next: false }]);
});

test("D4 서버에 없는 id 를 골라도 요청을 만들지 않는다", () => {
  assert.deepEqual(computeMemoryDiff(rows({ A: false }), ["A", "NOT_ON_SERVER"]),
    [{ momentId: "A", next: true }]);
});

test("D5 아무것도 고르지 않으면 전부 끄는 쪽으로만 간다 — 자동 전체공개 없음", () => {
  const diff = computeMemoryDiff(rows({ A: false, B: false }), []);
  assert.deepEqual(diff, [], "이미 전부 비공개면 할 일이 없다");
  assert.ok(!computeMemoryDiff(rows({ A: false }), []).some(d => d.next === true));
});

test("D6 isReconciled 는 차이가 없을 때만 참", () => {
  assert.equal(isReconciled(rows({ A: true, B: false }), ["A"]), true);
  assert.equal(isReconciled(rows({ A: true, B: true }), ["A"]), false);
});

// ── S: 요약 ──────────────────────────────────────────────────────────────────

test("S1 사진과 메모를 함께 센다", () => {
  const s = summarizeSelection([{ photoCount: 2, hasMemo: true }, { photoCount: 1, hasMemo: false }]);
  assert.deepEqual(s, { scope: "photos_and_memo", photos: 3, memos: 1, count: 2 });
});

test("S2 사진만 / 메모만 / 아무것도 없음을 구분한다 — 없는 것을 공개한다고 말하지 않는다", () => {
  assert.equal(summarizeSelection([{ photoCount: 2, hasMemo: false }]).scope, "photos_only");
  assert.equal(summarizeSelection([{ photoCount: 0, hasMemo: true }]).scope, "memo_only");
  assert.equal(summarizeSelection([{ photoCount: 0, hasMemo: false }]).scope, "nothing_yet");
  assert.equal(summarizeSelection([]).scope, "nothing_yet");
});

test("S3 이상한 사진 수는 0 으로 본다", () => {
  assert.equal(summarizeSelection([{ photoCount: -3, hasMemo: false }]).photos, 0);
  assert.equal(summarizeSelection([{ photoCount: NaN, hasMemo: false }]).photos, 0);
});

// ── P: 실행 순서 ─────────────────────────────────────────────────────────────

function deps(opts: {
  states:  MemoryPublicState[][];       // readServerState 가 순서대로 돌려줄 값
  failOn?: string;                      // 이 momentId 에서 실패
  readFail?: boolean;
  tripOk?: boolean;
}): PublishDeps & { calls: string[]; tripCalls: number } {
  const calls: string[] = [];
  let reads = 0;
  const d = {
    calls, tripCalls: 0,
    readServerState: async () => {
      if (opts.readFail) return { ok: false, rows: [] };
      const rows = opts.states[Math.min(reads, opts.states.length - 1)]!;
      reads++;
      return { ok: true, rows };
    },
    setMomentPublic: async (id: string, next: boolean) => {
      calls.push(`${id}=${next}`);
      return opts.failOn !== id;
    },
    setTripPublic: async () => { d.tripCalls++; return opts.tripOk !== false; },
  };
  return d;
}

test("P1 전부 성공해야 여행이 공개된다 — 그리고 정확히 한 번만", async () => {
  const d = deps({ states: [rows({ A: false, B: false }), rows({ A: true, B: true })] });
  assert.deepEqual(await runFirstPublish(d, ["A", "B"]), { status: "published" });
  assert.deepEqual(d.calls, ["A=true", "B=true"]);
  assert.equal(d.tripCalls, 1);
});

test("P2 Memory 한 건이라도 실패하면 여행 공개를 부르지 않는다", async () => {
  const d = deps({ states: [rows({ A: false, B: false })], failOn: "B" });
  assert.deepEqual(await runFirstPublish(d, ["A", "B"]), { status: "memoryFailed" });
  assert.equal(d.tripCalls, 0, "준비가 끝나기 전에 공개하면 정리 중인 상태가 밖에 보인다");
});

test("P3 요청은 다 200 인데 저장된 모양이 다르면 공개하지 않는다", async () => {
  // 두 번째 읽기에서 B 가 여전히 false — 서버가 받아들이지 않았다
  const d = deps({ states: [rows({ A: false, B: false }), rows({ A: true, B: false })] });
  assert.deepEqual(await runFirstPublish(d, ["A", "B"]), { status: "memoryFailed" });
  assert.equal(d.tripCalls, 0);
});

test("P4 상태를 읽지 못하면 아무것도 바꾸지 않는다", async () => {
  const d = deps({ states: [], readFail: true });
  assert.deepEqual(await runFirstPublish(d, ["A"]), { status: "stateUnreadable" });
  assert.deepEqual(d.calls, []);
  assert.equal(d.tripCalls, 0);
});

test("P5 여행 공개가 실패하면 그 사실만 돌려준다 — Memory 를 되돌리지 않는다", async () => {
  const d = deps({ states: [rows({ A: false }), rows({ A: true })], tripOk: false });
  assert.deepEqual(await runFirstPublish(d, ["A"]), { status: "tripFailed" });
  assert.deepEqual(d.calls, ["A=true"], "롤백 요청을 지어내지 않는다");
});

test("P6 재시도는 지난 결과가 아니라 지금 서버 상태로 차이를 다시 낸다", async () => {
  // 1차에서 A·B 가 켜진 채 실패했다고 하자. 2차에는 사용자가 B 를 뺐다.
  const d = deps({ states: [rows({ A: true, B: true, C: false }), rows({ A: true, B: false, C: true })] });
  assert.deepEqual(await runFirstPublish(d, ["A", "C"]), { status: "published" });
  assert.deepEqual(d.calls, ["B=false", "C=true"], "A 는 이미 맞으므로 다시 쓰지 않는다");
});

test("P7 결과에 성공/실패 개수가 들어가지 않는다", async () => {
  const d = deps({ states: [rows({ A: false, B: false })], failOn: "B" });
  const out = await runFirstPublish(d, ["A", "B"]);
  assert.deepEqual(Object.keys(out), ["status"], "사용자는 Publish 를 한 번 눌렀다");
});

test("P8 아무것도 고르지 않아도 여행 공개는 진행된다 — 강제 선택 아님", async () => {
  const d = deps({ states: [rows({ A: false })] });
  assert.deepEqual(await runFirstPublish(d, []), { status: "published" });
  assert.deepEqual(d.calls, []);
  assert.equal(d.tripCalls, 1);
});

// ── W: 배선 ──────────────────────────────────────────────────────────────────

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const PAGE = code(readFileSync("src/app/itinerary/page.tsx", "utf8"));
const CORE = readFileSync("src/lib/trip-moments/publish-reconcile-core.ts", "utf8");

test("W1 자동 재시도 루프를 심지 않았다", () => {
  assert.ok(!/for\s*\([^)]*attempt|retry|setTimeout/i.test(CORE));
});

test("W2 화면이 여행 공개를 직접 부르지 않는다 — 순서를 우회할 자리를 남기지 않는다", () => {
  // 공개 전환(true)은 reconciliation 안에서만 일어난다
  assert.ok(!/apiSetPublic\([^)]*,\s*true\s*,/.test(PAGE.replace(/setTripPublic:\s*\(\)\s*=>\s*apiSetPublic\([^)]*\),/, "")),
    "Publish 경로 밖에서 여행을 공개하고 있다");
});

test("W3 Publish 모달이 reconciliation 을 통과한다", () => {
  assert.match(PAGE, /onConfirm=\{runPublish\}/);
  assert.match(PAGE, /runFirstPublish\(/);
});

test("W4 사후 개별 토글이 배선되어 있다", () => {
  assert.match(PAGE, /onSetPublic=\{[^}]*handleSetMomentPublic/);
});
