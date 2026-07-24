-- ════════════════════════════════════════════════════════════════════════════
-- 026_trip_moments_photo.sql
-- TASK-PHOTO-DB-026 — trip_moments 사진 컬럼 추가
--
-- 목적:
--   My Memory 사진 저장 아키텍처(PHASE-PHOTO-01) 지원을 위해
--   trip_moments 테이블에 3개 컬럼과 2개 부분 인덱스를 추가한다.
--
-- 운영 trip_moments 현재 컬럼 (CF Function 코드 확인 기준):
--   moment_id, itinerary_id, device_id, memo, category,
--   lat, lng, location_label, captured_at, day_number
--
-- 이 migration이 추가하는 것:
--   · is_public   BOOLEAN NOT NULL DEFAULT false
--   · storage_path TEXT
--   · city_spot_id BIGINT → public.city_spots(id)
--   · 인덱스 2개 (부분 인덱스)
--
-- 멱등성: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS 사용
-- 기존 데이터 영향:
--   · is_public  = false (DEFAULT 자동 적용)
--   · storage_path = NULL
--   · city_spot_id = NULL
--   기존 rows 별도 UPDATE 불필요
--
-- 적용 금지: supabase db push 사용 금지 — Supabase SQL Editor에서 직접 실행
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-07-24
-- Task  : TASK-PHOTO-DB-026
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 컬럼 추가 ──────────────────────────────────────────────────────────────

ALTER TABLE public.trip_moments
  ADD COLUMN IF NOT EXISTS is_public    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS city_spot_id BIGINT
    REFERENCES public.city_spots(id) ON DELETE SET NULL;

-- ── 2. 인덱스 ─────────────────────────────────────────────────────────────────

-- 공개 moments 조회 최적화: is_public = true인 행만 포함 (공개 여행 스토리 피드)
CREATE INDEX IF NOT EXISTS idx_trip_moments_itinerary_public
  ON public.trip_moments (itinerary_id)
  WHERE is_public = true;

-- 사진 있는 moments 조회 최적화: storage_path IS NOT NULL인 행만 포함 (Storage 정리용)
CREATE INDEX IF NOT EXISTS idx_trip_moments_device_has_photo
  ON public.trip_moments (device_id)
  WHERE storage_path IS NOT NULL;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 운영 적용 전 검증 SELECT (Supabase SQL Editor — 읽기 전용)
--
-- ① 추가된 컬럼 존재 확인 (3개 컬럼이 보여야 함)
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'trip_moments'
--   AND column_name  IN ('is_public', 'storage_path', 'city_spot_id')
-- ORDER BY column_name;
--
-- ② 인덱스 존재 확인 (2개 행이 나와야 함)
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'trip_moments'
--   AND indexname IN (
--     'idx_trip_moments_itinerary_public',
--     'idx_trip_moments_device_has_photo'
--   );
--
-- ③ 기존 데이터 영향 확인 (is_public 전부 false, 나머지 NULL)
-- SELECT
--   COUNT(*)                                   AS total_rows,
--   COUNT(*) FILTER (WHERE is_public = false)  AS is_public_false,
--   COUNT(*) FILTER (WHERE is_public = true)   AS is_public_true,
--   COUNT(*) FILTER (WHERE storage_path IS NULL)  AS storage_path_null,
--   COUNT(*) FILTER (WHERE city_spot_id IS NULL)  AS city_spot_id_null
-- FROM public.trip_moments;
-- → is_public_false = total_rows, is_public_true = 0,
--   storage_path_null = total_rows, city_spot_id_null = total_rows
--
-- ④ city_spots FK 타입 확인 (city_spots.id = bigint이어야 함)
-- SELECT data_type FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'city_spots'
--   AND column_name  = 'id';
-- → bigint
--
-- ⑤ 재적용 멱등성 검증 (2번 실행해도 오류 없음을 확인)
-- 위 ①~④와 동일한 결과가 나오면 멱등성 확인 완료
-- ════════════════════════════════════════════════════════════════════════════
