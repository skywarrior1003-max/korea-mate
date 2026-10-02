// AI 회사 비용 예약 동시성 검사 — **Staging 전용** (2026-10-02)
//
// 실제 예약 함수(ai_ops_reserve)를 동시에 여러 번 불러, 기능별 일일 상한과 회사 일일 상한을 넘는 예약이
// 하나도 통과하지 않는지 본다. 시험 행은 route 이름(qa_cc_*)으로 구분하고 끝나면 모두 released 로 정산한다
// (released 는 상한 합계에서 빠진다 — 예산을 쓰지 않는다). 스위치·예산 값은 바꾸지 않는다.
//
// 실행: STAGING_SERVICE_ROLE_KEY=… node scripts/ai-ops-reserve-concurrency-check.mjs <staging project ref>
//   예약은 앱과 같은 길(PostgREST rpc, service role)로 동시에 보낸다. 합계 조회·정리는 .env.local 의
//   SUPABASE_ACCESS_TOKEN(Management API, 초당 요청 제한이 있어 재시도)을 쓴다. 값은 출력하지 않는다.
import { readFileSync } from "node:fs";

const PROD_REF = "tfulaxxtorbxhlgupktc";
const ref = process.argv[2];
if (!ref || ref === PROD_REF) { console.error("Staging project ref 를 넘기세요(Production 금지)"); process.exit(2); }
const token = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) { console.error("SUPABASE_ACCESS_TOKEN 없음"); process.exit(2); }
const srk = process.env.STAGING_SERVICE_ROLE_KEY;
if (!srk) { console.error("STAGING_SERVICE_ROLE_KEY 없음"); process.exit(2); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const sql = async q => {
  for (let a = 0; ; a++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
    if (r.status === 429 && a < 20) { await wait(3000 * (a + 1)); continue; }
    const j = await r.json(); if (!r.ok || !Array.isArray(j)) throw new Error(`sql ${r.status}`); return j;
  }
};
/** 앱(aiOpsReserve)과 같은 길 — PostgREST rpc */
const rpc = async body => {
  const r = await fetch(`https://${ref}.supabase.co/rest/v1/rpc/ai_ops_reserve`, { method: "POST", headers: { apikey: srk, Authorization: `Bearer ${srk}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null); return Array.isArray(j) ? j[0] : { ok: false, reason: `http_${r.status}` };
};
const RUN = Date.now().toString(36);
const created = [];
const reserve = (route, worst, calls, featureUsd, i) => rpc({ p_route: route, p_model: "qa", p_worst_usd_micro: worst,
  p_idem_key: `qa-cc-${RUN}-${route}-${i}`, p_actor_hash: null, p_feature_daily_calls: calls, p_feature_daily_usd_micro: featureUsd });
const spent = async route => (await sql(`select coalesce(sum(coalesce(committed_usd_micro,reserved_usd_micro)),0)::bigint s from public.ai_ops_ledger
  where status <> 'released' and created_at >= date_trunc('day', now())${route ? ` and route='${route}'` : ""}`))[0].s;
let fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`); if (!ok) fail++; };
try {
  const caps = Object.fromEntries((await sql(`select ops_key, value_text from public.ai_ops_switches where ops_key like 'budget%'`)).map(r => [r.ops_key, Number(r.value_text)]));
  // ① 기능별 일일 상한 — 전체 여행 글쓰기와 같은 값(writing: $1/일·100회), 예약 상한 95,000µ$ 를 20건 동시
  {
    const route = `qa_cc_feature_${RUN}`, worst = 95_000, cap = 1_000_000;
    const rows = await Promise.all(Array.from({ length: 20 }, (_, i) => reserve(route, worst, 100, cap, i)));
    rows.forEach(r => r?.ledger_id && created.push(r.ledger_id));
    const ok = rows.filter(r => r?.ok).length;
    check("기능 일일 상한(1,000,000µ$)에 95,000µ$ 20건 동시", ok === Math.floor(cap / worst) && Number(await spent(route)) <= cap,
      { ok, expected: Math.floor(cap / worst), reservedSum: Number(await spent(route)), reasons: [...new Set(rows.filter(r => !r.ok).map(r => r.reason))] });
  }
  // ② 기능별 일일 호출 수 — 100회 상한에 1µ$ 120건 동시
  {
    const route = `qa_cc_calls_${RUN}`;
    const rows = await Promise.all(Array.from({ length: 120 }, (_, i) => reserve(route, 1, 100, 0, i)));
    rows.forEach(r => r?.ledger_id && created.push(r.ledger_id));
    check("기능 일일 호출 100회에 120건 동시", rows.filter(r => r?.ok).length === 100, { ok: rows.filter(r => r?.ok).length });
  }
  // ③ 회사 일일 상한 — 남은 금액을 1,000,000µ$ 단위로 넘치게 동시 예약
  {
    const route = `qa_cc_daily_${RUN}`, unit = 1_000_000;
    const before = Number(await spent(null)), room = caps.budget_daily_usd_micro - before;
    const n = Math.floor(room / unit) + 3;
    const rows = await Promise.all(Array.from({ length: n }, (_, i) => reserve(route, unit, 0, 0, i)));
    rows.forEach(r => r?.ledger_id && created.push(r.ledger_id));
    const ok = rows.filter(r => r?.ok).length, total = Number(await spent(null));
    check("회사 일일 상한에 남은 금액보다 많이 동시 예약", ok === Math.floor(room / unit) && total <= caps.budget_daily_usd_micro,
      { dailyCap: caps.budget_daily_usd_micro, spentBefore: before, ok, expected: Math.floor(room / unit), spentAfter: total });
  }
  // ④ 같은 요청 열쇠 동시 — 한 건만 예약
  {
    const route = `qa_cc_idem_${RUN}`;
    const rows = await Promise.all(Array.from({ length: 5 }, () => rpc({ p_route: route, p_model: "qa", p_worst_usd_micro: 1000, p_idem_key: `qa-cc-${RUN}-same`, p_actor_hash: null, p_feature_daily_calls: 0, p_feature_daily_usd_micro: 0 })));
    rows.forEach(r => r?.ledger_id && r.ok && created.push(r.ledger_id));
    const n = (await sql(`select count(*)::int n from public.ai_ops_ledger where idempotency_key='qa-cc-${RUN}-same'`))[0].n;
    check("같은 요청 열쇠 5건 동시", n === 1, { rows: n, results: rows.map(r => r?.ok ? "ok" : r?.reason ?? "error") });
  }
} finally {
  // 모든 시험 행을 released 로 — 합계에서 빠진다
  await sql(`update public.ai_ops_ledger set status='released', committed_usd_micro=null where route like 'qa_cc_%${RUN}' and status='reserved'`);
  const left = (await sql(`select count(*)::int n from public.ai_ops_ledger where route like 'qa_cc_%${RUN}' and status <> 'released'`))[0].n;
  console.log(`정리: 시험 행 ${created.length}건 released · 남은 미정산 ${left}`);
  if (left !== 0) fail++;
}
process.exit(fail ? 1 : 0);
