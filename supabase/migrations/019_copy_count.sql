-- PHASE 1-B: itineraries.copy_count — 복사 수 집계
--
-- 변경 내용:
--   1. copy_count INTEGER NOT NULL DEFAULT 0 컬럼 추가
--   2. increment_copy_count RPC — service_role 전용 (copy.ts server-side 호출)
--      SECURITY DEFINER + SET search_path = public (injection 방지)
--      테이블 참조 public.itineraries 스키마 명시
--      PUBLIC·anon·authenticated EXECUTE 명시적 차단
--      service_role EXECUTE 명시적 부여
--
-- 기존 행: DEFAULT 0으로 자동 채워짐 (NOT NULL 보장)

ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS copy_count INTEGER NOT NULL DEFAULT 0;

-- ── 원자적 증가 RPC ───────────────────────────────────────────────────────────
-- SECURITY DEFINER: 함수 소유자(postgres) 권한으로 실행 → RLS 우회
-- SET search_path = public: search_path 주입 방지
-- public.itineraries: 스키마 명시로 search_path 변조 대응

CREATE OR REPLACE FUNCTION public.increment_copy_count(p_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.itineraries
  SET    copy_count = copy_count + 1
  WHERE  id = p_id;
$$;

-- ── 실행 권한: PUBLIC 기본 부여 차단 후 service_role만 허용 ─────────────────
-- Postgres는 함수 생성 시 EXECUTE를 PUBLIC에 자동 부여.
-- 이를 명시적으로 제거하지 않으면 anon·authenticated도 호출 가능.

REVOKE EXECUTE ON FUNCTION public.increment_copy_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_copy_count(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_copy_count(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_copy_count(UUID) TO   service_role;

-- ── 검증 쿼리 (적용 후 수동 실행) ───────────────────────────────────────────
-- 컬럼:
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'itineraries' AND column_name = 'copy_count';
-- → copy_count | integer | 0 | NO

-- 함수 권한:
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'increment_copy_count';
-- → service_role | EXECUTE (anon·authenticated·PUBLIC 없어야 함)

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.increment_copy_count(UUID);
-- ALTER TABLE public.itineraries DROP COLUMN IF EXISTS copy_count;
