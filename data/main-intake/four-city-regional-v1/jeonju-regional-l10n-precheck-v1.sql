-- jeonju-regional-l10n precheck v1 (READ-ONLY)
-- 대상 3행: 749(zh) · 744(ja,zh) · 736(ja,zh). 기대(첫 실행): 아래 키 전부 부재.
SELECT id, name, city, is_published, external_id, name_l10n, desc_l10n
  FROM city_spots WHERE id IN (749,744,736) ORDER BY id;

-- identity 브리지(external_id 정확 일치)
SELECT id, external_id,
       (CASE id WHEN 749 THEN 'jeonju:OFF-16109' WHEN 744 THEN 'jeonju:OFF-16086' WHEN 736 THEN 'jeonju:OFF-13964' END = external_id) AS bridge_ok
  FROM city_spots WHERE id IN (749,744,736);

SELECT count(*) FILTER (WHERE id = 749 AND coalesce(name_l10n,'{}'::jsonb) ? 'zh') AS r749_zh_has,
       count(*) FILTER (WHERE id IN (744,736) AND coalesce(name_l10n,'{}'::jsonb) ? 'ja') AS ja_has,
       count(*) FILTER (WHERE id IN (744,736) AND coalesce(name_l10n,'{}'::jsonb) ? 'zh') AS zh_has
  FROM city_spots WHERE id IN (749,744,736);
