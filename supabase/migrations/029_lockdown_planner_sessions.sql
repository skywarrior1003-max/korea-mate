-- ════════════════════════════════════════════════════════════════════════════
-- 029_lockdown_planner_sessions.sql
-- TASK-029-LOCKDOWN-PLANNER-SESSIONS — 미사용 legacy 테이블 직접 접근 전면 차단
--
-- 배경 (2026-07-26 운영 실측 + 코드 감사):
--   planner_sessions 에 public 대상 전면 개방 정책 4개가 존재한다.
--     "public read"   SELECT USING (true)
--     "public insert" INSERT WITH CHECK (true)
--     "public update" UPDATE USING (true)
--     "public delete" DELETE USING (true)
--   컬럼에 device_id(uuid) 와 scheduled(jsonb — 일정 내용)가 포함되어, 클라이언트
--   번들에 공개된 anon 키로 기기 ID 와 일정 내용을 읽고 수정·삭제할 수 있다.
--
-- 사용 계약: 없음 (TASK-029-PLANNER-SESSIONS-AUDIT).
--   src/lib/supabase.ts 에 upsertPlannerSession · fetchPlannerSession ·
--   fetchPlannersByDevice · deletePlannerSession 4개 함수가 정의되어 있으나
--   src/ · functions/ 어디에서도 호출되지 않는다(호출처 0건).
--   실제 플래너 상태는 src/lib/plannerStore.ts 의 localStorage
--   ("koreamate_planner_v1")로 관리된다. functions/ 참조도 없어 service_role
--   경로 역시 존재하지 않는다. → anon 권한 회수로 인한 기능 회귀 가능성이 없다.
--
-- 데이터: 3행(전부 device_id 보유, 최신 갱신 48일 전). TTL·정리 트리거 없음.
--   본 migration 은 DML 을 수행하지 않는다 — 3행을 조회·수정·삭제하지 않는다.
--   데이터 보존/삭제 여부는 개인정보 최소화 관점에서 별도 결정 사항으로 남긴다.
--
-- 적용 범위 (의도적으로 제한):
--   · restaurants / events / spots 는 별도 작업
--   · src/lib/supabase.ts 의 미사용 함수 정리는 별도 기술부채 작업
--   · FORCE ROW LEVEL SECURITY 는 사용하지 않는다
--
-- 멱등성: DROP POLICY IF EXISTS / REVOKE(없는 권한은 no-op) — 재실행 안전
-- 적용 금지: supabase db push 사용 금지 — Management API 또는 SQL Editor 직접 실행
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-07-26
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 개방 정책 제거 ─────────────────────────────────────────────────────────
-- 운영 실측 정책명 기준 (roles = public).
DROP POLICY IF EXISTS "public read"   ON public.planner_sessions;
DROP POLICY IF EXISTS "public insert" ON public.planner_sessions;
DROP POLICY IF EXISTS "public update" ON public.planner_sessions;
DROP POLICY IF EXISTS "public delete" ON public.planner_sessions;

-- ── 2. 테이블 레벨 권한 회수 ──────────────────────────────────────────────────
-- PUBLIC 포함 — 향후 생성되는 역할의 상속 차단.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.planner_sessions FROM anon, authenticated, PUBLIC;

-- ── 3. 컬럼 레벨 권한 회수 ────────────────────────────────────────────────────
-- 017 교훈: 테이블 REVOKE 후에도 컬럼 단위 권한이 남으면 해당 컬럼 직접 접근 가능
-- (예: REVOKE 테이블 SELECT 후에도 SELECT device_id FROM ... 가능).
REVOKE SELECT (
  id, num_days, start_date, arrival_times, scheduled, device_id, created_at, updated_at
) ON public.planner_sessions FROM anon, authenticated, PUBLIC;
REVOKE INSERT (
  id, num_days, start_date, arrival_times, scheduled, device_id, created_at, updated_at
) ON public.planner_sessions FROM anon, authenticated, PUBLIC;
REVOKE UPDATE (
  id, num_days, start_date, arrival_times, scheduled, device_id, created_at, updated_at
) ON public.planner_sessions FROM anon, authenticated, PUBLIC;
REVOKE REFERENCES (
  id, num_days, start_date, arrival_times, scheduled, device_id, created_at, updated_at
) ON public.planner_sessions FROM anon, authenticated, PUBLIC;

-- ── 4. service_role 권한 명시 보존 ────────────────────────────────────────────
-- 2단계의 PUBLIC REVOKE 로 상속 경로가 끊기는 경우를 대비한 멱등 GRANT.
-- 향후 서버 경유 복구 기능을 추가할 때 필요하다.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.planner_sessions TO service_role;

-- ── 5. RLS 활성 유지 ──────────────────────────────────────────────────────────
-- 이미 relrowsecurity = true. 멱등 재확인만 수행한다.
-- 정책 0개 + 권한 0 → 비-bypassrls 역할은 전면 차단, service_role 은 정상 동작.
ALTER TABLE public.planner_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 적용 전 조회 (롤백 원본 확보 — 반드시 먼저 실행하고 결과를 보관할 것)
--
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='planner_sessions';
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='planner_sessions' ORDER BY grantee;
--
-- SELECT count(*) FROM public.planner_sessions;   -- 적용 전후 3 유지 확인용
--
-- ── 적용 후 검증 ─────────────────────────────────────────────────────────────
-- ① 정책 0개 / anon·authenticated·PUBLIC 테이블·컬럼 권한 0행
-- ② service_role SELECT/INSERT/UPDATE/DELETE 전부 true
-- ③ 행수 3 유지 (본 migration 은 DML 을 수행하지 않음)
-- ④ anon REST 직접 접근이 200 이 아닐 것 (401/403 + 권한 오류 모두 정상)
-- ⑤ 사이트 주요 흐름: 플래너 입력 · 일정 생성 · 새로고침 후 상태 유지
--
-- ── 롤백 원칙 ────────────────────────────────────────────────────────────────
-- 취약 정책(USING true) 복원은 기본 롤백이 아니다.
--   1) service_role 권한·API 오류를 먼저 규명·수정한다
--   2) 그래도 막히면 실패한 동작에 필요한 최소 권한만 임시 부여한다
--   3) public 전체 공개 정책 복원은 최후 수단이며, 복원 시 device_id 소유권
--      가드를 포함한 대체 정책과 재잠금 기한을 함께 정한다
-- ════════════════════════════════════════════════════════════════════════════
