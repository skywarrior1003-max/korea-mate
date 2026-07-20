-- ════════════════════════════════════════════════════════════════════════════
-- 016_create_shared_itinerary_rpc.sql
-- TASK-SEC-02-EMERGENCY-B — 무중단 Lockdown 1단계: RPC 선생성
--
-- 적용 순서: 1/2 (017 이전 반드시 먼저 실행)
-- 운영 적용 전제: 기존 정책/GRANT는 이 파일에서 변경하지 않음
--
-- 이 파일의 역할:
--   1. get_shared_itinerary(uuid) RPC 생성
--   2. 코드 배포 후 /shared/{uuid} 와 Bot OG 가 RPC를 통해 동작하도록 준비
--   3. 017(Lockdown) 적용 전에 코드 + RPC가 모두 준비된 상태를 만드는 것이 목적
--
-- 017 적용 전제 조건:
--   - 016 실행 완료
--   - 코드 배포 완료 (fetchSharedItinerary RPC 호출 코드 + Bot OG RPC 전환)
--   - /shared/{uuid} 공유 뷰 운영 QA 통과
--   - Bot OG 크롤러 응답 QA 통과
--
-- 이 파일은 itineraries 테이블의 정책/GRANT를 건드리지 않는다.
-- 기존 public read/insert/update/delete 정책은 017에서 제거한다.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 공유 조회 안전 RPC ───────────────────────────────────────────────────────
-- 보안 설계:
--   · SECURITY DEFINER: 함수 소유자 권한으로 실행 — anon이 직접 SELECT 불필요
--   · SET search_path = '': 완전 빈 경로로 스키마 인젝션 최고 수준 방어
--     (pg_catalog는 암묵적으로 항상 검색 → ::text, ::jsonb 등 타입 캐스트 사용 가능)
--   · FROM public.itineraries: 스키마 완전 수식 필수 (search_path='' 요건)
--   · UUID 1개 입력 → 최대 1행 반환 (LIMIT 1) → 전체 목록 조회 불가
--   · 반환 컬럼에서 device_id / email / created_at 제외
CREATE OR REPLACE FUNCTION public.get_shared_itinerary(p_id uuid)
RETURNS TABLE (
  id            uuid,
  city          text,
  start_date    text,
  end_date      text,
  travelers     text,
  travel_style  text,
  days          jsonb,
  trip_title    text,
  updated_at    timestamptz,
  view_count    integer,
  helpful_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- NULL 방어: PostgREST가 빈 body 전송 시 p_id IS NULL 가능
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.city::text,
    i.start_date::text,    -- DATE 또는 TEXT 컬럼 모두 호환
    i.end_date::text,
    i.travelers::text,
    i.travel_style::text,
    i.days::jsonb,         -- JSON 또는 JSONB 컬럼 모두 호환
    i.trip_title::text,
    i.updated_at,
    i.view_count,
    i.helpful_count
  FROM public.itineraries i   -- search_path='' 이므로 스키마 완전 수식 필수
  WHERE i.id = p_id
  LIMIT 1;
END;
$$;

-- CREATE FUNCTION 직후 PostgreSQL이 PUBLIC에 EXECUTE를 기본 부여하므로 즉시 회수
REVOKE ALL     ON FUNCTION public.get_shared_itinerary(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO anon;
GRANT  EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 016 실행 후 즉시 확인 SQL (읽기 전용, SQL Editor에서 실행)
--
-- SELECT routine_name, security_type, external_language
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name   = 'get_shared_itinerary';
-- → security_type: DEFINER 확인
--
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'get_shared_itinerary'
--   AND routine_schema = 'public';
-- → PUBLIC: 없음, anon: EXECUTE, authenticated: EXECUTE 확인
-- ════════════════════════════════════════════════════════════════════════════
