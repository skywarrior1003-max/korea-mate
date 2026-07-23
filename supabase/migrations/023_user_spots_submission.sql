-- 023_user_spots_submission.sql
-- 사용자 장소 공개 신청 1차 MVP
-- submission_status: none(기본) -> pending -> approved / rejected
-- city_spots 자동 반영 없음. 승인 후 관리자 별도 작업으로 처리.

ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'none'
    CHECK (submission_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- 관리자 대기열 인덱스 (pending 행만 부분 인덱스)
CREATE INDEX IF NOT EXISTS user_spots_submission_pending_idx
  ON public.user_spots (submitted_at DESC)
  WHERE submission_status = 'pending';

-- ── 검증 쿼리 (실행 후 수동 확인) ──────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'user_spots'
--   AND column_name IN ('submission_status', 'submitted_at');
-- -- submission_status: text, default 'none' / submitted_at: timestamp with time zone

-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'user_spots' AND indexname = 'user_spots_submission_pending_idx';
-- -- 1행 반환 확인
