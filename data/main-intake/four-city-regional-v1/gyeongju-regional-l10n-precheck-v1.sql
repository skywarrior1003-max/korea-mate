-- gyeongju-regional-l10n precheck v1 (READ-ONLY)
-- 목적: 대상 14행(en 제목 14 · ja/zh·EN 본문은 그중 432·530)의 identity 브리지·현재 키 상태·CHECK 제약 확인.
-- 기대: bridge_ok = 14, en_missing = 14, 변경 대상 외 0.
SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
 WHERE conrelid = 'city_spots'::regclass AND contype = 'c';

-- identity 브리지(정확 source_key) — 각 행이 기대 id 로 해석되는지
SELECT s.source_key, s.city_spot_id,
       (s.city_spot_id = v.expected_id) AS bridge_ok
  FROM city_spot_sources s
  JOIN (VALUES
    ('gyeongju-GJ01-0001', 425),
    ('gyeongju-GJ01-0009', 432),
    ('gyeongju-GJ01-0014', 436),
    ('gyeongju-GJ01-0017', 439),
    ('gyeongju-GJ01-0022', 444),
    ('gyeongju-GJ01-0033', 454),
    ('gyeongju-GJ01-0036', 457),
    ('gyeongju-GJ01-0042', 462),
    ('gyeongju-GJ01-0049', 468),
    ('gyeongju-GJ01-0054', 473),
    ('gyeongju-GJ01-0056', 475),
    ('gyeongju-GJ01-0062', 481),
    ('gyeongju-GJ01-0127', 530),
    ('gyeongju-KTO12-128634', 665)
  ) AS v(source_key, expected_id) ON v.source_key = s.source_key;

-- 현재 상태(before 스냅숏 — 복구 자료)
SELECT id, name, city, is_published,
       name_l10n, desc_l10n
  FROM city_spots
 WHERE id IN (425,432,436,439,444,454,457,462,468,473,475,481,530,665)
 ORDER BY id;

-- 키 존재 집계(기대: en_has = 0 · 첫 실행 기준)
SELECT count(*) FILTER (WHERE coalesce(name_l10n,'{}'::jsonb) ? 'en') AS en_has,
       count(*) FILTER (WHERE coalesce(name_l10n,'{}'::jsonb) ? 'ja') AS ja_has,
       count(*) FILTER (WHERE coalesce(name_l10n,'{}'::jsonb) ? 'zh') AS zh_has
  FROM city_spots WHERE id IN (425,432,436,439,444,454,457,462,468,473,475,481,530,665);
