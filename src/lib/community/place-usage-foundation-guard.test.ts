// PLACE-USAGE-FOUNDATION-V2 §L — 신호 분리·연도 키·월별 집계 계약 가드
// 실행: node --experimental-strip-types src/lib/community/place-usage-foundation-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { kstYear, usageKeyYearly, usageKeyYearlyInput } from "../social/social-actions-core.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

// ── §C-1 — 저장은 usage 가 아니다 ───────────────────────────────────────────

test("place-save — place_usage 를 생성하지 않는다", () => {
  const s = strip(read("functions/api/place-save.ts"));
  assert.ok(!s.includes("place_usage"), "save 경로에 usage 생성 잔존");
  assert.ok(s.includes("place_saves"), "saves 계약은 유지");
});

test("UI 신호 — save 신호는 usage API 를 부르지 않는다", () => {
  const s = strip(read("src/lib/social/signals.ts"));
  const saveFn = s.slice(s.indexOf("reportPlaceSaveSignal"), s.indexOf("reportPlaceTripAddSignal"));
  assert.ok(!saveFn.includes("place-usage"), "save 신호가 usage 를 호출");
  const tripFn = s.slice(s.indexOf("reportPlaceTripAddSignal"), s.indexOf("reportShareEvent"));
  assert.ok(tripFn.includes("/api/place-usage"), "trip_add 신호가 usage 를 호출해야 한다");
});

test("trip_add — cart 추가 성공 경로에서만 신호", () => {
  const s = read("src/lib/place-actions/place-actions-core.ts");
  const fn = s.slice(s.indexOf("export function addPlaceToThisTrip"), s.indexOf("export function", s.indexOf("export function addPlaceToThisTrip") + 10));
  const addIdx = fn.indexOf("addToCart(");
  const sigIdx = fn.indexOf("reportPlaceTripAddSignal(");
  assert.ok(addIdx > 0 && sigIdx > addIdx, "신호가 추가 성공(addToCart) 뒤에 있어야 한다");
  assert.ok(fn.indexOf("return false") < addIdx, "도시 미확정 실패 경로는 신호 이전에 반환");
});

// ── §E — 연도 키(서버 KST 전용·클라 지정 불가) ──────────────────────────────

test("연도 키 helper — 결정적·연도/장소 분리·64 hex", async () => {
  const a26 = await usageKeyYearly("11111111-2222-4333-8444-000000000001", "city_spot", "776", 2026);
  const a26b = await usageKeyYearly("11111111-2222-4333-8444-000000000001", "city_spot", "776", 2026);
  const a27 = await usageKeyYearly("11111111-2222-4333-8444-000000000001", "city_spot", "776", 2027);
  const b26 = await usageKeyYearly("11111111-2222-4333-8444-000000000002", "city_spot", "776", 2026);
  const other = await usageKeyYearly("11111111-2222-4333-8444-000000000001", "city_spot", "777", 2026);
  assert.equal(a26, a26b, "같은 입력 = 같은 키");
  assert.notEqual(a26, a27, "다른 연도 = 다른 키");
  assert.notEqual(a26, b26, "다른 기기 = 다른 키");
  assert.notEqual(a26, other, "다른 장소 = 다른 키");
  assert.match(a26, /^[0-9a-f]{64}$/);
  // canonicalization — 대문자 device 도 동일 키(기존 actorKeyInput 계약 승계)
  const upper = await usageKeyYearly("11111111-2222-4333-8444-000000000001".toUpperCase(), "city_spot", "776", 2026);
  assert.equal(upper, a26);
  assert.ok(usageKeyYearlyInput("d", "city_spot", "776", 2026).endsWith(":2026"), "연도 suffix");
});

test("kstYear — Asia/Seoul 경계(UTC 15:00 = KST 자정)", () => {
  // 2026-12-31 14:59 UTC = KST 23:59 → 2026 / 15:00 UTC = KST 2027-01-01 00:00 → 2027
  assert.equal(kstYear(Date.parse("2026-12-31T14:59:59Z")), 2026);
  assert.equal(kstYear(Date.parse("2026-12-31T15:00:00Z")), 2027);
});

test("usage API — 서버 연도만 사용·클라 year/hash 지정 불가·cause 고정", () => {
  const s = strip(read("functions/api/place-usage.ts"));
  assert.ok(s.includes("kstYear()"), "서버 현재 시각 KST 연도");
  assert.ok(s.includes("usageKeyYearly("), "연도 키 사용");
  assert.ok(!/body\.(usage_year|usage_key|actor|year|hash|first_cause)/.test(s), "클라 지정 필드 금지");
  assert.ok(s.includes('first_cause: "trip_add"'), "cause 는 서버 고정 trip_add");
  assert.ok(!s.includes('"save"'), "save cause 경로 없음");
  // 해시·기기값 로그 금지
  assert.ok(!/console\.(log|error)\([^)]*(ukey|deviceId|usage_key)/.test(s), "키·기기값 로그 금지");
});

// ── §E migration 073 — additive·legacy 안전 ────────────────────────────────

test("073 — usage_year additive·created_at 파생 백필·raw 복원 없음", () => {
  const sql = read("supabase/migrations/073_place_usage_annual_key.sql");
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS usage_year SMALLINT"));
  assert.ok(sql.includes("AT TIME ZONE 'Asia/Seoul'"), "백필은 KST 연도");
  assert.ok(sql.includes("SET NOT NULL"));
  assert.ok(/BETWEEN 2024 AND 2100/.test(sql), "연도 CHECK");
  assert.ok(sql.includes("idx_place_usage_target_year"), "조회 인덱스");
  assert.ok(!/DROP|DELETE FROM public\.place_usage/.test(sql), "기존 행 삭제 금지");
  assert.ok(!/device/i.test(sql.replace(/--.*$/gm, "")), "raw device 무관(주석 제외)");
});

// ── §F·§G migration 074 — 사용자 축 0·멱등·finalize 잠금 ────────────────────

test("074 — 집계 테이블에 사용자 축 컬럼이 없다", () => {
  const sql = read("supabase/migrations/074_place_usage_monthly.sql");
  const table = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf("ALTER TABLE public.place_usage_monthly ENABLE"));
  for (const banned of ["device", "actor", "usage_key", "user_id", "email", "liker", "saver"]) {
    assert.ok(!table.toLowerCase().includes(banned), `사용자 축 금지: ${banned}`);
  }
  assert.ok(table.includes("PRIMARY KEY (target_type, target_key, month_start)"));
  assert.ok(table.includes("usage_count >= 0"));
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("REVOKE ALL ON public.place_usage_monthly FROM anon, authenticated"));
});

test("074 함수 — SECURITY DEFINER·search_path 고정·service_role 전용", () => {
  const sql = read("supabase/migrations/074_place_usage_monthly.sql");
  assert.equal((sql.match(/SECURITY DEFINER/g) ?? []).length, 2, "집계 함수 2개");
  assert.equal((sql.match(/SET search_path = public/g) ?? []).length, 3, "search_path 고정(helper 포함)");
  assert.ok(/REVOKE ALL ON FUNCTION public\.place_usage_monthly_refresh_open\(\) FROM PUBLIC, anon, authenticated/.test(sql));
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.place_usage_monthly_finalize\(DATE\) TO service_role/.test(sql));
});

test("074 — open 멱등(재계산 UPSERT)·finalized 잠금·현재/미래 finalize 거부", () => {
  const sql = read("supabase/migrations/074_place_usage_monthly.sql");
  assert.ok(!/usage_count\s*\+\s*1|usage_count\s*=\s*m\.usage_count\s*\+/.test(sql), "수동 증감 금지 — 전체 재계산만");
  assert.equal((sql.match(/WHERE m\.status = 'open'/g) ?? []).length, 2, "UPSERT 가 finalized 를 덮지 않음(양 함수)");
  assert.ok(sql.includes("'month_not_ended'"), "현재·미래 월 finalize 거부");
  assert.ok(sql.includes("'already_finalized'"), "재확정 일반 경로 거부");
});

// ── §H·§I — scheduler 없음·기존 순위 무변경 ─────────────────────────────────

test("scheduler/삭제 — 이번 단계에 없음", () => {
  const sql073 = read("supabase/migrations/073_place_usage_annual_key.sql");
  const sql074 = read("supabase/migrations/074_place_usage_monthly.sql");
  for (const s of [sql073, sql074]) {
    assert.ok(!/pg_cron|cron\.schedule/i.test(s), "cron 등록 금지");
    assert.ok(!/DELETE FROM public\.place_usage\b/.test(s), "원본 삭제 함수 금지");
  }
});

test("현재 순위 RPC 원문 무변경 — 071 은 여전히 raw place_usage 를 읽는다", () => {
  const sql071 = read("supabase/migrations/071_community_ranking_rpcs.sql");
  assert.ok(sql071.includes("FROM public.place_usage"), "071 원천은 raw(다음 TASK 에서 전환)");
  assert.ok(!sql071.includes("place_usage_monthly"), "071 은 이번에 손대지 않았다");
});

test("073 — 배포 호환 DEFAULT·재적용 안전 (COMPAT-CHECK §D)", () => {
  const sql = read("supabase/migrations/073_place_usage_annual_key.sql");
  // migration 이 코드보다 먼저 가도 구버전 INSERT 가 죽지 않는다 — KST 명시 DEFAULT
  assert.ok(/SET DEFAULT \(EXTRACT\(YEAR FROM \(now\(\) AT TIME ZONE 'Asia\/Seoul'\)\)::smallint\)/.test(sql),
    "usage_year KST DEFAULT 가 없다 — 무중단 배포 구간에서 usage 조용한 유실");
  // 재적용 안전 — CHECK 제약은 존재 검사 후 추가
  assert.ok(sql.includes("IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_usage_year_chk')"),
    "073 재적용 안전(constraint 존재 검사)이 없다");
  assert.ok(sql.includes("SET NOT NULL"), "NOT NULL 유지");
});

test("075 — refresh_open 은 정확 스냅숏(zero-row 정합·잠금·finalized 보호)", () => {
  const sql = read("supabase/migrations/075_place_usage_monthly_refresh_exact.sql");
  assert.ok(sql.includes("pg_advisory_xact_lock"), "동시 실행 직렬화");
  // 삭제→재삽입 순서(N→0 target 의 stale 행 제거) + finalized 제외
  const delIdx = sql.indexOf("DELETE FROM public.place_usage_monthly");
  const insIdx = sql.indexOf("INSERT INTO public.place_usage_monthly");
  assert.ok(delIdx > 0 && delIdx < insIdx, "open 스냅숏 삭제가 재삽입보다 앞");
  assert.ok(/status = 'open'/.test(sql.slice(delIdx, insIdx)), "삭제는 open 만 — finalized 불가침");
  assert.ok(sql.includes("ON CONFLICT (target_type, target_key, month_start) DO NOTHING"), "경합·finalized 충돌 흡수");
  assert.ok(!/usage_count\s*[+\-]/.test(sql.replace(/^\s*--.*$/gm, "")), "수동 증감 금지(주석 제외)");
  assert.ok(sql.includes("SECURITY DEFINER") && sql.includes("SET search_path = public"), "정의자·search_path");
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.place_usage_monthly_refresh_open\(\) TO service_role/.test(sql), "service_role 전용");
});

test("076 — 자동 운영 계약(catch-up·1트랜잭션·스케줄 멱등·이력 90일)", () => {
  const sql = read("supabase/migrations/076_place_usage_monthly_automation.sql");
  assert.ok(sql.includes("CREATE EXTENSION IF NOT EXISTS pg_cron"), "pg_cron 재적용 안전 설치");
  // catch-up: open 과거 월 ∪ raw 에만 있는 과거 월
  assert.ok(sql.includes("UNION"), "누락 월 복구 집합(UNION)이 없다");
  assert.ok(/status = 'open' AND month_start < v_current/.test(sql), "open 과거 월");
  assert.ok(/f\.status = 'finalized'\)/.test(sql), "finalized 월 제외");
  // 1 트랜잭션 — finalize 실패 시 RAISE 로 전체 롤백
  assert.ok(sql.includes("RAISE EXCEPTION 'place_usage_monthly_maintenance: finalize"), "부분 확정 금지 롤백");
  assert.ok(sql.includes("pg_advisory_xact_lock(hashtext('place_usage_monthly_maintenance'))"), "상위 maintenance lock");
  // 스케줄: UTC 식(KST 03:17·일 03:47)·고정 이름·멱등(동일 skip·상이 교체)
  assert.ok(sql.includes("'17 18 * * *'") && sql.includes("'47 18 * * 6'"), "UTC cron 식");
  assert.ok(sql.includes("gokoreamate-place-usage-monthly-maintenance-v1") &&
            sql.includes("gokoreamate-cron-history-retention-90d-v1"), "고정 job 이름");
  assert.ok(sql.includes("cron.unschedule(v_id)"), "정의 상이 시 교체");
  // 이력 정리: 종료된 90일 초과만·job 정의 무접촉
  assert.ok(sql.includes("end_time IS NOT NULL") && sql.includes("interval '90 days'"), "90일·실행중 보존");
  assert.ok(!/DELETE FROM cron\.job\b/.test(sql), "job 정의 삭제 금지");
  // 보안: 권한 회수·secret/HTTP 0
  assert.ok(/REVOKE ALL ON FUNCTION public\.place_usage_monthly_maintenance\(\) FROM PUBLIC, anon, authenticated/.test(sql));
  assert.equal((sql.match(/SECURITY DEFINER/g) ?? []).length, 2);
  assert.equal((sql.match(/SET search_path = public/g) ?? []).length, 2);
  assert.ok(!/http|api\.|vault|secret/i.test(sql.replace(/--.*$/gm, "")), "외부 호출·secret 0");
});
