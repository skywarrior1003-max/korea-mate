-- [운영 적용 이력] 014 migration 실행 전 사전 확인용으로 사용 (SELECT ONLY)
--               2026-07-03 기준 014 이미 적용 완료 → 사후 상태 확인 목적으로만 사용
-- [소스 관리 편입 목적] 검증 도구 보존 — DB 변경 없음, 항상 안전
-- ============================================================
-- verify_categories.sql
-- city_spots category 상태 확인 전용 (변경 없음, SELECT only)
-- migration 014 실행 전 반드시 이 파일 먼저 실행 후 결과 확인
-- ============================================================

-- [1] 전체 category 분포
SELECT category, COUNT(*) AS count
FROM city_spots
GROUP BY category
ORDER BY category;

-- [2] 비표준 category만 (변경 대상 후보)
SELECT category, COUNT(*) AS count
FROM city_spots
WHERE lower(trim(category)) NOT IN (
  'attraction', 'restaurant', 'nature', 'event', 'accommodation'
)
GROUP BY category
ORDER BY count DESC;

-- [3] 총 변경 대상 row 수
SELECT COUNT(*) AS total_rows_to_update
FROM city_spots
WHERE lower(trim(category)) NOT IN (
  'attraction', 'restaurant', 'nature', 'event', 'accommodation'
);

-- [4] 매핑 후 예상 결과 미리보기 (실제 변경 없음)
-- mapped_to 에 '⚠️ UNMAPPED' 가 보이면 migration 실행 금지
SELECT
  category AS current_category,
  CASE
    WHEN lower(trim(category)) IN (
      'beach', 'island', 'nature', 'park', 'hiking', 'walking trail'
    ) THEN 'nature'
    WHEN lower(trim(category)) IN (
      'cafe', 'cafe street', 'market', 'restaurant'
    ) THEN 'restaurant'
    WHEN lower(trim(category)) IN (
      'culture', 'art', 'history', 'landmark', 'museum', 'observatory',
      'theme park', 'transit landmark', 'viewpoint', 'attraction',
      'temple', 'shopping', 'resort area'
    ) THEN 'attraction'
    ELSE '⚠️ UNMAPPED — DO NOT RUN MIGRATION'
  END AS mapped_to,
  COUNT(*) AS count
FROM city_spots
WHERE lower(trim(category)) NOT IN (
  'attraction', 'restaurant', 'nature', 'event', 'accommodation'
)
GROUP BY category
ORDER BY mapped_to, category;

-- [5] subcategory 컬럼 존재 여부 (없어야 정상 — migration이 처음 실행된다면)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'city_spots'
  AND column_name  = 'subcategory';

-- [6] 기존 CHECK constraint 존재 여부 (city_spots_category_check 없어야 정상)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'city_spots'::regclass
  AND contype  = 'c';