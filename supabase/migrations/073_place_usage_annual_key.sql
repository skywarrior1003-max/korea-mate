-- 073: place_usage 연도 축 (additive) — PLACE-USAGE-FOUNDATION-V2 §E
--
-- 계약 변경: 활용의 중복 방지 단위를 "평생 1회"에서 "KST 연도당 1회"로.
--   usage_key 자체가 이제 연도를 포함해 파생되므로(usageKeyYearly, 서버 KST
--   연도만 사용) 기존 usage_key UNIQUE 가 그대로 연도별 중복 방지를 강제한다.
--   usage_year 는 그 사실의 **명시 컬럼**(조회·집계·검증용)이다.
--
-- legacy 행 처리(§E):
--   기존 lifetime 키로 만들어진 행은 재계산하지 않는다 — 재계산에는 raw
--   device 가 필요한데 그것을 요구·복원하는 것 자체가 금지 계약이다.
--   usage_year 만 created_at 의 KST 연도로 백필한다(재해석이 아니라 발생
--   시점 사실의 파생값). lifetime 키 행이 남아 있으면 그 기기는 "그 장소를
--   이미 활용한 사람"으로 계속 1회 계상된다 — 새 연도 키와 충돌하지 않는다
--   (입력 문법이 달라 해시가 겹치지 않는다). Production 은 적용 시점 0행.
--
-- 하지 않는 것: 기존 행 삭제·usage_key 재계산·UNIQUE 완화·RLS 변경.

BEGIN;

ALTER TABLE public.place_usage
  ADD COLUMN IF NOT EXISTS usage_year SMALLINT;

-- 기존 행 백필 — created_at 의 Asia/Seoul 연도
UPDATE public.place_usage
   SET usage_year = EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Asia/Seoul'))::smallint
 WHERE usage_year IS NULL;

ALTER TABLE public.place_usage
  ALTER COLUMN usage_year SET NOT NULL;

-- 합리적 연도 범위(서비스 이전·먼 미래 차단)
ALTER TABLE public.place_usage
  ADD CONSTRAINT place_usage_year_chk CHECK (usage_year BETWEEN 2024 AND 2100);

-- 연도별 집계·검증 조회용
CREATE INDEX IF NOT EXISTS idx_place_usage_target_year
  ON public.place_usage (target_type, target_key, usage_year);

-- 검증 — NOT NULL·제약이 실제로 걸렸는지
DO $v073$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'place_usage'
               AND column_name = 'usage_year' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION '[073] usage_year NOT NULL 미적용';
  END IF;
END $v073$;

COMMIT;
