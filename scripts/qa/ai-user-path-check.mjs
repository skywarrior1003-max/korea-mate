#!/usr/bin/env node
/**
 * AI 사용자 경로 점검 — 로그인한 합성 시험 계정으로 실제 Preview 경로를 두드린다(2026-09-30).
 *
 *   기본(AI 호출 0):  node scripts/qa/ai-user-path-check.mjs
 *   AI 포함(1~3회):   node scripts/qa/ai-user-path-check.mjs --with-ai --confirm=STAGING-AI-USER-PATH
 *
 * 왜 필요한가
 *   관리자 canary(/api/admin/ai-personalization-canary)는 34d0a6c9 부터 로그인 필수가 된 개인화 route 를
 *   세션 없는 내부 요청으로 부르므로 provider 까지 가지 못한다. 인증을 완화·우회하지 않고, 실제 사용자와
 *   같은 방식(동의 → 활성화 → Bearer 세션)으로 같은 route 를 부른다.
 *
 * 무엇을 보나(기본 — provider 호출 0)
 *   U1 로그인 없으면 401 · 회사 원장 0행
 *   U2 회사 비용 상한 — 실제 예약 함수(ai_ops_reserve)가 일일 예산·기능별 예산·중복 요청을 거절하고 행을 만들지 않는다
 *   U3 실패 복구 — 회사 예약이 거절되면(중복 요청 열쇠) 사용자 무료 횟수가 released 로 돌아가고 provider 0.
 *      이 스크립트가 먼저 같은 열쇠의 예약 1행을 만들고 곧바로 released 로 닫는다(비용 0 · 상한 계산 제외).
 *   U4 소진 — 이번 달 무료 횟수를 다 쓴 계정은 fallback_quota(다음 가능일)이고 provider 0 · 원장 0행
 *   U5 잘못된 요청 — 기간 14일 초과는 로그인·차감 이전에 막힌다: provider 0 · 원장 0행 · 사용자 행 0
 *      (후보 0개는 잘못된 요청이 아니다 — route 가 도시 전체 기준으로 부른다. 2026-09-30 실측)
 * --with-ai 일 때만
 *   A1 첫 요청 → applied 면 사용자 committed + 원장 committed(실토큰) / 실패면 released + 원장 unknown_billed
 *   A2 같은 request_id 재요청 → 추가 원장 0 · 추가 차감 0
 *
 * 안전
 *   · Staging(Supabase ref nimzhbntqoezqserujoc)·*.korea-mate.pages.dev 에서만 돈다. Production ref·도메인이면 즉시 중단.
 *   · 합성 계정(qa-aipath-…@gokoreamate.test)만 만들고 끝나면 그 계정과 그 계정 행만 지운다. 회사 원장은 감사 기록이라 지우지 않는다.
 *   · 스위치·상한 값을 바꾸지 않는다. 비밀값·토큰·이메일을 출력하지 않는다.
 *
 * 필요한 환경 변수: GKM_QA_BASE, GKM_QA_SUPABASE_URL, GKM_QA_SUPABASE_ANON, GKM_QA_SUPABASE_SERVICE_ROLE
 */
import { randomUUID } from "node:crypto";

const STAGING_REF = "nimzhbntqoezqserujoc";
const PRODUCTION_REF = "tfulaxxtorbxhlgupktc";
const BASE = (process.env.GKM_QA_BASE ?? "").replace(/\/$/, "");
const SB = (process.env.GKM_QA_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON = process.env.GKM_QA_SUPABASE_ANON ?? "";
const SR = process.env.GKM_QA_SUPABASE_SERVICE_ROLE ?? "";
const WITH_AI = process.argv.includes("--with-ai");
const CONFIRMED = process.argv.includes("--confirm=STAGING-AI-USER-PATH");

function stop(msg) { console.error(`STOP: ${msg}`); process.exit(2); }
if (!BASE || !SB || !ANON || !SR) stop("GKM_QA_* 환경 변수가 없다");
if (SB.includes(PRODUCTION_REF) || !SB.includes(STAGING_REF)) stop("Staging Supabase 가 아니다");
if (!/^https:\/\/[a-z0-9-]+\.korea-mate\.pages\.dev$/.test(BASE)) stop("Preview 주소(*.korea-mate.pages.dev)가 아니다");
if (WITH_AI && !CONFIRMED) stop("--with-ai 는 --confirm=STAGING-AI-USER-PATH 와 함께만");

const SRH = { apikey: SR, Authorization: `Bearer ${SR}`, "content-type": "application/json" };
async function rest(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...SRH, ...(init.headers ?? {}) } });
  const t = await r.text();
  let data = null; try { data = t ? JSON.parse(t) : null; } catch { data = t; }
  return { ok: r.ok, status: r.status, data };
}
const since = new Date(Date.now() - 1000).toISOString();
async function ledgerCount(route) {
  const r = await rest(`ai_ops_ledger?select=id&route=eq.${route}&created_at=gte.${encodeURIComponent(since)}`);
  return Array.isArray(r.data) ? r.data.length : -1;
}
async function usage(userId) {
  const r = await rest(`ai_user_usage?select=feature,pool,period,status&user_id=eq.${userId}&order=id`);
  return Array.isArray(r.data) ? r.data : [];
}

const created = [];
const RUN = Date.now().toString(36);
async function makeUser(tag) {
  const email = `qa-aipath-${tag}-${RUN}@gokoreamate.test`;
  const pw = `Qa-aipath-${randomUUID().slice(0, 12)}!`;
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: SRH, body: JSON.stringify({ email, password: pw, email_confirm: true }) })).json();
  if (!u?.id) stop("합성 계정 생성 실패");
  created.push(u.id);
  const session = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) })).json();
  const device = randomUUID();
  const intent = await fetch(`${BASE}/api/auth/consent-intent`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ age_over_14: true, terms_agreed: true, privacy_acknowledged: true, locale: "ko" }) });
  const cookie = (intent.headers.get("set-cookie") || "").split(";")[0];
  const act = await fetch(`${BASE}/api/auth/activate`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, Authorization: `Bearer ${session.access_token}`, "x-device-id": device, cookie } });
  if (!act.ok) stop(`활성화 실패 ${act.status}`);
  return { id: u.id, token: session.access_token, device };
}
async function personalize(user, requestId, ids = ["39", "966", "1460"], dates = { start_date: "2026-10-20", end_date: "2026-10-21" }) {
  const r = await fetch(`${BASE}/api/trip/personalize`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...(user ? { Authorization: `Bearer ${user.token}`, "x-device-id": user.device } : { "x-device-id": randomUUID() }) },
    body: JSON.stringify({ request_id: requestId, city: "busan", ...dates, selected_place_ids: ids }),
  });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return { http: r.status, ai_status: j.ai_status ?? j.error ?? null, next_free_at: j.next_free_at ?? null };
}

const results = [];
function check(id, pass, detail) { results.push({ id, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(detail)}`); }
// personalize route 의 요청 열쇠(shortHash)와 같은 계산 — functions/api/trip/personalize.ts 와 같아야 한다
function routeRequestHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}
const kstMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

try {
  // U1 로그인 없음
  {
    const before = await ledgerCount("personalize");
    const r = await personalize(null, `qa-aipath-u1-${randomUUID()}`);
    check("U1 unauthenticated", r.http === 401 && (await ledgerCount("personalize")) === before, { http: r.http, ai_status: r.ai_status });
  }
  // U2 회사 비용 상한 — 거절만 부른다(행을 만들지 않는다)
  {
    const count0 = (await rest(`ai_ops_ledger?select=id&created_at=gte.${encodeURIComponent(since)}`)).data?.length ?? -1;
    const reserve = (o) => rest("rpc/ai_ops_reserve", { method: "POST", body: JSON.stringify({ p_route: "personalize", p_model: "qa-probe", p_actor_hash: null, ...o }) });
    const day = await reserve({ p_worst_usd_micro: 9_000_000_000_000, p_idem_key: `qa-aipath-cap-day-${RUN}`, p_feature_daily_calls: 0, p_feature_daily_usd_micro: 0 });
    const feat = await reserve({ p_worst_usd_micro: 2, p_idem_key: `qa-aipath-cap-feat-${RUN}`, p_feature_daily_calls: 0, p_feature_daily_usd_micro: 1 });
    const anyKey = (await rest(`ai_ops_ledger?select=idempotency_key&order=id.desc&limit=1`)).data?.[0]?.idempotency_key ?? null;
    const dup = anyKey ? await reserve({ p_worst_usd_micro: 1, p_idem_key: anyKey, p_feature_daily_calls: 0, p_feature_daily_usd_micro: 0 }) : null;
    const count1 = (await rest(`ai_ops_ledger?select=id&created_at=gte.${encodeURIComponent(since)}`)).data?.length ?? -1;
    const reason = x => (Array.isArray(x?.data) ? x.data[0]?.reason : null);
    check("U2 company cap refusals", reason(day) === "daily_budget_exceeded" && reason(feat) === "feature_daily_budget_exceeded" && (!dup || reason(dup) === "duplicate_idempotency") && count0 === count1,
      { daily: reason(day), feature_budget: reason(feat), duplicate: dup ? reason(dup) : "skipped(no ledger row)", new_rows: count1 - count0 });
  }
  // U3 실패 복구 — 같은 열쇠의 예약을 먼저 만들어 닫아 두면 route 의 회사 예약이 중복으로 거절된다
  {
    const rid = `qa-aipath-u3-${randomUUID()}`;
    const key = `personalize:${routeRequestHash(rid)}`;
    const pre = await rest("rpc/ai_ops_reserve", { method: "POST", body: JSON.stringify({ p_route: "personalize", p_model: "qa-probe", p_worst_usd_micro: 1, p_idem_key: key, p_actor_hash: null, p_feature_daily_calls: 0, p_feature_daily_usd_micro: 0 }) });
    const preId = Array.isArray(pre.data) && pre.data[0]?.ok ? pre.data[0].ledger_id : null;
    if (preId) await rest("rpc/ai_ops_settle", { method: "POST", body: JSON.stringify({ p_ledger_id: preId, p_status: "released", p_committed_usd_micro: null, p_input_tokens: null, p_output_tokens: null }) });
    if (!preId) check("U3 recovery (company refusal → user released)", false, { skipped: "could not pre-reserve collision key" });
    else {
      const u = await makeUser("u3");
      const before = await ledgerCount("personalize");
      const r = await personalize(u, rid);
      const us = await usage(u.id);
      check("U3 recovery (company refusal → user released)", r.ai_status === "fallback_guard" && us.length === 1 && us[0].status === "released" && (await ledgerCount("personalize")) === before,
        { ai_status: r.ai_status, user_usage: us.map(x => `${x.pool}:${x.status}`), new_rows: (await ledgerCount("personalize")) - before });
    }
  }
  // U4 소진 — 이번 달 plan + welcome 을 이미 쓴 계정
  {
    const u = await makeUser("u4");
    const ins = await rest("ai_user_usage", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([
      { user_id: u.id, feature: "personalize", pool: "plan", period: kstMonth(), idem_key: `qa-aipath-used-m-${RUN}`, status: "committed", settled_at: new Date().toISOString() },
      { user_id: u.id, feature: "personalize", pool: "plan", period: "welcome", idem_key: `qa-aipath-used-w-${RUN}`, status: "committed", settled_at: new Date().toISOString() },
    ]) });
    const before = await ledgerCount("personalize");
    const r = await personalize(u, `qa-aipath-u4-${randomUUID()}`);
    check("U4 exhausted → no provider", ins.ok && r.ai_status === "fallback_quota" && !!r.next_free_at && (await ledgerCount("personalize")) === before && (await usage(u.id)).length === 2,
      { seeded: ins.status, ai_status: r.ai_status, next_free_at: r.next_free_at });
  }
  // U5 잘못된 요청(후보 0)
  {
    const u = await makeUser("u5");
    const before = await ledgerCount("personalize");
    const r = await personalize(u, `qa-aipath-u5-${randomUUID()}`, ["39", "966", "1460"], { start_date: "2026-10-01", end_date: "2026-10-30" });
    check("U5 invalid request → no provider, no charge", r.ai_status === "fallback_guard" && (await ledgerCount("personalize")) === before && (await usage(u.id)).length === 0,
      { http: r.http, ai_status: r.ai_status, user_usage: (await usage(u.id)).map(x => `${x.pool}:${x.status}`) });
  }
  if (WITH_AI) {
    const u = await makeUser("a1");
    const rid = `qa-aipath-a1-${randomUUID()}`;
    const before = await ledgerCount("personalize");
    const r1 = await personalize(u, rid);
    const led1 = (await rest(`ai_ops_ledger?select=status,committed_usd_micro,input_tokens,output_tokens&idempotency_key=eq.personalize:${rid}`)).data?.[0] ?? null;
    const us1 = await usage(u.id);
    const applied = r1.ai_status === "applied";
    check("A1 real call settles both ledgers", (await ledgerCount("personalize")) === before + 1 && (applied
      ? us1[0]?.status === "committed" && led1?.status === "committed"
      : us1[0]?.status === "released" && ["unknown_billed", "released"].includes(led1?.status)),
      { ai_status: r1.ai_status, ledger: led1?.status, usd_micro: led1?.committed_usd_micro ?? null, user: us1.map(x => `${x.pool}:${x.status}`) });
    const mid = await ledgerCount("personalize");
    const r2 = await personalize(u, rid);
    check("A2 same request_id → no extra ledger/charge", (await ledgerCount("personalize")) === mid && (await usage(u.id)).filter(x => x.status === "committed").length === us1.filter(x => x.status === "committed").length,
      { ai_status: r2.ai_status });
  }
} finally {
  // 만든 합성 계정과 그 계정 행만 정리(회사 원장은 감사 기록이라 남긴다)
  for (const id of created) {
    await rest(`ai_user_usage?user_id=eq.${id}`, { method: "DELETE" });
    await rest(`account_devices?user_id=eq.${id}`, { method: "DELETE" });
    await rest(`user_consents?user_id=eq.${id}`, { method: "DELETE" });
    await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: SRH });
  }
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} PASS · synthetic accounts created/removed: ${created.length}`);
  process.exitCode = failed ? 1 : 0;
}
