-- ════════════════════════════════════════════════════════════════════════════
-- 028_lockdown_spot_reactions_writes.sql
-- TASK-028-LOCKDOWN-SPOT-REACTIONS — 익명 수정·삭제 위험만 제거
--
-- 배경 (2026-07-26 운영 실측):
--   spot_reactions 에 정책 3개가 존재한다.
--     "anon_read_reactions"   SELECT USING (true)        ← 앱이 사용 (유지)
--     "anon_insert_reactions" INSERT WITH CHECK (true)   ← 앱이 사용 (유지)
--     "anon_delete_reactions" DELETE USING (true)        ← 제거 대상
--   DELETE 정책은 device_id 소유권 가드가 없어, 클라이언트 번들에 공개된 anon 키로
--   타인의 반응을 임의 삭제할 수 있다. 또한 anon/authenticated 에 UPDATE 권한이
--   남아 있어 reaction 값 위변조가 가능하다.
--
--   src/app/api/admin/migrate/route.ts 에도 "anon DELETE는 허용하지 않음 —
--   device_id ownership 가드 없이 타인 reaction 삭제 가능" 주석과 함께
--   DROP POLICY 문이 있으나, 운영 DB 에는 해당 정책이 실제로 존재한다.
--   코드가 의도한 상태와 운영 상태가 어긋나 있어 이를 일치시킨다.
--
-- 앱 사용 계약 (src/lib/spots.ts, anon 클라이언트):
--   dislikeSpot()      → INSERT  (유지 필요)
--   fetchFlaggedSpots() → SELECT (유지 필요)
--   DELETE 호출 없음 — 반응 취소 기능이 존재하지 않으므로 DELETE 제거 시 회귀 없음
--   (관리자 삭제는 src/app/api/admin/delete-spot/route.ts 가 service_role 로 수행)
--
-- 적용 범위 (의도적으로 제한):
--   · SELECT·INSERT 정책과 권한은 그대로 둔다
--   · 기존 9행은 수정·삭제하지 않는다 (DML 없음)
--   · restaurants / events / spots / planner_sessions 는 별도 작업
--   · FORCE ROW LEVEL SECURITY 는 사용하지 않는다
--
-- 멱등성: DROP POLICY IF EXISTS / REVOKE(없는 권한은 no-op) — 재실행 안전
-- 적용 금지: supabase db push 사용 금지 — Management API 또는 SQL Editor 직접 실행
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-07-26
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 익명 DELETE 정책 제거 ──────────────────────────────────────────────────
-- 운영 실측 정책명 기준. SELECT·INSERT 정책은 건드리지 않는다.
DROP POLICY IF EXISTS "anon_delete_reactions" ON public.spot_reactions;

-- ── 2. 쓰기성 테이블 권한 회수 (SELECT·INSERT 는 제외) ────────────────────────
-- PUBLIC 포함 — 향후 생성되는 역할의 상속 차단.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.spot_reactions FROM anon, authenticated, PUBLIC;

-- ── 3. 컬럼 레벨 쓰기 권한 회수 ───────────────────────────────────────────────
-- 017 교훈: 테이블 REVOKE 후에도 컬럼 단위 권한이 남으면 해당 컬럼 직접 접근 가능.
-- INSERT 컬럼 권한은 앱이 사용하므로 회수하지 않는다.
REVOKE UPDATE     (id, place_id, reaction, device_id, created_at)
  ON public.spot_reactions FROM anon, authenticated, PUBLIC;
REVOKE REFERENCES (id, place_id, reaction, device_id, created_at)
  ON public.spot_reactions FROM anon, authenticated, PUBLIC;

-- ── 4. service_role 권한 명시 보존 ────────────────────────────────────────────
-- 2단계의 PUBLIC REVOKE 로 상속 경로가 끊기는 경우를 대비한 멱등 GRANT.
-- 관리자 삭제 경로(delete-spot route, service_role)가 계속 동작해야 한다.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.spot_reactions TO service_role;

-- ── 5. RLS 활성 유지 ──────────────────────────────────────────────────────────
-- 이미 relrowsecurity = true. 멱등 재확인만 수행한다.
-- 남은 정책: anon_read_reactions(SELECT) · anon_insert_reactions(INSERT)
ALTER TABLE public.spot_reactions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 적용 전 조회 (롤백 원본 확보 — 반드시 먼저 실행하고 결과를 보관할 것)
--
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='spot_reactions';
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='spot_reactions' ORDER BY grantee;
--
-- ── 적용 후 검증 ─────────────────────────────────────────────────────────────
-- ① 정책 2개만 남을 것 (anon_read_reactions, anon_insert_reactions)
-- ② anon/authenticated 권한이 SELECT, INSERT 만 남을 것
-- ③ anon REST 동작:
--      GET  ...?select=place_id&limit=1        → 200 (유지)
--      POST (신규 reaction)                     → 201 (유지)
--      PATCH / DELETE                           → 200 이 아닐 것 (차단)
-- ④ 기존 9행이 그대로일 것 (본 migration 은 DML 을 수행하지 않음)
--
-- ── 롤백 원칙 ────────────────────────────────────────────────────────────────
-- "anon_delete_reactions" 복원은 취약점을 다시 여는 것이므로 기본 롤백이 아니다.
--   1) service_role 경로·API 오류를 먼저 규명·수정한다
--   2) 그래도 막히면 실패한 동작에 필요한 최소 권한만 임시 부여한다
--   3) 익명 DELETE 정책 복원은 최후 수단이며, 복원 시 device_id 소유권 가드를
--      포함한 대체 정책과 재잠금 기한을 함께 정한다
-- ════════════════════════════════════════════════════════════════════════════
