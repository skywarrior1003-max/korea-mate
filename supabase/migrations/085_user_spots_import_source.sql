-- 085_user_spots_import_source.sql
-- (GOKOREAMATE-EXTERNAL-TRIP-IMPORT-AND-GUIDED-JOURNEY-V2 · 2026-09-30)
--
-- 가져온 일정·장소를 버리지 않기 위한 근거 컬럼. additive only · **Staging 전용 적용.**
--
-- anchor-core 는 "좌표 짝·사진"만 새 장소의 근거로 인정하고, 링크·출처 같은 근거는
-- "저장할 컬럼이 아직 없으므로" 계산하지 않았다. 사용자가 가져온 글·링크에 적힌
-- 장소는 그 출처 자체가 근거다 — 좌표를 지어내지 않고 이름과 출처만 보존한다.
-- 위치는 사용자가 나중에 기존 지도 확인 흐름으로 정한다(수동 등록 규칙은 그대로).
--
-- import_source: 'text'(붙여넣은 글) 또는 링크의 host(예: blog.naver.com). 원문·전체 URL 은 저장하지 않는다.
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS import_source TEXT
    CHECK (import_source IS NULL OR char_length(import_source) BETWEEN 2 AND 120);
