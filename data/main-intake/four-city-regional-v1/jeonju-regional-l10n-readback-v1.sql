-- jeonju-regional-l10n readback v1 (READ-ONLY)
-- 기대: 749 zh · 744 ja/zh · 736 ja/zh 전부 존재, 기존 en/ko/(749 ja) 무변경.
SELECT id, name,
       name_l10n->>'ja' AS ja, name_l10n->>'zh' AS zh,
       (desc_l10n ? 'ja') AS has_desc_ja, (desc_l10n ? 'zh') AS has_desc_zh,
       (desc_l10n ? 'en') AS has_desc_en
  FROM city_spots WHERE id IN (749,744,736) ORDER BY id;
