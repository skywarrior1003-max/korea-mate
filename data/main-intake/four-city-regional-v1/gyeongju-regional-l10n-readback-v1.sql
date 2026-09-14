-- gyeongju-regional-l10n readback v1 (READ-ONLY)
-- 기대: en 14/14 · ja 2(432,530) · zh 2(432,530) · desc en 2(432,530) · desc ja 1(432) · desc zh 2(432,530)
SELECT id, name,
       name_l10n->>'en' AS en, name_l10n->>'ja' AS ja, name_l10n->>'zh' AS zh,
       (desc_l10n ? 'en') AS has_desc_en, (desc_l10n ? 'ja') AS has_desc_ja, (desc_l10n ? 'zh') AS has_desc_zh
  FROM city_spots
 WHERE id IN (425,432,436,439,444,454,457,462,468,473,475,481,530,665)
 ORDER BY id;

-- 타 도시/타 행 무영향 확인(경주 외 행의 updated_at 최근 변경 감시는 운영 감사 절차를 따른다)
SELECT count(*) AS gyeongju_en_total FROM city_spots
 WHERE city = 'gyeongju' AND coalesce(name_l10n,'{}'::jsonb) ? 'en';
