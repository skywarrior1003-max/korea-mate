-- ════════════════════════════════════════════════════════════════════════════
-- 030_shared_itinerary_copy_count.sql
-- TASK-SHARED-STORY-SOCIAL-PROOF — get_shared_itinerary 에 copy_count 추가
--
-- 목적:
--   Shared Story 에 복사 횟수를 읽기 전용 사회적 증거로 표시하기 위해
--   RPC 반환에 copy_count 를 추가한다. 공개 필드·조회 조건은 변경하지 않는다.
--   (copy_count 는 /api/trips/popular 에서 이미 공개 노출 중인 지표다)
--
-- 왜 DROP → CREATE 인가:
--   CREATE OR REPLACE FUNCTION 은 기존 함수의 반환 타입을 변경할 수 없다
--   (42P13 cannot change return type of existing function). RETURNS TABLE 에
--   컬럼을 추가하는 것은 반환 타입 변경이므로 DROP 후 재생성해야 한다.
--   PostgreSQL 은 DDL 이 트랜잭션 안전하므로, 아래 BEGIN…COMMIT 안에서는
--   커밋 전까지 다른 세션에 구버전이 그대로 보인다 → Shared Story·봇 OG 무중단.
--
-- ⚠ 재생성 시 반드시 복원해야 하는 것 (적용 전 운영 실측 기준):
--   owner          = postgres
--   SECURITY DEFINER = true
--   search_path    = ''            (빈 문자열 고정)
--   EXECUTE        = postgres, anon, authenticated, service_role
--   PUBLIC EXECUTE = false         ← PostgreSQL 은 함수 생성 시 PUBLIC 에
--                                    EXECUTE 를 기본 부여한다. 명시적으로
--                                    REVOKE 하지 않으면 보안이 후퇴한다.
--   volatility=VOLATILE · strict=false · parallel=UNSAFE · cost=100 · rows=1000
--   (모두 기본값이므로 아래 정의에서 별도 지정 없이 동일하게 재현된다)
--   오버로드 1개 · 의존 함수 0개 → DROP 대상 모호성 없음, CASCADE 불필요
--
-- 적용 금지: supabase db push 사용 금지 — Management API 또는 SQL Editor 직접 실행
-- migration history repair 금지
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-07-26
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 기존 함수 제거 (CASCADE 금지 — 의존 객체 0개 확인 완료) ────────────────
DROP FUNCTION IF EXISTS public.get_shared_itinerary(uuid);

-- ── 2. 재생성 — 기존 본문·조회 조건 그대로 + copy_count 만 추가 ───────────────
CREATE FUNCTION public.get_shared_itinerary(p_id uuid)
RETURNS TABLE(
  id            uuid,
  city          text,
  start_date    text,
  end_date      text,
  travelers     text,
  travel_style  text,
  days          jsonb,
  trip_title    text,
  updated_at    timestamp with time zone,
  view_count    integer,
  helpful_count integer,
  copy_count    integer          -- 신규: 복사 횟수 (고유 사용자 수 아님)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.city::text,
    i.start_date::text,
    i.end_date::text,
    i.travelers::text,
    i.travel_style::text,
    i.days::jsonb,
    i.trip_title::text,
    i.updated_at,
    i.view_count,
    i.helpful_count,
    i.copy_count
  FROM public.itineraries i
  WHERE i.id = p_id
    AND i.is_public = true
  LIMIT 1;
END;
$function$;

-- ── 3. 소유자 복원 ────────────────────────────────────────────────────────────
ALTER FUNCTION public.get_shared_itinerary(uuid) OWNER TO postgres;

-- ── 4. PUBLIC 기본 EXECUTE 즉시 회수 (재생성 시 자동 부여되므로 필수) ─────────
REVOKE EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) FROM PUBLIC;

-- ── 5. 기존 역할 EXECUTE 복원 ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 적용 전 조회 (롤백 원본 확보 — 반드시 먼저 실행하고 결과를 보관할 것)
--
-- SELECT pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner),
--        p.provolatile, p.proisstrict, p.proparallel, p.procost, p.prorows,
--        p.proconfig, p.proacl, obj_description(p.oid,'pg_proc'),
--        has_function_privilege('public', p.oid, 'EXECUTE')
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='get_shared_itinerary';
-- → 오버로드가 1개가 아니거나 속성이 위 주석과 다르면 적용하지 말 것.
--
-- ── 적용 후 검증 ─────────────────────────────────────────────────────────────
-- ① 위 조회 재실행 → owner/definer/config/volatility/strict/parallel/cost/rows
--    가 원본과 동일하고 반환 컬럼에 copy_count 만 추가됐을 것
-- ② has_function_privilege('public', …, 'EXECUTE') = false
-- ③ proacl 에 postgres·anon·authenticated·service_role 4개 존재
-- ④ anon 키로 RPC 호출 200 + copy_count 반환
-- ⑤ Shared Story 렌더 + 봇 UA 로 OG 태그 정상
--
-- ── 롤백 ─────────────────────────────────────────────────────────────────────
-- 보관한 original-def.sql 로 DROP → CREATE 후 4~5단계(REVOKE PUBLIC + GRANT)를
-- 동일하게 재적용한다. PUBLIC REVOKE 를 빠뜨리면 롤백이 곧 보안 후퇴가 된다.
-- ════════════════════════════════════════════════════════════════════════════
