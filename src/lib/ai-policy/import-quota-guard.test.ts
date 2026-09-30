// 가져오기 무료 횟수·차감 계약 가드 (EXTERNAL-TRIP-IMPORT-V2 · Owner 확정 2026-09-30)
// 실행: node --experimental-strip-types --test src/lib/ai-policy/import-quota-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FREE_MONTHLY, IMPORT_FREE } from "./usage-policy.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const SQL = read("supabase", "migrations", "084_ai_user_usage_ledger.sql");
const ANALYZE = read("functions", "api", "import", "analyze.ts");
const PERSONALIZE = read("functions", "api", "trip", "personalize.ts");

test("DB 한도 = 정책 상수(환영 1 · 개인화·가져오기 공유 월 1 · 글쓰기 월 2)", () => {
  assert.equal(IMPORT_FREE.welcomeOnce, 1);
  assert.equal(IMPORT_FREE.sharedMonthlyLimit, FREE_MONTHLY.aiPersonalize);
  assert.match(SQL, /WHEN 'welcome_import' THEN 1 WHEN 'plan_import' THEN 1 WHEN 'writing' THEN 2/);
  assert.match(SQL, /AT TIME ZONE 'Asia\/Seoul', 'YYYY-MM'/, "월 기준은 KST 달력 월");
});

test("분석 순서 — 로그인 → 사용자 횟수 → 회사 게이트 → provider, 로그인은 외부 fetch 보다 먼저", () => {
  const body = ANALYZE.slice(ANALYZE.indexOf("export async function onRequestPost"));
  const iAuth = body.indexOf("requireActiveUser(");
  const iQuota = body.indexOf("quotaReserve(");
  const iFetch = body.indexOf("safeFetchPage(");
  const iOps = body.indexOf("aiOpsReserve(");
  const iAi = body.indexOf("analyzeWithAi(");
  assert.ok(iAuth > 0 && iAuth < iQuota && iQuota < iFetch && iFetch < iOps && iOps < iAi);
  assert.doesNotMatch(ANALYZE, /checkUserEntitlementPlaceholder/);
});

test("실패·무효는 해제, 완성 결과만 확정(결과 저장 — 같은 요청 재응답 무차감)", () => {
  assert.match(ANALYZE, /quotaSettle\(qEnv, quotaId, userId, "released"\)/);
  assert.match(ANALYZE, /quotaSettle\(qEnv, quotaId, userId, "committed", \{ analysis: a, pageTitle, url \}\)/);
  assert.match(ANALYZE, /charged: false, replay: true/);
  assert.match(ANALYZE, /if \(q\.status === "unavailable"\) return fail\("quota_unavailable"\)/, "셀 수 없으면 부르지 않는다");
});

test("개인화도 같은 원장·같은 풀을 쓴다(성공 프로필일 때만 확정)", () => {
  assert.match(PERSONALIZE, /quotaReserve\(qEnv, auth\.userId, "personalize"/);
  assert.match(PERSONALIZE, /profile \? "committed" : "released"/);
  assert.match(SQL, /ELSE\s+v_pool := 'plan_import';/);
});

test("원문은 원장에 저장하지 않는다 — 재응답용 추출 결과만, 24시간 뒤 비운다", () => {
  assert.match(SQL, /result = NULL\s+WHERE user_id = p_user AND result IS NOT NULL AND settled_at < now\(\) - interval '24 hours'/);
  assert.doesNotMatch(SQL, /\braw_text\b|\binput_text\b|\bsource_text\b/);
});
