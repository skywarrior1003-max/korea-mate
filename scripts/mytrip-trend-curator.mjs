// Trend Pack curator (MULTILOCALE-TREND-DB V2 §4·§10·§15)
//
// 사용자 요청 경로와 완전히 분리된 주기 실행용 도구다(런타임 웹 검색 0 —
// 조사 결과 JSON 을 사람이/에이전트가 만들고, 이 스크립트는 규칙 적용·DB 반영만).
// idempotent: 같은 입력을 몇 번 실행해도 결과가 같다(id upsert, 집계 카운터 비파괴).
//
// 실행(Node 22+):
//   node --experimental-strip-types scripts/mytrip-trend-curator.mjs --ingest <candidates.json>
//   node --experimental-strip-types scripts/mytrip-trend-curator.mjs --review [--apply-quality]
//
// 필요한 secret(환경변수 — Production 값 사용 금지, Staging 전용):
//   TREND_SUPABASE_URL           예: https://<staging-ref>.supabase.co (또는 iso 프록시)
//   TREND_SUPABASE_SERVICE_KEY   Staging service_role key
//
// 예약 실행(§15): Cloudflare 신규 scheduled Worker 는 신규 자원이라 이 작업에서
// 만들지 않는다. Owner 설정 위치: Cloudflare Dashboard → Workers & Pages →
// (신규 staging worker) → Settings → Triggers → Cron(주 1회). 그 전까지는 이
// 명령을 수동/에이전트 주간 실행한다. 조사 예상: locale당 웹검색 3~6회(무과금),
// Gemini Search Grounding 미사용(검색비 $0).

import { readFileSync } from "node:fs";
import {
  decideAutoStatus, decideQualityTransition, nextReviewDate, REVIEW_INTERVAL_DAYS,
} from "../src/lib/mytrip-writing/trend-curation.ts";

const URL_BASE = process.env.TREND_SUPABASE_URL;
const KEY = process.env.TREND_SUPABASE_SERVICE_KEY;
if (!URL_BASE || !KEY) { console.error("TREND_SUPABASE_URL / TREND_SUPABASE_SERVICE_KEY 필요"); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const T = `${URL_BASE}/rest/v1/mytrip_trend_packs`;

async function rest(method, path, body, prefer) {
  const r = await fetch(`${T}${path}`, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${text.slice(0, 200)}`);
  return text.trim() ? JSON.parse(text) : null;
}

const today = new Date().toISOString().slice(0, 10);
const mode = process.argv[2];

if (mode === "--ingest") {
  const file = process.argv[3];
  const candidates = JSON.parse(readFileSync(file, "utf8"));
  for (const c of candidates) {
    const status = c.status ?? decideAutoStatus(c.evidence);
    const row = {
      id: c.id, locale: c.locale, region_scope: c.region_scope,
      phrase: c.phrase, canonical_form: c.canonical_form, meaning: c.meaning,
      usage_context: c.usage_context, safe_example: c.safe_example, avoid_context: c.avoid_context,
      source_urls: c.source_urls, source_types: c.source_types,
      first_verified_at: c.first_verified_at ?? today, last_verified_at: today,
      next_review_at: nextReviewDate(c.lifecycle_type),
      lifecycle_type: c.lifecycle_type, status,
      confidence_score: c.confidence_score, risk_score: c.risk_score,
      brand_or_artist_related: c.brand_or_artist_related === true,
      activation_reason: c.activation_reason ?? `auto:${status}`,
      decision_actor: "auto-curation-v1",
      pack_version: c.pack_version,
      updated_at: new Date().toISOString(),
    };
    // 집계 카운터 컬럼은 보내지 않는다 — merge upsert 라 기존 값이 보존된다
    await rest("POST", "?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");
    console.log(`[ingest] ${row.id} → ${status} (review ${row.next_review_at})`);
  }
  process.exit(0);
}

if (mode === "--review") {
  const due = await rest("GET", `?next_review_at=lte.${today}&status=in.(active,experimental_active)&select=id,locale,phrase,status,lifecycle_type,next_review_at,shown_count,selected_count,heavily_edited_count,regenerated_after_count`);
  console.log(`재검증 대상(기한 경과): ${due.length}`);
  for (const r of due) console.log(` - ${r.id} (${r.locale}) '${r.phrase}' ${r.status} — 조사 필요(자동 연장 없음)`);
  if (process.argv.includes("--apply-quality")) {
    const all = await rest("GET", `?status=in.(active,experimental_active)&select=id,status,shown_count,selected_count,heavily_edited_count,regenerated_after_count`);
    for (const r of all) {
      const next = decideQualityTransition(r);
      if (next && next !== r.status) {
        await rest("PATCH", `?id=eq.${r.id}`, { status: next, activation_reason: `quality:${next}`, updated_at: new Date().toISOString() }, "return=minimal");
        console.log(`[quality] ${r.id}: ${r.status} → ${next}`);
      }
    }
  }
  console.log("주기표:", JSON.stringify(REVIEW_INTERVAL_DAYS));
  process.exit(0);
}

console.error("사용법: --ingest <file> | --review [--apply-quality]");
process.exit(1);
