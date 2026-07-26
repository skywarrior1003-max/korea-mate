/**
 * Helpful 서버 가드 테스트
 * Run: node --experimental-strip-types src/lib/helpful-guard-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardedHelpfulVote } from "./helpful-guard-core.ts";

const TARGET = "00000000-0000-0000-0000-0000000000t1";
const OWNER  = "device-owner";
const COPIER = "device-copier";

// from() 호출 순서: 1=대상 조회, 2=복사본 조회
function mockAdmin({
  target = { id: TARGET, device_id: OWNER, is_public: true, helpful_count: 5 } as unknown,
  targetErr = null as unknown,
  copy = { id: "copy-1" } as unknown,
  copyErr = null as unknown,
  rpcData = [{ added: true, helpful_count: 6 }] as unknown,
  rpcErr = null as unknown,
} = {}) {
  let call = 0;
  const state = { rpcCalls: 0 };
  return {
    state,
    from(_t: string) {
      call++;
      const n = call;
      const chain: any = {
        select: () => chain, eq: () => chain, limit: () => chain,
        maybeSingle: async () =>
          n === 1 ? { data: target, error: targetErr } : { data: copy, error: copyErr },
      };
      return chain;
    },
    async rpc(_fn: string, _args: Record<string, unknown>) {
      state.rpcCalls++;
      return { data: rpcData, error: rpcErr };
    },
  };
}

test("실제 복사자 최초 반응 → added, reason=added", async () => {
  const a = mockAdmin();
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.added, true);
  assert.strictEqual(r.body.reason, "added");
  assert.strictEqual(r.body.helpful_count, 6);
});

test("동일 기기 재요청 → already_added, 증가 없음", async () => {
  const a = mockAdmin({ rpcData: [{ added: false, helpful_count: 6 }] });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.body.added, false);
  assert.strictEqual(r.body.reason, "already_added");
  assert.strictEqual(r.body.helpful_count, 6);
});

test("자기 일정 → self, RPC 미호출(카운트 불변)", async () => {
  const a = mockAdmin();
  const r = await guardedHelpfulVote(TARGET, OWNER, a as any);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.added, false);
  assert.strictEqual(r.body.reason, "self");
  assert.strictEqual(a.state.rpcCalls, 0);
  assert.strictEqual(r.body.helpful_count, 5);
});

test("복사하지 않은 기기 → not_copied, RPC 미호출", async () => {
  const a = mockAdmin({ copy: null });
  const r = await guardedHelpfulVote(TARGET, "device-stranger", a as any);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.reason, "not_copied");
  assert.strictEqual(a.state.rpcCalls, 0);
  assert.strictEqual(r.body.helpful_count, 5);
});

test("미존재 대상 → 404, RPC 미호출", async () => {
  const a = mockAdmin({ target: null });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.status, 404);
  assert.strictEqual(a.state.rpcCalls, 0);
});

test("비공개 대상 → 404 (존재 여부 누출 방지)", async () => {
  const a = mockAdmin({ target: { id: TARGET, device_id: OWNER, is_public: false, helpful_count: 5 } });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(Object.keys(r.body), ["error"]);
  assert.strictEqual(a.state.rpcCalls, 0);
});

test("응답에 원작자 device_id 등 민감정보 없음", async () => {
  for (const dev of [COPIER, OWNER, "device-stranger"]) {
    const a = mockAdmin({ copy: dev === "device-stranger" ? null : { id: "c" } });
    const r = await guardedHelpfulVote(TARGET, dev, a as any);
    const s = JSON.stringify(r.body);
    assert.ok(!s.includes(OWNER), `owner device_id leaked for ${dev}`);
    assert.ok(!s.includes("device_id"));
    assert.ok(!s.includes("copy_of"));
  }
});

test("대상 조회 DB 오류 → 500, 내부 코드 미노출", async () => {
  const a = mockAdmin({ targetErr: { code: "PGRST" } });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes("PGRST"));
  assert.strictEqual(a.state.rpcCalls, 0);
});

test("복사본 조회 DB 오류 → 500, RPC 미호출", async () => {
  const a = mockAdmin({ copyErr: { code: "57014" } });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.status, 500);
  assert.strictEqual(a.state.rpcCalls, 0);
});

test("RPC 오류 → 500, 안전한 메시지", async () => {
  const a = mockAdmin({ rpcErr: { code: "40001" } });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.strictEqual(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes("40001"));
});

test("소유자 device_id 가 null 이면 self 로 오판하지 않음", async () => {
  const a = mockAdmin({ target: { id: TARGET, device_id: null, is_public: true, helpful_count: 2 } });
  const r = await guardedHelpfulVote(TARGET, COPIER, a as any);
  assert.notStrictEqual(r.body.reason, "self");
  assert.strictEqual(r.body.reason, "added");
});
