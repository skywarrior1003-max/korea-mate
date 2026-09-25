-- 070_new_discovery_foundations.sql
-- (COMMUNITY-RECOMMENDATION-PAGINATION-AND-NEW-DISCOVERY-V1 §6·§7 · 2026-09-25)
--
-- 신규 추천의 서버 소유 시각 2종을 만든다. 전부 additive — DROP·파괴적 ALTER 없음.
--   ① story_submissions.first_approved_at — 최초 승인 시각(1회 기록·불변).
--      재제출(pending 재설정)·재승인·수정·철회로 절대 초기화되지 않는다(트리거 강제).
--   ② place_suggestion_publications — accepted 제안 ↔ 실제 게시된 city_spots 의
--      admin 전용 연결. first_published_at 은 불변(UPDATE 자체를 트리거로 거부).
--
-- backfill 정책: **명시적 0건**. 기존 5,015개 catalog 장소·기존 승인 Story 를
-- 소급해서 "신규"로 만들지 않는다 — INSERT/UPDATE 문이 이 파일에 없다.
-- (기존 승인 Story 의 first_approved_at 은 NULL 로 남고, 신규 목록 자격은
--  first_approved_at 이 실재하는 행만 가진다.)
--
-- 적용 대상: Staging 전용(이 TASK). Production 적용은 별도 Owner 승인 릴리스에서.

-- ── ① Story 최초 승인 시각 ──────────────────────────────────────────────────
ALTER TABLE public.story_submissions
  ADD COLUMN IF NOT EXISTS first_approved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.story_submissions_first_approved_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.first_approved_at IS NOT NULL THEN
    -- 한 번 기록된 최초 승인 시각은 어떤 갱신으로도 바뀌지 않는다(덮어쓰기 시도 무시)
    NEW.first_approved_at := OLD.first_approved_at;
    RETURN NEW;
  END IF;
  IF NEW.status = 'approved' AND NEW.first_approved_at IS NULL THEN
    NEW.first_approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_story_submissions_first_approved ON public.story_submissions;
CREATE TRIGGER trg_story_submissions_first_approved
  BEFORE INSERT OR UPDATE ON public.story_submissions
  FOR EACH ROW EXECUTE FUNCTION public.story_submissions_first_approved_guard();

-- ── ② 장소 제안 ↔ 게시 장소 연결(admin 전용·불변) ──────────────────────────
-- accepted 는 여전히 city_spots 를 자동 생성하지 않는다. 기존 카탈로그 검증
-- 절차로 장소가 실제 게시된 뒤, admin 이 이 표로 1:1 연결해야만 "신규 장소"다.
CREATE TABLE IF NOT EXISTS public.place_suggestion_publications (
  suggestion_id      BIGINT      PRIMARY KEY REFERENCES public.place_suggestions(id),
  city_spot_id       BIGINT      NOT NULL UNIQUE REFERENCES public.city_spots(id),
  city               TEXT        NOT NULL CHECK (char_length(city) BETWEEN 2 AND 32),
  linked_by          TEXT        NOT NULL DEFAULT 'admin-key',
  first_published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_psp_city_first_published
  ON public.place_suggestion_publications (city, first_published_at DESC);

CREATE OR REPLACE FUNCTION public.place_suggestion_publications_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'place_suggestion_publications rows are immutable (first_published_at must never change)';
END;
$$;

DROP TRIGGER IF EXISTS trg_psp_immutable ON public.place_suggestion_publications;
CREATE TRIGGER trg_psp_immutable
  BEFORE UPDATE ON public.place_suggestion_publications
  FOR EACH ROW EXECUTE FUNCTION public.place_suggestion_publications_immutable();

ALTER TABLE public.place_suggestion_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_suggestion_publications FROM PUBLIC, anon, authenticated;
