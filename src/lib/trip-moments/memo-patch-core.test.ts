/**
 * PATCH /api/trip-moments/:id — memo 수정 로직 테스트
 * Run: node --experimental-strip-types src/lib/trip-moments/memo-patch-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { patchMomentMemo, normalizeMemo, MEMO_MAX } from "./memo-patch-core.ts";

const MOMENT = "00000000-0000-0000-0000-0000000000a1";
const DEVICE = "00000000-0000-0000-0000-0000000000b2";
const ITIN   = "00000000-0000-0000-0000-0000000000c3";

// ── mock admin ────────────────────────────────────────────────────────────────
// from() 호출 순서: 1=moment 조회, 2=itinerary 조회, 3=update
function mockAdmin({
  momentData = { moment_id: MOMENT, itinerary_id: ITIN } as unknown,
  momentErr  = null as unknown,
  itinData   = { id: ITIN } as unknown,
  itinErr    = null as unknown,
  updData    = null as unknown,
  updErr     = null as unknown,
} = {}) {
  let call = 0;
  const captured: { values?: Record<string, unknown>; eqs: [string, unknown][] } = { eqs: [] };
  const admin = {
    captured,
    from(_t: string) {
      call++;
      const n = call;
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { if (n === 3) captured.eqs.push([c, v]); return chain; },
        update: (v: Record<string, unknown>) => { captured.values = v; return chain; },
        maybeSingle: async () => {
          if (n === 1) return { data: momentData, error: momentErr };
          if (n === 2) return { data: itinData,   error: itinErr };
          return { data: updData ?? { moment_id: MOMENT, itinerary_id: ITIN, memo: captured.values?.memo, category: "random", lat: null, lng: null, location_label: "", captured_at: "2026-01-01T00:00:00Z", day_number: 1 }, error: updErr };
        },
      };
      return chain;
    },
  };
  return admin;
}

// ── normalizeMemo ─────────────────────────────────────────────────────────────

test("normalizeMemo: trim 적용", () => {
  const r = normalizeMemo("  hello  ");
  assert.ok(r.ok && r.memo === "hello");
});

test("normalizeMemo: 공백만 → 빈 문자열 허용", () => {
  const r = normalizeMemo("   \n\t ");
  assert.ok(r.ok && r.memo === "");
});

test("normalizeMemo: 2000자 정확히 허용 / 2001자 거부 (무음 절단 없음)", () => {
  assert.ok(normalizeMemo("a".repeat(MEMO_MAX)).ok);
  assert.ok(!normalizeMemo("a".repeat(MEMO_MAX + 1)).ok);
});

test("normalizeMemo: 문자열 아닌 값 거부", () => {
  assert.ok(!normalizeMemo(123).ok);
  assert.ok(!normalizeMemo(null).ok);
});

// ── patchMomentMemo ───────────────────────────────────────────────────────────

test("소유자 수정 → 200, memo 반영", async () => {
  const admin = mockAdmin();
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "  수정됨  " }, admin as any);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.memo, "수정됨");
  assert.strictEqual(admin.captured.values?.memo, "수정됨");
});

test("UPDATE WHERE 에 moment_id + device_id 동시 조건", async () => {
  const admin = mockAdmin();
  await patchMomentMemo(MOMENT, DEVICE, { memo: "x" }, admin as any);
  const cols = admin.captured.eqs.map(([c]) => c);
  assert.ok(cols.includes("moment_id") && cols.includes("device_id"));
});

test("타 기기 (moment 미조회) → 404", async () => {
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "x" }, mockAdmin({ momentData: null }) as any);
  assert.strictEqual(r.status, 404);
});

test("itinerary 소유권 불일치 → 404", async () => {
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "x" }, mockAdmin({ itinData: null }) as any);
  assert.strictEqual(r.status, 404);
});

test("2001자 → 400, UPDATE 미실행", async () => {
  const admin = mockAdmin();
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "a".repeat(2001) }, admin as any);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(admin.captured.values, undefined);
});

test("공백만 입력 → 200, 빈 문자열 저장", async () => {
  const admin = mockAdmin();
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "   " }, admin as any);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(admin.captured.values?.memo, "");
});

test("memo 미포함 → 400", async () => {
  const r = await patchMomentMemo(MOMENT, DEVICE, { category: "food" }, mockAdmin() as any);
  assert.strictEqual(r.status, 400);
});

test("화이트리스트: 미허용 필드는 UPDATE 에 반영되지 않음", async () => {
  const admin = mockAdmin();
  await patchMomentMemo(MOMENT, DEVICE, {
    memo: "ok", device_id: "hacked", itinerary_id: "hacked",
    is_public: true, storage_path: "x/y.jpg", photo_data: "data:...", category: "food",
  }, admin as any);
  assert.deepStrictEqual(Object.keys(admin.captured.values ?? {}), ["memo"]);
});

test("응답에 device_id·storage_path·photo_data 미포함", async () => {
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "ok" }, mockAdmin() as any);
  const s = JSON.stringify(r.body);
  assert.ok(!s.includes("device_id"));
  assert.ok(!s.includes("storage_path"));
  assert.ok(!s.includes("photo_data"));
});

test("DB 오류 → 500, 내부 메시지 미노출", async () => {
  for (const err of [{ momentErr: { code: "PGRST" } }, { itinErr: { code: "57014" } }, { updErr: { code: "40001" } }]) {
    const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "x" }, mockAdmin(err) as any);
    assert.strictEqual(r.status, 500);
    const s = JSON.stringify(r.body);
    assert.ok(!s.includes("PGRST") && !s.includes("57014") && !s.includes("40001"));
  }
});

test("UPDATE 결과 없음 (경합) → 404", async () => {
  const admin = mockAdmin({ updData: null, updErr: null });
  // updData=null 이면 mock 이 기본값을 돌려주므로, 명시적으로 null 반환하도록 재구성
  const nullAdmin = {
    from(_t: string) {
      (nullAdmin as any)._c = ((nullAdmin as any)._c ?? 0) + 1;
      const n = (nullAdmin as any)._c;
      const chain: any = {
        select: () => chain, eq: () => chain, update: () => chain,
        maybeSingle: async () =>
          n === 1 ? { data: { moment_id: MOMENT, itinerary_id: ITIN }, error: null }
          : n === 2 ? { data: { id: ITIN }, error: null }
          : { data: null, error: null },
      };
      return chain;
    },
  };
  void admin;
  const r = await patchMomentMemo(MOMENT, DEVICE, { memo: "x" }, nullAdmin as any);
  assert.strictEqual(r.status, 404);
});
