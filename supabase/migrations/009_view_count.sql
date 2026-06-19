-- TASK-030: shared trip view counter
-- 1. itineraries 테이블에 view_count 컬럼 추가
-- 2. 보안 격리 RPC (anon UPDATE 권한 없음, 함수 실행 권한만 부여)
-- 실행: Supabase Dashboard > SQL Editor 에서 수동 적용

ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_trip_view(trip_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE itineraries
  SET view_count = view_count + 1
  WHERE id = trip_id_param;
END;
$$;

-- anon은 함수 호출 권한만 가짐 — 행 UPDATE 권한 없음
GRANT EXECUTE ON FUNCTION increment_trip_view(UUID) TO anon;
