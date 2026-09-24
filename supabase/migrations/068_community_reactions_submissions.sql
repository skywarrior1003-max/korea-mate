-- 068: 커뮤니티 반응(싫어요)·Story 추천 제출·장소 제안 (additive)
-- TASK: COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1
--
-- 무엇을 더하나
--   ① content_dislikes — 장소·공개 Story 의 "싫어요". 좋아요(place_likes /
--      content_likes)와 별도 테이블이다: 기존 좋아요 계약·집계를 건드리지 않고,
--      상호 배타는 서버 API 가 반대편 행 삭제로 보장한다.
--   ② story_submissions — 공개 Story 를 지역 추천에 제출한 상태 기계.
--      Story 를 복제하지 않는다 — itinerary_id 참조 하나뿐이다(1 Story = 1 행).
--   ③ place_suggestions — 사용자 장소 제안(V1: 텍스트만, 이미지 업로드 없음).
--   ④ place_reports 사유 CHECK 확장 — 싫어요 후 피드백 사유(장소 4·Story 3).
--      042·054 의 기존 값은 전부 그대로 둔다.
--
-- 하지 않는 것
--   기존 행 변환 0 · 좋아요 테이블 변경 0 · RLS 완화 0 ·
--   anon/authenticated 권한 부여 0 (전부 service_role 전용 — 060 과 동일).
--
-- 적용 방법
--   Staging: Management API 로 1회. Production: Owner 승인 후 별도 실행.

BEGIN;

-- ── ① 싫어요 ────────────────────────────────────────────────────────────────
-- 사용자에게 숫자를 공개하지 않는다(순위·운영 검토 전용). 행 존재 = 현재 싫어요.
-- disliker_key = sha256(device|dislike:type:key) — raw device_id 를 저장하지 않는다.
CREATE TABLE IF NOT EXISTS public.content_dislikes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_type   TEXT        NOT NULL CHECK (target_type IN ('city_spot', 'story')),
  target_key    TEXT        NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 64),
  disliker_key  TEXT        NOT NULL UNIQUE CHECK (char_length(disliker_key) = 64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_dislikes_target
  ON public.content_dislikes (target_type, target_key);
ALTER TABLE public.content_dislikes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_dislikes FROM anon, authenticated;

-- ── ② Story 추천 제출 ──────────────────────────────────────────────────────
-- 공개 Story 자체가 추천 대상이다. 복제 컬럼(제목·사진·본문)은 두지 않는다.
-- UNIQUE(itinerary_id) = "한 Story 는 한 번" — 재제출은 행 갱신(rejected/withdrawn
-- → pending)으로만 한다.
CREATE TABLE IF NOT EXISTS public.story_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id   UUID        NOT NULL UNIQUE,
  city           TEXT        NOT NULL CHECK (char_length(city) BETWEEN 2 AND 32),
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submitter_key  TEXT        NOT NULL CHECK (char_length(submitter_key) = 64),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  decided_note   TEXT        CHECK (decided_note IS NULL OR char_length(decided_note) <= 500),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_story_submissions_city_status
  ON public.story_submissions (city, status);
ALTER TABLE public.story_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_submissions FROM anon, authenticated;

-- ── ③ 장소 제안 ────────────────────────────────────────────────────────────
-- V1 은 텍스트 제안만 받는다. 외부 이미지 URL 컬럼을 두지 않는다(§5-1) —
-- 승인 과정에서 검증된 자산을 city_spots 쪽에 연결한다.
CREATE TABLE IF NOT EXISTS public.place_suggestions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  city           TEXT        NOT NULL CHECK (char_length(city) BETWEEN 2 AND 32),
  name           TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  category       TEXT        NOT NULL CHECK (char_length(category) BETWEEN 1 AND 40),
  address        TEXT        NOT NULL CHECK (char_length(address) BETWEEN 1 AND 300),
  reason         TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  official_link  TEXT        CHECK (official_link IS NULL OR char_length(official_link) <= 300),
  suggester_key  TEXT        NOT NULL CHECK (char_length(suggester_key) = 64),
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_place_suggestions_city_status
  ON public.place_suggestions (city, status);
ALTER TABLE public.place_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_suggestions FROM anon, authenticated;

-- ── ④ 피드백 사유 확장 ─────────────────────────────────────────────────────
-- 042(15)+054(4)+other 는 그대로, 커뮤니티 사유 7개를 더한다.
ALTER TABLE public.place_reports
  DROP CONSTRAINT IF EXISTS place_reports_category_chk;

ALTER TABLE public.place_reports
  ADD CONSTRAINT place_reports_category_chk
  CHECK (category IN (
    -- 042 — 장소 정보 신고 사유 (그대로)
    'hours_or_holiday','price_or_fee','location','closed_or_unavailable',
    'construction_or_access','facility_info','accessibility',
    'maintenance','cleanliness','facility_broken','staff_service',
    'overcharge_suspected','safety','service_mismatch','other',
    -- 054 — 공개 Story 용 (그대로)
    'inappropriate_content','privacy_concern','rights_concern','spam_or_misleading',
    -- 068 — 싫어요 후 피드백: 장소 축
    'info_inaccurate','photo_mismatch','duplicate_place','low_value',
    -- 068 — 싫어요 후 피드백: Story 축
    'unrealistic_itinerary','route_mismatch','low_quality'
  ));

-- ── 자기검증 (054 §4 와 같은 이유 — 이름이 아니라 catalog 상태를 본다) ──────
DO $v068$
DECLARE
  bad text;
BEGIN
  -- 새 사유를 막는 category CHECK 가 남아 있으면 전부 되돌린다.
  SELECT string_agg(c.conname, ', ') INTO bad
    FROM pg_constraint c
   WHERE c.conrelid = 'public.place_reports'::regclass
     AND c.contype  = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%category%'
     AND pg_get_constraintdef(c.oid) NOT LIKE '%''photo_mismatch''%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[068] 새 사유를 막는 category CHECK 잔존: %', bad;
  END IF;

  -- 세 테이블의 RLS 가 실제로 켜졌는지 본다.
  SELECT string_agg(relname, ', ') INTO bad
    FROM pg_class
   WHERE relname IN ('content_dislikes', 'story_submissions', 'place_suggestions')
     AND relrowsecurity = false;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[068] RLS 미적용 테이블: %', bad;
  END IF;
END $v068$;

COMMIT;
