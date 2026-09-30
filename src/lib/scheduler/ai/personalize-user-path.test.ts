// AI 스케줄러 — 로그인한 사용자 경로의 비용·차감 계약(2026-09-30).
//
// 왜 있나
//   관리자 canary(canary.test.ts C9~C26)는 세션 없는 내부 요청으로 개인화 route 를 부른다. 34d0a6c9 부터 이
//   route 는 로그인·동의가 필요해 canary 는 provider 까지 가지 못한다(인증을 완화하지 않는다 — Owner 결정).
//   여기서는 **실제 route 핸들러**를 로그인한 사용자 요청으로 부르고, Supabase(인증·동의·사용자 무료 횟수·
//   회사 스위치·회사 원장)와 provider 만 메모리 가짜로 둔다. 가짜의 규칙은 migration 072·084·087 의 SQL 과 같게 맞췄다.
//
// 지키는 것
//   성공 1회 차감 · 실패(provider 오류·시간 초과·형식 오류·회사 거절) 차감 복구 · 같은 요청 재전송 무차감 ·
//   동시 요청 1회만 호출 · 소진 후 provider 0 · 회사 비용 상한 · 다른 사용자의 같은 일정 요청이 서로 막지 않음 ·
//   로그인·동의 없으면 provider 0.
import "../../../../scripts/ts-resolve-hook.mjs";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

const BASE = "https://sb.test";
const USERS: Record<string, string> = { "tok-a": "aaaaaaaa-0000-4000-8000-000000000001", "tok-b": "bbbbbbbb-0000-4000-8000-000000000002", "tok-noconsent": "cccccccc-0000-4000-8000-000000000003" };
const ENV = {
  APP_ENV: "staging", AI_MODE: "test", GEMINI_API_KEY: "test-only-fake-key",
  AI_PERSONALIZATION_MODE: "staging-live",
  NEXT_PUBLIC_SUPABASE_URL: BASE, NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test", SUPABASE_SERVICE_ROLE_KEY: "sr-test",
  MYTRIP_HASH_SECRET: "test-secret",
};

// ── 가짜 Supabase(072·084·087 규칙) ─────────────────────────────────────────
interface UsageRow { id: number; user: string; pool: string; period: string; idem: string; status: "reserved" | "committed" | "released"; result: unknown }
interface LedgerRow { id: number; route: string; key: string; status: string; reserved: number; committed: number | null }
let usage: UsageRow[] = [];
let ledger: LedgerRow[] = [];
let switches: Record<string, string> = {};
let dailyCapUsdMicro = 5_000_000;
let provider: { calls: number; mode: "ok" | "http500" | "timeout" | "badjson" } = { calls: 0, mode: "ok" };
const month = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);

function userReserve(user: string, idem: string): Record<string, unknown> {
  const same = usage.find(r => r.user === user && r.idem === idem);
  if (same?.status === "committed") return { status: "replay", id: same.id, pool: same.pool, result: same.result };
  if (same?.status === "reserved") return { status: "in_progress" };
  if (usage.some(r => r.user === user && r.pool === "plan" && r.status === "reserved" && r.idem !== idem)) return { status: "in_progress" };
  const usedMonth = usage.filter(r => r.user === user && r.pool === "plan" && r.period === month() && r.status === "committed").length;
  let period = month();
  if (usedMonth >= 1) {
    if (usage.some(r => r.user === user && r.pool === "plan" && r.period === "welcome" && r.status === "committed")) return { status: "exhausted", pool: "plan", resets_at: "2099-01-01T00:00:00Z" };
    period = "welcome";
  }
  if (same) { same.status = "reserved"; same.period = period; return { status: "reserved", id: same.id, pool: "plan", period }; }
  const row: UsageRow = { id: usage.length + 1, user, pool: "plan", period, idem, status: "reserved", result: null };
  usage.push(row);
  return { status: "reserved", id: row.id, pool: "plan", period };
}
function opsReserve(a: { p_route: string; p_idem_key: string; p_worst_usd_micro: number }): Record<string, unknown>[] {
  const dup = ledger.find(l => l.key === a.p_idem_key);
  if (dup) return [{ ok: false, reason: "duplicate_idempotency", ledger_id: dup.id }];
  const spent = ledger.filter(l => l.status !== "released").reduce((n, l) => n + (l.committed ?? l.reserved), 0);
  if (spent + a.p_worst_usd_micro > dailyCapUsdMicro) return [{ ok: false, reason: "daily_budget_exceeded", ledger_id: null }];
  const row: LedgerRow = { id: ledger.length + 1, route: a.p_route, key: a.p_idem_key, status: "reserved", reserved: a.p_worst_usd_micro, committed: null };
  ledger.push(row);
  return [{ ok: true, reason: "reserved", ledger_id: row.id }];
}
const jsonRes = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

const PROFILE = {
  profile_version: 1, category_weights: { attraction: 0.6, nature: 0.5, restaurant: 0.4 },
  preferred_place_ids: ["39"], time_preferences: { nature: "morning" }, pace_bias: 0.1,
  day_density_preference: "balanced", cluster_preference: "balanced", meal_preference: "flexible",
  preference_summary: "A balanced mix of beaches and city sights.",
};

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : {};
  if (url.includes("generativelanguage.googleapis.com")) {
    provider.calls += 1;
    if (provider.mode === "timeout") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    if (provider.mode === "http500") return jsonRes({ error: { status: "INTERNAL" } }, 500);
    const text = provider.mode === "badjson" ? "not json" : JSON.stringify(PROFILE);
    return jsonRes({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 150, thoughtsTokenCount: 0, totalTokenCount: 550 } });
  }
  if (!url.startsWith(BASE)) return realFetch(input as RequestInfo, init);
  const path = url.slice(BASE.length);
  if (path === "/auth/v1/user") {
    const tok = String((init?.headers as Record<string, string>)?.Authorization ?? "").replace(/^Bearer /, "");
    return USERS[tok] ? jsonRes({ id: USERS[tok] }) : jsonRes({ msg: "invalid" }, 401);
  }
  if (path.startsWith("/rest/v1/user_consents")) return jsonRes(path.includes(USERS["tok-noconsent"]!) ? [] : [{ id: 1 }]);
  if (path.startsWith("/rest/v1/ai_ops_switches")) return jsonRes(Object.entries(switches).map(([ops_key, value_text]) => ({ ops_key, value_text })));
  if (path === "/rest/v1/rpc/ai_user_reserve") return jsonRes(userReserve(body.p_user, body.p_idem));
  if (path === "/rest/v1/rpc/ai_user_settle") {
    const r = usage.find(x => x.id === body.p_id && x.user === body.p_user && x.status === "reserved");
    if (!r) return jsonRes(false);
    r.status = body.p_status; r.result = body.p_result; return jsonRes(true);
  }
  if (path === "/rest/v1/rpc/ai_ops_reserve") return jsonRes(opsReserve(body));
  if (path === "/rest/v1/rpc/ai_ops_settle") {
    const l = ledger.find(x => x.id === body.p_ledger_id && x.status === "reserved");
    if (!l) return jsonRes(false);
    l.status = body.p_status; l.committed = body.p_status === "committed" ? body.p_committed_usd_micro : body.p_status === "unknown_billed" ? l.reserved : null;
    return jsonRes(true);
  }
  return jsonRes({ error: `unexpected ${path}` }, 500);
}) as typeof fetch;

const { onRequestPost: personalize } = await import("../../../../functions/api/trip/personalize.ts");
const { _resetSwitchCache } = await import("../../../../functions/_lib/ai-ops-guard.ts");

async function call(tok: string | null, requestId = "busan|2026-10-20|2026-10-21|relaxed|1|normal|1460,39,966") {
  const res = await personalize({
    request: new Request("https://preview.test/api/trip/personalize", {
      method: "POST",
      headers: { "content-type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: JSON.stringify({ request_id: requestId, city: "busan", start_date: "2026-10-20", end_date: "2026-10-21", selected_place_ids: ["39", "966", "1460"] }),
    }),
    env: ENV as never,
  });
  return { status: res.status, body: await res.json() as { ai_status?: string; error?: string } };
}
const committed = (user: string) => usage.filter(r => r.user === user && r.status === "committed").length;

beforeEach(() => {
  usage = []; ledger = []; dailyCapUsdMicro = 5_000_000;
  switches = { ai_master: "live", feature_personalize: "live" };
  provider = { calls: 0, mode: "ok" };
  _resetSwitchCache();
});

test("UP1 성공 — provider 1회 · 사용자 1회 차감 · 회사 원장 실토큰 committed", async () => {
  const r = await call("tok-a");
  assert.equal(r.body.ai_status, "applied");
  assert.equal(provider.calls, 1);
  assert.equal(committed(USERS["tok-a"]!), 1);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]!.status, "committed");
  assert.ok((ledger[0]!.committed ?? 0) > 0 && (ledger[0]!.committed ?? 0) < ledger[0]!.reserved, "실토큰 기준 정산");
});

test("UP2 같은 요청 재전송 — 이전 결과를 돌려주고 provider 0 · 추가 차감 0", async () => {
  await call("tok-a");
  const r = await call("tok-a");
  assert.equal(r.body.ai_status, "applied");
  assert.equal(provider.calls, 1);
  assert.equal(committed(USERS["tok-a"]!), 1);
  assert.equal(ledger.length, 1);
});

test("UP3 동시에 두 번 — provider 는 한 번만(나머지는 fallback_duplicate)", async () => {
  const [a, b] = await Promise.all([call("tok-a"), call("tok-a")]);
  assert.deepEqual([a.body.ai_status, b.body.ai_status].sort(), ["applied", "fallback_duplicate"]);
  assert.equal(provider.calls, 1);
  assert.equal(committed(USERS["tok-a"]!), 1);
});

for (const [mode, status, ledgerStatus] of [["http500", "fallback_provider_error", "unknown_billed"], ["timeout", "fallback_timeout", "unknown_billed"], ["badjson", "fallback_invalid_response", "committed"]] as const) {
  test(`UP4 실패 복구(${mode}) — 사용자 차감 0(released) · 회사 원장 ${ledgerStatus} · 재시도 가능`, async () => {
    provider.mode = mode;
    const r = await call("tok-a");
    assert.equal(r.body.ai_status, status);
    assert.equal(provider.calls, 1);
    assert.equal(committed(USERS["tok-a"]!), 0);
    assert.equal(usage[0]!.status, "released");
    assert.equal(ledger[0]!.status, ledgerStatus);
    // 같은 일정으로 다시 시도하면 막히지 않고 다시 부른다(옛 열쇠 personalize:<hash> 는 여기서 영구 중복 거절됐다)
    provider.mode = "ok";
    const again = await call("tok-a");
    assert.equal(again.body.ai_status, "applied");
    assert.equal(provider.calls, 2);
    assert.equal(committed(USERS["tok-a"]!), 1);
  });
}

test("UP5 회사 비용 상한 — 예약 거절이면 provider 0 · 사용자 차감 복구", async () => {
  dailyCapUsdMicro = 1_000; // 예약액(2,500)보다 작다
  const r = await call("tok-a");
  assert.equal(r.body.ai_status, "fallback_guard");
  assert.equal(provider.calls, 0);
  assert.equal(ledger.length, 0);
  assert.equal(usage[0]!.status, "released");
});

test("UP6 회사 스위치 off — provider 0 · 사용자 차감 복구", async () => {
  switches.feature_personalize = "off";
  const r = await call("tok-a");
  assert.equal(provider.calls, 0);
  assert.notEqual(r.body.ai_status, "applied");
  assert.equal(committed(USERS["tok-a"]!), 0);
  assert.ok(usage.every(x => x.status !== "reserved"), "예약이 남지 않는다");
});

test("UP7 무료 횟수 소진 — 이번 달 1회 + 첫 가입 1회를 쓴 뒤에는 provider 0", async () => {
  await call("tok-a", "req-1");
  await call("tok-a", "req-2");
  assert.equal(provider.calls, 2);
  const r = await call("tok-a", "req-3");
  assert.equal(r.body.ai_status, "fallback_quota");
  assert.equal(provider.calls, 2);
  assert.equal(ledger.length, 2);
});

test("UP8 다른 사용자가 같은 일정(같은 request_id)을 요청해도 서로 막지 않는다", async () => {
  const a = await call("tok-a");
  const b = await call("tok-b");
  assert.equal(a.body.ai_status, "applied");
  assert.equal(b.body.ai_status, "applied");
  assert.equal(provider.calls, 2);
  assert.equal(new Set(ledger.map(l => l.key)).size, 2, "회사 원장 열쇠가 겹치지 않는다");
});

test("UP9 로그인·동의 없으면 provider 0 · 사용자 행 0", async () => {
  const noAuth = await call(null);
  const noConsent = await call("tok-noconsent");
  assert.equal(noAuth.status, 401);
  assert.equal(noConsent.status, 403);
  assert.equal(provider.calls, 0);
  assert.equal(usage.length, 0);
  assert.equal(ledger.length, 0);
});
