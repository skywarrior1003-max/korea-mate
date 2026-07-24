-- ════════════════════════════════════════════════════════════════════════════
-- 024_user_spots_publish_columns.sql
-- user_spots → city_spots 게시 추적 컬럼 추가
--
-- city_spot_id : 반영된 city_spots 행 FK (IS NOT NULL = 현재 게시 상태)
-- published_at : 최초 게시 시각 (감사 기록 전용 — 게시 여부 판단에 사용 금지)
--
-- 게시 여부 기준: city_spot_id IS NOT NULL (단일 기준)
-- city_spots 행 삭제 시: FK ON DELETE SET NULL → city_spot_id만 NULL
--                        published_at은 과거 이력으로 보존
-- 관리자 수동 롤백 시: city_spot_id + published_at 동시 NULL (025 RPC 경유)
--
-- 재실행 안전성: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- 적용 전제: 023_user_spots_submission.sql 적용 완료
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 컬럼 추가 ──────────────────────────────────────────────────────────────────
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS city_spot_id BIGINT
    REFERENCES public.city_spots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ── 부분 인덱스 (반영 완료 장소만 인덱싱) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS user_spots_city_spot_id_idx
  ON public.user_spots (city_spot_id)
  WHERE city_spot_id IS NOT NULL;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 SQL (운영 적용 후 별도 실행 — 읽기 전용)
--
-- ① 컬럼 타입 확인
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'user_spots'
--   AND column_name IN ('city_spot_id', 'published_at')
-- ORDER BY column_name;
-- → city_spot_id: bigint, YES / published_at: timestamp with time zone, YES
--
-- ② FK 대상 및 ON DELETE 동작 확인
-- SELECT
--   c.conname,
--   cl.relname AS ref_table,
--   a.attname  AS ref_column,
--   CASE c.confdeltype
--     WHEN 'n' THEN 'SET NULL'
--     WHEN 'a' THEN 'NO ACTION'
--     WHEN 'c' THEN 'CASCADE'
--     WHEN 'r' THEN 'RESTRICT'
--     ELSE c.confdeltype::text
--   END AS on_delete
-- FROM pg_constraint c
--   JOIN pg_class     cl ON c.confrelid = cl.oid
--   JOIN pg_attribute a  ON a.attrelid  = cl.oid AND a.attnum = c.confkey[1]
-- WHERE c.conrelid = 'public.user_spots'::regclass
--   AND c.contype  = 'f'
--   AND cl.relname = 'city_spots';
-- → ref_table: city_spots / ref_column: id / on_delete: SET NULL 확인
--
-- ③ 부분 인덱스 확인
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'user_spots'
--   AND indexname  = 'user_spots_city_spot_id_idx';
-- → 1행 반환 / indexdef에 WHERE city_spot_id IS NOT NULL 포함 확인
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (적용 취소 시만 — 데이터 손실 주의)
--
-- DROP INDEX  IF EXISTS user_spots_city_spot_id_idx;
-- ALTER TABLE public.user_spots DROP COLUMN IF EXISTS published_at;
-- ALTER TABLE public.user_spots DROP COLUMN IF EXISTS city_spot_id;
-- ════════════════════════════════════════════════════════════════════════════
