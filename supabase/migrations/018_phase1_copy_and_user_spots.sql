-- ════════════════════════════════════════════════════════════════════════════
-- 018_phase1_copy_and_user_spots.sql
-- PHASE 1 — 공유 일정 복사 + 사용자 장소 등록 기반 테이블
--
-- 변경 내용:
--   1. itineraries.copy_of UUID    — 복사본이 참조하는 원본 일정 ID
--   2. itineraries.copied_at       — 복사 시각 (updated_at와 별도로 보존)
--   3. user_spots 테이블 신규 생성 — 사용자 커스텀 장소 (My Picks)
--      is_public 제외: 공개 정책은 PHASE 1-B에서 승인 플로우와 함께 설계
--      lat/lng DB 레벨 CHECK (API에서도 동일 범위 검증)
--   4. 인덱스: user_spots(device_id), user_spots(city)
--              itineraries(copy_of) WHERE copy_of IS NOT NULL (부분 인덱스)
--   5. RLS: user_spots ENABLE + anon/authenticated 전면 REVOKE
--           (모든 접근은 Cloudflare Pages Functions service_role 경유)
--
-- 실행 전 확인:
--   · 017_lockdown_itineraries.sql 적용 완료 상태여야 함
--   · Cloudflare Pages Functions 배포 완료 상태여야 함
--
-- 재실행 안전성:
--   · ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS 구조
--   · DROP POLICY IF EXISTS 불필요 (신규 테이블)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── STEP 1: itineraries 컬럼 추가 ─────────────────────────────────────────────
-- copy_of: 복사된 일정이 원본을 참조. 원본 삭제 시 NULL(CASCADE 아님).
ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS copy_of   UUID REFERENCES public.itineraries(id) ON DELETE SET NULL;

-- copied_at: copy_of가 있는 행만 의미 있음. 이후 편집해도 복사 시각을 보존.
ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS copied_at TIMESTAMPTZ;

-- ── STEP 2: user_spots 테이블 생성 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_spots (
  id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  UUID             NOT NULL,
  name       TEXT             NOT NULL,
  city       TEXT,
  address    TEXT,
  lat        DOUBLE PRECISION CHECK (lat IS NULL OR (lat >= -90  AND lat <= 90)),
  lng        DOUBLE PRECISION CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)),
  category   TEXT             DEFAULT 'attraction'
                              CHECK (category IN (
                                'attraction', 'nature', 'restaurant',
                                'event', 'accommodation'
                              )),
  note       TEXT,
  photo_url  TEXT,
  created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ── STEP 3: 인덱스 ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS user_spots_device_id_idx ON public.user_spots (device_id);
CREATE INDEX IF NOT EXISTS user_spots_city_idx       ON public.user_spots (city);

-- copy_of 부분 인덱스: 복사본 일정만 선택적으로 인덱싱 (전체 itineraries 대비 소수)
CREATE INDEX IF NOT EXISTS itineraries_copy_of_idx
  ON public.itineraries (copy_of)
  WHERE copy_of IS NOT NULL;

-- ── STEP 4: RLS 활성화 + anon/authenticated 전면 차단 ─────────────────────────
-- 017과 동일 패턴: RLS ON + 정책 없음 + 명시적 REVOKE (belt-and-suspenders)
ALTER TABLE public.user_spots ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_spots
  FROM anon, authenticated;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (적용 취소가 필요할 때만, BEGIN/COMMIT 제거 후 별도 실행)
-- 경고: copy_of / copied_at 가 있는 복사본 데이터와 user_spots 데이터가 손실됩니다.
--
-- DROP INDEX  IF EXISTS itineraries_copy_of_idx;
-- ALTER TABLE public.itineraries DROP COLUMN IF EXISTS copied_at;
-- ALTER TABLE public.itineraries DROP COLUMN IF EXISTS copy_of;
-- DROP TABLE  IF EXISTS public.user_spots;
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- 실행 후 검증 SQL (읽기 전용, SQL Editor에서 별도 실행)
--
-- ① itineraries.copy_of / copied_at 컬럼 확인
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'itineraries'
--   AND column_name IN ('copy_of', 'copied_at')
-- ORDER BY column_name;
-- → copy_of: USER-DEFINED(uuid), YES / copied_at: timestamp with time zone, YES
--
-- ② user_spots 컬럼 확인 (is_public 없어야 함)
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_spots'
-- ORDER BY ordinal_position;
--
-- ③ user_spots CHECK 제약 확인 (lat, lng, category 3개여야 함)
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.user_spots'::regclass AND contype = 'c';
--
-- ④ 인덱스 확인
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE (tablename = 'user_spots'  AND indexname IN ('user_spots_device_id_idx','user_spots_city_idx'))
--    OR (tablename = 'itineraries' AND indexname = 'itineraries_copy_of_idx');
--
-- ⑤ itineraries.copy_of FK 확인
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.itineraries'::regclass
--   AND contype = 'f' AND conname LIKE '%copy_of%';
--
-- ⑥ user_spots 권한 확인 — 0행이 나와야 함
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'user_spots'
--   AND grantee IN ('anon', 'authenticated');
-- ════════════════════════════════════════════════════════════════════════════
