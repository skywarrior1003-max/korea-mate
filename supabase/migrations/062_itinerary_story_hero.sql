-- 062: 여행 전체 Story 표지 제목·소개문·문체 (STORY-HERO-TONE-SELECTION V2)
--
-- ⚠ DRAFT — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT OWNER APPROVAL.
--   (Staging(koreamate-staging)에는 snapshot→precheck→적용→readback→rollback
--    검증 프로토콜로 적용한다.)
--
-- 왜 별도 필드인가
--   trip_title 은 소유자의 관리용 여행 이름이다(내부 QA 이름 포함). 공개 Story
--   첫 표지는 사용자가 문체를 골라 만든 **별도의 Story 제목·소개문**을 쓴다 —
--   내부 이름을 공개 표지에 노출하지 않기 위한 분리다. 기존 trip_title 의
--   의미는 바꾸지 않는다.
--
-- additive-only: 기존 행은 전부 NULL 로 남고 어떤 값도 변환하지 않는다.
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS story_title TEXT;
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS story_intro TEXT;
-- 사용자가 고른 문체(calm/witty/warm) — 재선택 UI 표시용. 검증은 API 가 한다.
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS story_tone TEXT;

-- rollback (준비만 — 자동 실행 금지):
--   ALTER TABLE public.itineraries DROP COLUMN IF EXISTS story_title;
--   ALTER TABLE public.itineraries DROP COLUMN IF EXISTS story_intro;
--   ALTER TABLE public.itineraries DROP COLUMN IF EXISTS story_tone;
