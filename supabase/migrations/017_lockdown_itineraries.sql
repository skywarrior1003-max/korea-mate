-- ════════════════════════════════════════════════════════════════════════════
-- 017_lockdown_itineraries.sql
-- TASK-SEC-02-EMERGENCY-B — 무중단 Lockdown 2단계: 전면 차단
--
-- ⛔ COMMIT 분리 경고 — 이 파일을 016과 같은 commit에 절대 포함하지 않는다 ⛔
--
-- 정확한 운영 적용 12단계:
--
--   [1차 commit 준비]
--   1. 016_create_shared_itinerary_rpc.sql + 코드 3개를 첫 번째 commit으로 준비
--      대상: 016_*.sql / src/lib/supabase.ts / src/app/shared/page.tsx
--            functions/shared/[id].ts
--   2. 017_lockdown_itineraries.sql은 첫 번째 commit에 절대 포함하지 않음
--      · git add . 및 git add -A 사용 금지
--      · git diff --cached --name-only 결과에 017이 나타나면 즉시 중단
--
--   [016 DB 적용 및 검증]
--   3. 016_create_shared_itinerary_rpc.sql만 운영 DB SQL Editor에서 실행
--      (코드 배포 전에 get_shared_itinerary RPC가 운영 DB에 존재해야 한다)
--   4. 016 RPC 권한·함수 정의를 아래 읽기 전용 SQL로 검증 후 통과 확인
--
--   [코드 배포 및 1차 QA]
--   5. 첫 번째 commit을 push
--   6. Cloudflare 코드 배포 완료 확인
--   7. /shared/{uuid} 공유 페이지 운영 QA 통과
--   8. Bot OG 응답 운영 QA 통과
--
--   [2차 commit 및 017 적용]
--   9. 7·8 QA가 모두 통과한 뒤에만 017을 별도 두 번째 commit으로 준비
--  10. 017_lockdown_itineraries.sql을 운영 DB SQL Editor에서 실행
--  11. 정책·테이블 권한·컬럼 권한을 파일 하단 검증 SQL로 확인
--  12. Phase 2 저장 기능 복구 작업 시작
--
--   이 파일은 단계 9 이전까지 로컬 초안으로만 보관한다.
--
-- 적용 순서: 2/2
-- ⚠️  전제 조건 (모두 충족 후 실행):
--   1. 016 실행 완료
--   2. 코드 배포 완료 (fetchSharedItinerary + Bot OG RPC 전환)
--   3. /shared/{uuid} 공유 뷰 운영 QA 통과
--   4. Bot OG 크롤러 응답 QA 통과
--   이 순서를 지키지 않으면 공유 뷰가 동작을 멈출 수 있음
--
-- 이 파일은 실제 일정 데이터를 INSERT/UPDATE/DELETE하지 않는다.
-- DDL(권한 변경)만 포함한다.
-- BEGIN...COMMIT 트랜잭션: 중간 오류 시 전체 자동 rollback.
--
-- Lockdown 후 중단 기능:
--   · 신규 일정 생성 (INSERT 차단)
--   · 기존 일정 자동저장 (UPDATE 차단)
--   · 일정 제목 수정 (UPDATE 차단)
--   · 일정 삭제 (DELETE 차단)
--   · My Trips 목록 (SELECT 차단)
--   · Popular Trips 피드 (SELECT 차단)
--   · save-email의 itineraries UPDATE (UPDATE 차단)
--
-- 정상 유지 기능 (016 RPC + SECURITY DEFINER 보호):
--   · /shared/{uuid} 공유 뷰 (get_shared_itinerary RPC)
--   · Bot OG 메타데이터 (get_shared_itinerary RPC)
--   · view_count 증가 (increment_trip_view SECURITY DEFINER)
--   · helpful_count 증가 (increment_trip_helpful SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── STEP 1: 모든 RLS 정책 제거 ───────────────────────────────────────────────
-- SQL-2 결과 정책명 (공백·대소문자 정확히 일치)
DROP POLICY IF EXISTS "public read"   ON public.itineraries;
DROP POLICY IF EXISTS "public insert" ON public.itineraries;
DROP POLICY IF EXISTS "public update" ON public.itineraries;
DROP POLICY IF EXISTS "public delete" ON public.itineraries;

-- ── STEP 2: 테이블 레벨 권한 전면 회수 ──────────────────────────────────────
-- anon/authenticated 모두 대상
-- REFERENCES: 외래 키 제약 생성 권한 / TRIGGER: 트리거 생성 권한 — 애플리케이션 불필요
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.itineraries
  FROM anon, authenticated;

-- ── STEP 3: 컬럼 레벨 권한 전체 회수 (14개 컬럼) ────────────────────────────
-- 테이블 레벨 REVOKE 후에도 컬럼 레벨 권한이 남으면 해당 컬럼은 직접 접근 가능
-- (예: anon이 device_id 컬럼 레벨 SELECT를 보유하면
--      REVOKE 테이블 SELECT 후에도 SELECT device_id FROM itineraries 가능)
--
-- PostgreSQL 컬럼 레벨 지원 권한: SELECT / INSERT / UPDATE / REFERENCES
-- (DELETE, TRUNCATE, TRIGGER는 컬럼 레벨 없음)
-- 각 REVOKE가 이미 없는 권한을 대상으로 해도 에러 없이 no-op 처리됨

-- SELECT 회수 (14개 컬럼)
REVOKE SELECT (
  id, city, start_date, end_date, travelers, travel_style,
  days, created_at, updated_at, device_id, trip_title,
  view_count, helpful_count, email
) ON public.itineraries FROM anon, authenticated;

-- INSERT 회수 (14개 컬럼)
REVOKE INSERT (
  id, city, start_date, end_date, travelers, travel_style,
  days, created_at, updated_at, device_id, trip_title,
  view_count, helpful_count, email
) ON public.itineraries FROM anon, authenticated;

-- UPDATE 회수 (14개 컬럼)
REVOKE UPDATE (
  id, city, start_date, end_date, travelers, travel_style,
  days, created_at, updated_at, device_id, trip_title,
  view_count, helpful_count, email
) ON public.itineraries FROM anon, authenticated;

-- REFERENCES 회수 (14개 컬럼)
REVOKE REFERENCES (
  id, city, start_date, end_date, travelers, travel_style,
  days, created_at, updated_at, device_id, trip_title,
  view_count, helpful_count, email
) ON public.itineraries FROM anon, authenticated;

-- ── STEP 4: increment_* RPC 강화 ─────────────────────────────────────────────
-- 시그니처 확정 (migration 009/010 기준):
--   · public.increment_trip_view(trip_id_param UUID)
--   · public.increment_trip_helpful(trip_id_param UUID)
--
-- ⚠️ search_path = '' 미적용 사유:
--   두 함수 본문이 'UPDATE itineraries' (스키마 비수식)를 사용함.
--   search_path = '' 설정 시 런타임에서 'itineraries' 미발견 → 함수 실패.
--   Phase 2에서 본문을 'UPDATE public.itineraries' 로 수정 후 재적용.
--   현재: 호환 가능한 최소 수준인 search_path = public 적용 (현재보다 안전).
--
-- 기존 함수 본문 재생성 없이 ALTER FUNCTION 으로 설정만 변경.
ALTER FUNCTION public.increment_trip_view(UUID)    SET search_path = public;
ALTER FUNCTION public.increment_trip_helpful(UUID) SET search_path = public;

-- 기존 migration 009/010이 REVOKE FROM PUBLIC 없이 GRANT TO anon 만 실행했으므로
-- CREATE FUNCTION 기본값인 PUBLIC EXECUTE 가 잔존 → 명시 회수
REVOKE EXECUTE ON FUNCTION public.increment_trip_view(UUID)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_trip_helpful(UUID) FROM PUBLIC;

-- anon / authenticated EXECUTE 유지
GRANT  EXECUTE ON FUNCTION public.increment_trip_view(UUID)    TO anon;
GRANT  EXECUTE ON FUNCTION public.increment_trip_view(UUID)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_trip_helpful(UUID) TO anon;
GRANT  EXECUTE ON FUNCTION public.increment_trip_helpful(UUID) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 017 실행 후 검증 SQL (읽기 전용, SQL Editor에서 실행)
--
-- ① 정책 확인 — 0행이 나와야 함
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'itineraries'
--   AND policyname IN ('public read','public insert','public update','public delete');
--
-- ② 테이블 레벨 권한 확인 — anon/authenticated 행 없어야 함
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'itineraries'
--   AND grantee IN ('anon','authenticated');
--
-- ③ 컬럼 레벨 권한 확인 — device_id/email 행 없어야 함
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_name = 'itineraries'
--   AND grantee IN ('anon','authenticated')
--   AND column_name IN ('device_id','email','days');
--
-- ④ 공유 RPC 정상 확인 (UUID는 실제 존재 행 ID로 대체)
-- SELECT * FROM public.get_shared_itinerary('00000000-0000-0000-0000-000000000000'::uuid);
-- → 빈 결과 또는 결과에 device_id/email 컬럼 없음 확인
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- 롤백 방침
--
-- ⛔ USING(true) 정책 복원 rollback SQL 을 제공하지 않는다.
--    (복원 = Critical 취약점 재오픈)
--
-- 적용 중 오류: BEGIN/COMMIT 트랜잭션이 전체 자동 rollback — DB는 이전 상태 유지.
--
-- 적용 후 기능 장애: 취약 정책 복원이 아닌 SECURITY DEFINER RPC 추가로 복구.
--   Phase 2 항목 참조.
-- ════════════════════════════════════════════════════════════════════════════
