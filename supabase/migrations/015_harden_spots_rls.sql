-- [보안 긴급 조치] TASK-SEC-01-B1 — spots / spot_reactions RLS 강화
-- [작성일] 2026-07-20
-- [목적]
--   spots 테이블 anon 쓰기 권한 제거 — 기존 anon_all(FOR ALL) 정책 대체
--   spot_reactions anon DELETE 제거 — device_id ownership 가드 없이 전체 삭제 가능한 취약점 해소
-- [운영 영향]
--   - spots SELECT(읽기): anon 유지 → 기존 탐색/Explore 기능 영향 없음
--   - spots INSERT/UPDATE/DELETE: 완전 차단 → 이후 write는 service_role만 허용
--     (코드 경로: /api/admin/upsert-spots → supabase-admin.ts → service_role key)
--   - spot_reactions INSERT(dislike 제출): anon 유지 → 유저 신고 기능 영향 없음
--   - spot_reactions SELECT: anon 유지 → 관리자 신고 조회 영향 없음
--   - spot_reactions DELETE: anon 제거 → 브라우저에서 reaction 삭제 불가
--     (현재 "dislike 취소" 기능이 없으면 영향 없음)
-- [재실행 안전성]
--   DROP POLICY IF EXISTS → 없어도 오류 없음
--   CREATE POLICY existence check (DO $$ ... IF NOT EXISTS) → 중복 실행 안전
-- [주의] 실행 전 확인 필수:
--   1. TASK-SEC-01-B1 코드 변경 배포 완료 (bulkUpsertSpots → /api/admin/upsert-spots 전환)
--   2. spot_reactions DELETE가 필요한 "dislike 취소" 기능이 없는지 확인
--   3. 실행 후 Explore 페이지 동작 검증 (spots SELECT 유지 확인)
-- ============================================================

BEGIN;

-- ── spots 테이블 ────────────────────────────────────────────────

-- 1. 기존 anon 전체 허용 정책 제거
DROP POLICY IF EXISTS "anon_all" ON spots;

-- 2. anon SELECT 전용 정책 (Explore 탐색 기능 유지)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'spots'
      AND policyname = 'spots_anon_select'
  ) THEN
    CREATE POLICY "spots_anon_select"
      ON spots FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 3. authenticated 쓰기도 허용하지 않음
--    service_role은 RLS를 우회하므로 별도 정책 불필요
--    (INSERT/UPDATE/DELETE: anon ❌, authenticated ❌, service_role ✅)

-- ── spot_reactions 테이블 ──────────────────────────────────────

-- 4. anon DELETE 제거 (device_id ownership 없이 타인 reaction 삭제 가능)
DROP POLICY IF EXISTS "anon_delete_reactions" ON spot_reactions;

-- 5. anon_insert_reactions / anon_read_reactions 유지
--    (dislike 제출 + 관리자 신고 수 조회 기능 정상 동작 필요)

COMMIT;

-- ============================================================
-- 적용 후 확인 쿼리 (별도 실행)
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('spots', 'spot_reactions')
-- ORDER BY tablename, policyname;
-- ============================================================
