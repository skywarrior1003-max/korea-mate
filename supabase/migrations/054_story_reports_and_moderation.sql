-- 054: 공개 Story 신고 + 관리자 숨김 (additive)
--
-- 무엇을 더하나
--   ① place_reports 가 Story 도 받을 수 있게 대상 종류와 사유를 넓힌다
--   ② itineraries 에 "관리자가 가렸다" 는 상태를 둔다
--
-- 왜 기존 신고 테이블을 쓰나
--   `target_key` 가 이미 text 다. 공유 id(UUID) 가 그대로 들어간다. 컬럼 타입을
--   바꿀 필요가 없고, 기존 행도 건드리지 않는다. 관리자 화면과 알림도 이미
--   `target_type` 으로 갈라 볼 수 있게 돼 있다. 신고 시스템을 하나 더 만들면
--   관리자가 두 곳을 봐야 한다.
--
-- 왜 is_public 만으로 부족한가
--   관리자가 `is_public=false` 로만 내려 두면, 만든 사람이 다시 공개를 켜서
--   그대로 되돌릴 수 있다. 그러면 가린 의미가 없다. 그래서 서버가 구분할 수
--   있는 상태를 따로 둔다 — 이 값이 켜져 있으면 공개 요청 자체를 거절한다.
--
-- 가리는 것은 지우는 것이 아니다
--   사용자의 My Trip·Memory·사진·메모·동의 기록은 그대로 남는다. 바깥으로
--   나가는 길만 닫는다. 관리자가 다시 풀어도 **저절로 공개되지 않는다** —
--   다시 공개할지는 만든 사람이 정한다.
--
-- 하지 않는 것
--   기존 신고 행 삭제·변환 0 · 기존 itinerary 데이터 변환 0 · is_public 일괄
--   변경 0 · RLS 완화 0 · anon/authenticated 쓰기 권한 부여 0.
--
-- 적용 방법
--   Supabase Dashboard > SQL Editor 에서 사람이 직접 실행한다.
--   `supabase db push` 로 적용하지 않는다.
--
-- 롤백 (되돌려야 할 때만)
--   ALTER TABLE public.itineraries
--     DROP COLUMN IF EXISTS moderation_hidden_at;
--   ALTER TABLE public.place_reports DROP CONSTRAINT IF EXISTS place_reports_target_type_chk;
--   ALTER TABLE public.place_reports ADD  CONSTRAINT place_reports_target_type_chk
--     CHECK (target_type in ('city_spot'));
--   (사유 CHECK 도 042 의 목록으로 되돌린다)

BEGIN;

-- ── 1. 신고 대상에 Story 를 더한다 ───────────────────────────────────────────
-- CHECK 만 바꾼다. 기존 행은 전부 'city_spot' 이라 새 조건도 그대로 만족한다.
ALTER TABLE public.place_reports
  DROP CONSTRAINT IF EXISTS place_reports_target_type_chk;

ALTER TABLE public.place_reports
  ADD CONSTRAINT place_reports_target_type_chk
  CHECK (target_type IN ('city_spot', 'shared_story'));

-- ── 2. 신고 사유에 사용자 콘텐츠용 다섯 가지를 더한다 ───────────────────────
-- 기존 15개는 그대로 둔다. 장소 정보 오류를 신고하던 사람들의 기록이 깨지지 않는다.
ALTER TABLE public.place_reports
  DROP CONSTRAINT IF EXISTS place_reports_category_chk;

ALTER TABLE public.place_reports
  ADD CONSTRAINT place_reports_category_chk
  CHECK (category IN (
    -- 042 의 장소 정보 신고 사유 (그대로)
    'hours_or_holiday','price_or_fee','location','closed_or_unavailable',
    'construction_or_access','facility_info','accessibility',
    'maintenance','cleanliness','facility_broken','staff_service',
    'overcharge_suspected','safety','service_mismatch','other',
    -- 공개 Story 용 (신규)
    'inappropriate_content','privacy_concern','rights_concern','spam_or_misleading'
  ));

-- ── 3. 관리자가 가린 상태 ────────────────────────────────────────────────────
-- 시각 하나면 충분하다. NULL 이면 가려지지 않은 것이고, 값이 있으면 가려진 것이며
-- 언제 가렸는지도 함께 남는다. 상태 컬럼을 따로 두면 둘이 어긋날 수 있다.
ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS moderation_hidden_at TIMESTAMPTZ;

-- 가려진 것만 빠르게 훑는다. 대부분의 행은 NULL 이라 부분 인덱스로 충분하다.
CREATE INDEX IF NOT EXISTS idx_itineraries_moderation_hidden
  ON public.itineraries (moderation_hidden_at)
  WHERE moderation_hidden_at IS NOT NULL;

COMMIT;

-- 적용 후 확인 (읽기 전용)
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.place_reports'::regclass
--      AND conname IN ('place_reports_target_type_chk','place_reports_category_chk');
--   → 각각 shared_story 와 새 사유 4개가 포함돼 있어야 한다
--
--   SELECT count(*) FROM public.itineraries WHERE moderation_hidden_at IS NOT NULL;
--   → 0 (아직 아무것도 가리지 않았다)
