// 무료 AI 도움 원장 계약 가드 (EXTERNAL-IMPORT-V2 → 정책 교정 2026-09-30)
// 확정 정책: 비용 드는 AI 도움은 성공 시점부터 30일 이동 구간에 무료 1회 — 개인화·글쓰기·가져오기 공유.
// 실행: node --experimental-strip-types --test src/lib/ai-policy/import-quota-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FREE_AI } from "./usage-policy.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const M086 = read("supabase", "migrations", "086_ai_user_usage_shared_30d.sql");
const ANALYZE = read("functions", "api", "import", "analyze.ts");
const PERSONALIZE = read("functions", "api", "trip", "personalize.ts");
const WRITING = read("functions", "api", "mytrip", "writing.ts");

test("086 — 30일 이동 구간·공유 1회·풀 shared_30d (정책 상수와 일치)", () => {
  assert.equal(FREE_AI.windowDays, 30);
  assert.match(M086, /SELECT interval '30 days'/);
  assert.match(M086, /'shared_30d', 'rolling'/);
  // 기능 구분 없이 성공 1건이 있으면 소진(개인화·글쓰기·가져오기 공유)
  assert.match(M086, /WHERE user_id = p_user AND status = 'committed' AND settled_at > now\(\) - public\.ai_user_free_window\(\)/);
  assert.doesNotMatch(M086.slice(M086.indexOf("CREATE OR REPLACE FUNCTION public.ai_user_reserve")), /welcome_import'; v_period|'plan_import';/,
    "첫 가져오기 추가 무료·월 풀은 새 판정에 없다");
  // 다른 요청이 처리 중이면 두 번째를 부르지 않는다(동시 요청으로 1회 초과 금지)
  assert.match(M086, /status = 'reserved' AND idem_key <> p_idem\) THEN\s+RETURN jsonb_build_object\('status','in_progress'\)/);
});

test("세 기능 모두 같은 원장을 쓴다 — 자리표시(placeholder) 없음", () => {
  for (const [name, src] of [["analyze", ANALYZE], ["personalize", PERSONALIZE], ["writing", WRITING]] as const) {
    assert.match(src, /quotaReserve\(/, `${name}: 원장 예약 없음`);
    assert.doesNotMatch(src, /checkUserEntitlementPlaceholder\(/, `${name}: 자리표시가 남아 있다`);
  }
  assert.match(PERSONALIZE, /quotaReserve\(qEnv, auth\.userId, "personalize"/);
  assert.match(WRITING, /quotaReserve\(qEnv, legacyAuth\.userId, "writing"/, "제목 AI(legacy) 경로");
  assert.match(WRITING, /quotaReserve\(cEnv, userAuth\.userId, "writing"/, "표지·기록 문구(캐시) 경로");
});

test("분석 순서 — 로그인 → 사용자 무료 1회 → 외부 fetch → 회사 게이트 → provider", () => {
  const body = ANALYZE.slice(ANALYZE.indexOf("export async function onRequestPost"));
  const idx = ["requireActiveUser(", "quotaReserve(", "safeFetchPage(", "aiOpsReserve(", "analyzeWithAi("].map(k => body.indexOf(k));
  assert.ok(idx.every((v, i) => v > 0 && (i === 0 || v > idx[i - 1]!)), JSON.stringify(idx));
});

test("차감은 완성 결과에만 — 실패·무효는 해제, 캐시 적중은 원장 밖", () => {
  assert.match(ANALYZE, /quotaSettle\(qEnv, quotaId, userId, "released"\)/);
  assert.match(ANALYZE, /quotaSettle\(qEnv, quotaId, userId, "committed", \{ analysis: a, pageTitle, url \}\)/);
  assert.match(PERSONALIZE, /profile \? "committed" : "released"/);
  assert.match(WRITING, /quotaSettle\(cEnv, genQuota\.id, userAuth\.userId, ok \? "committed" : "released"\)/);
  // 캐시 적중(server_hit)은 원장 예약보다 앞에서 반환된다
  assert.ok(WRITING.indexOf('cache: "server_hit"') < WRITING.indexOf("quotaReserve(cEnv"));
  assert.match(ANALYZE, /if \(q\.status === "unavailable"\) return fail\("quota_unavailable"\)/, "셀 수 없으면 부르지 않는다");
});

test("원문은 원장에 저장하지 않는다 — 재응답용 결과만, 24시간 뒤 비운다", () => {
  assert.match(M086, /result = NULL\s+WHERE user_id = p_user AND result IS NOT NULL AND settled_at < now\(\) - interval '24 hours'/);
  assert.doesNotMatch(M086, /\braw_text\b|\binput_text\b|\bsource_text\b/);
});
