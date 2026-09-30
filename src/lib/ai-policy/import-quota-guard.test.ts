// 무료 AI 사용권 원장 계약 가드 (EXTERNAL-IMPORT-V2 → 정책 교정 → 재정정 2026-09-30)
// 기준: 2026-09-25 Owner 작업 지시 — 일정 만들기 월 1(가져오기·AI 일정 공유, 신규 회원 최초 1회 추가),
// 전체 여행 AI 글쓰기 월 2(My Trip·Story 공유, 3문체 한 요청 = 1회). 086(30일 통합 1회)은 087 이 대체한다.
// 실행: node --experimental-strip-types --test src/lib/ai-policy/import-quota-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FREE_MONTHLY } from "./usage-policy.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const M087 = read("supabase", "migrations", "087_ai_user_usage_monthly_plan_writing.sql");
const ANALYZE = read("functions", "api", "import", "analyze.ts");
const PERSONALIZE = read("functions", "api", "trip", "personalize.ts");
const WRITING = read("functions", "api", "mytrip", "writing.ts");
const FULL = read("functions", "api", "mytrip", "writing-full.ts");
const LEGACY = read("functions", "api", "generate-itinerary.ts");

test("087 — 일정 만들기 월 1 + 최초 보너스 1(가져오기·AI 일정 공유) · 글쓰기 월 2 (정책 상수와 일치)", () => {
  const fn = M087.slice(M087.indexOf("CREATE OR REPLACE FUNCTION public.ai_user_reserve"));
  assert.match(fn, /v_pool\s+:= CASE WHEN p_feature = 'writing' THEN 'writing' ELSE 'plan' END;/, "가져오기·개인화 = plan 공유");
  assert.match(fn, /v_limit := CASE WHEN v_pool = 'writing' THEN 2 ELSE 1 END;/);
  assert.equal(FREE_MONTHLY.plan.monthly, 1);
  assert.equal(FREE_MONTHLY.writing.monthly, 2);
  // 최초 보너스는 plan 에만, 계정당 1회(period 'welcome' 확정 행이 있으면 다시 주지 않는다)
  assert.match(fn, /ELSIF v_pool = 'plan' AND NOT EXISTS \(\s+SELECT 1 FROM public\.ai_user_usage\s+WHERE user_id = p_user AND pool = 'plan' AND period = 'welcome' AND status = 'committed'\)/);
  assert.doesNotMatch(fn, /ai_user_free_window|interval '30 days'/, "30일 통합 1회를 다시 쓰지 않는다");
  // '월'은 084 의 ai_user_period_now() 한 곳 — 원문에 없는 기준을 새로 만들지 않는다
  assert.match(fn, /v_month\s+text := public\.ai_user_period_now\(\);/);
  // 같은 사용권의 다른 요청이 처리 중이면 두 번째를 부르지 않는다
  assert.match(fn, /pool = v_pool AND status = 'reserved' AND idem_key <> p_idem\) THEN\s+RETURN jsonb_build_object\('status','in_progress'\)/);
});

test("모든 비용 AI 경로가 같은 원장을 쓴다 — 자리표시 없음", () => {
  for (const [name, src] of [["analyze", ANALYZE], ["personalize", PERSONALIZE], ["writing-full", FULL], ["legacy", LEGACY]] as const) {
    assert.match(src, /quotaReserve\(/, `${name}: 원장 예약 없음`);
    assert.doesNotMatch(src, /checkUserEntitlementPlaceholder\(/, `${name}: 자리표시가 남아 있다`);
  }
  assert.match(PERSONALIZE, /quotaReserve\(qEnv, auth\.userId, "personalize"/);
  assert.match(LEGACY, /quotaReserve\(qEnv, userAuth\.userId, "personalize"/, "레거시 AI 일정 = 일정 만들기 사용권");
  assert.match(FULL, /quotaReserve\(qEnv, auth\.userId, "writing"/, "전체 여행 글쓰기 = 글쓰기 사용권");
});

test("개별 글쓰기(제목·기록·표지)는 사용권 예약 전에 닫혀 있다 — 사진마다 추가 요청 없음", () => {
  assert.match(WRITING, /RETIRED_TARGETS: ReadonlySet<string> = new Set\(\["title", "memo", "moment", "moment3", "storyHero"\]\)/);
  const post = WRITING.slice(WRITING.indexOf("export async function onRequestPost"));
  assert.ok(post.indexOf("RETIRED_TARGETS.has(body.target)") > 0);
  assert.ok(post.indexOf("RETIRED_TARGETS.has(body.target)") < post.indexOf("quotaReserve("), "닫힘이 예약보다 앞");
});

test("분석 순서 — 로그인 → 사용권 예약 → 외부 fetch → 회사 게이트 → provider", () => {
  const body = ANALYZE.slice(ANALYZE.indexOf("export async function onRequestPost"));
  const idx = ["requireActiveUser(", "quotaReserve(", "safeFetchPage(", "aiOpsReserve(", "analyzeWithAi("].map(k => body.indexOf(k));
  assert.ok(idx.every((v, i) => v > 0 && (i === 0 || v > idx[i - 1]!)), JSON.stringify(idx));
});

test("전체 여행 글쓰기 — 재열람·같은 내용은 원장 밖, 성공만 확정, 실패는 되돌림", () => {
  const post = FULL.slice(FULL.indexOf("export async function onRequestPost"));
  assert.ok(post.indexOf('mode === "load"') < post.indexOf("quotaReserve("), "load 는 예약 전에 반환");
  assert.ok(post.indexOf('ai_status: "cache_server"') < post.indexOf("quotaReserve("), "같은 내용 저장 결과는 예약 전에 반환");
  assert.match(FULL, /quotaSettle\(qEnv, quota\.id, auth\.userId, "committed"/);
  assert.match(FULL, /const release = \(\) => quotaSettle\(qEnv, quota\.id, auth\.userId, "released"\)/);
  assert.doesNotMatch(FULL, /inlineData|image\/jpeg/, "사진 이미지를 보내지 않는다");
});

test("차감은 완성 결과에만 — 실패·무효는 해제", () => {
  assert.match(ANALYZE, /quotaSettle\(qEnv, quotaId, userId, "released"\)/);
  assert.match(ANALYZE, /quotaSettle\(qEnv, quotaId, userId, "committed", \{ analysis: a, pageTitle, url \}\)/);
  assert.match(PERSONALIZE, /profile \? "committed" : "released"/);
  assert.match(ANALYZE, /if \(q\.status === "unavailable"\) return fail\("quota_unavailable"\)/, "셀 수 없으면 부르지 않는다");
});

test("원문은 원장에 저장하지 않는다 — 재응답용 결과만, 24시간 뒤 비운다", () => {
  assert.match(M087, /result = NULL\s+WHERE user_id = p_user AND result IS NOT NULL AND settled_at < now\(\) - interval '24 hours'/);
  assert.doesNotMatch(M087, /\braw_text\b|\binput_text\b|\bsource_text\b/);
});
