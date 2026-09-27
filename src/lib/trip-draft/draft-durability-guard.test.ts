// THIS-TRIP-SYNC-DURABILITY-AND-CONCURRENCY-V1 §12 — 내구·동시성 계약 가드
// 실행: node --experimental-strip-types src/lib/trip-draft/draft-durability-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { applyOpLocal, draftKeyOf, DRAFT_OPS_KEY, type DraftOp } from "./draft-ops-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");

const op = (type: DraftOp["type"], payload: Record<string, unknown>): DraftOp =>
  ({ id: "00000000-0000-4000-8000-000000000001", type, payload, ts: 0 });

test("unit — 복합 identity(tripCity|sourceKey)·add 중복 0·remove 멱등", () => {
  const a = { sourceKey: "k1", tripCity: "busan", sortOrder: 1 };
  assert.equal(draftKeyOf(a), "busan|k1");
  assert.equal(draftKeyOf({ id: "x" }), "|x");
  let items = applyOpLocal([], op("add_item", { item: a }));
  items = applyOpLocal(items, op("add_item", { item: { ...a } }));
  assert.equal(items.length, 1, "동일 장소 반복 추가 = 1개");
  items = applyOpLocal(items, op("remove_item", { key: "busan|k1" }));
  items = applyOpLocal(items, op("remove_item", { key: "busan|k1" }));
  assert.equal(items.length, 0, "반복 제거 무해");
});

test("unit — reorder 는 membership 불변: 모르는 신규 항목을 결정적으로 보존", () => {
  const base = [
    { sourceKey: "A", tripCity: "busan", sortOrder: 1 },
    { sourceKey: "B", tripCity: "busan", sortOrder: 2 },
    { sourceKey: "NEW", tripCity: "busan", sortOrder: 3 }, // 다른 기기가 방금 추가
  ];
  const out = applyOpLocal(base, op("reorder_items", { keys: ["busan|B", "busan|A"] }));
  assert.deepEqual(out.map(draftKeyOf), ["busan|B", "busan|A", "busan|NEW"]);
  assert.deepEqual(out.map(x => x.sortOrder), [1, 2, 3]);
});

test("080 — 원자성·멱등·경계 계약(정적)", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations"));
  assert.equal(files.filter(f => f.endsWith(".sql")).length, 81); // +081 RLS hotfix(Production 기적용) 합류
  assert.equal(files.filter(f => f.startsWith("080")).length, 1);
  const s = read("supabase/migrations/080_trip_draft_operations.sql");
  assert.match(s, /FOR UPDATE/);                                   // row lock — 단일 프로세스 메모리 잠금 아님
  assert.match(s, /applied_ops @> to_jsonb\(ARRAY\[p_op_id\]\)/);  // 같은 op 한 번만
  assert.match(s, /LIMIT 64/);                                     // 무한 op 로그 금지
  assert.match(s, /revision >= 0/);
  assert.match(s, /revision\s*=\s*t\.revision \+ 1/);                  // 서버만 증가
  assert.match(s, /REVOKE ALL ON FUNCTION public\.trip_draft_apply/);
  assert.match(s, /REVOKE ALL ON FUNCTION public\.trip_draft_merge_guest/);
  assert.ok(!/http|net\.|pg_net/i.test(strip(s)), "외부 호출 0");
  assert.match(s, /tripCity/);                                     // 복합 identity 미러
});

test("서버 API — 스냅숏 PUT 폐기·op allowlist·주입 불신(정적)", () => {
  const draft = strip(read("functions/api/trip-draft.ts"));
  assert.ok(!/onRequestPut|onRequestDelete/.test(draft), "일반 클라 전체 덮어쓰기 경로 금지");
  assert.match(draft, /revision/);
  const ops = strip(read("functions/api/trip-draft/ops.ts"));
  assert.match(ops, /resolveOwnership\(/);
  assert.match(ops, /OP_ID_RE/);
  assert.ok(ops.includes("__proto__"), "prototype pollution 거부");
  assert.ok(ops.includes("rpc/trip_draft_apply"), "적용은 원자 RPC 로만");
  assert.ok(!/rest\/v1\/trip_drafts\?/.test(ops), "조건 없는 직접 UPDATE 경로 금지");
  for (const t of ["add_item", "update_item", "remove_item", "reorder_items", "clear_items", "set_trip_context"]) {
    assert.ok(ops.includes(`"${t}"`), t);
  }
  assert.ok(!/body\.(owner|user_id|device_id)/.test(ops), "body owner 불신");
});

test("클라 queue — 보존·재시도 트리거·coalesce·성공 후 제거(정적)", () => {
  const s = read("src/lib/trip-draft-sync.ts");
  assert.equal(DRAFT_OPS_KEY, "koreamate_draft_ops_v1");
  assert.ok(DRAFT_OPS_KEY.startsWith("koreamate_"), "rotation 이 자동 정리하는 prefix");
  assert.match(s, /addEventListener\("online"/);
  assert.match(s, /visibilitychange/);
  assert.match(s, /pagehide/);
  assert.match(s, /keepalive/);
  assert.match(s, /MAX_QUEUE = 200/);
  assert.match(s, /q2\.shift\(\); writeQueue\(q2\);/);            // 성공한 op 만 제거
  assert.match(s, /catch \{ return "retry"; \}/);              // 네트워크 실패 시 보존
  assert.match(s, /400 \|\| res\.status === 413/);                 // 포이즌 drop
  assert.match(s, /TOKEN_WAIT_MS/);                                // 토큰 획득 유계 대기 — inFlight 영구 고착 금지
  assert.match(s, /Promise\.race/);
  assert.match(s, /lastServerContext/);                            // 서버 context 반영 echo op 금지
  assert.match(s, /reorder_items" && q\.length > 0/);              // 연속 reorder coalesce
  const cart = read("src/lib/cart.ts");
  assert.match(cart, /recordCartChange\(prev, readStorage\(\)\)/);
  assert.ok(!/scheduleDraftPush/.test(cart), "스냅숏 debounce 경로 제거");
});

test("로그아웃 — flush 성공 후에만 signOut→rotation·실패 시 성공 위장 0(정적)", () => {
  const whole = strip(read("src/lib/auth/auth-client.ts"));
  const a = whole.slice(whole.indexOf("signOutAndReset")); // reset 경로 안에서만 순서를 본다
  const flushIdx = a.indexOf("flushDraftOps");
  const signOutIdx = a.indexOf("supabase.auth.signOut()");
  const rotateIdx = a.indexOf("rotateDeviceId()");
  assert.ok(flushIdx > 0 && flushIdx < signOutIdx && signOutIdx < rotateIdx, "flush → signOut → rotation 순서");
  assert.match(a, /reason: "unsaved"/);
  const more = read("src/app/more/MoreClient.tsx");
  assert.match(more, /logout_save_failed/);
  assert.match(more, /logoutSaveFailed/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as { auth: Record<string, string> };
    assert.ok((d.auth.logoutSaveFailed ?? "").length > 5, l);
  }
});

test("확정 context·AI 입력 경계(정적)", () => {
  assert.match(read("src/lib/trip-draft/trip-draft-core.ts"), /recordTripContext/);
  assert.match(read("src/app/picks/PicksClient.tsx"), /flushDraftOps/); // 생성 전 flush
  const sql = read("supabase/migrations/080_trip_draft_operations.sql");
  assert.match(sql, /set_trip_context/);
  // context 는 3필드 whitelist(임의 JSON 저장 금지)
  assert.match(sql, /'city',\s+p_payload->'context'->>'city'/);
});
