-- content-recovery precheck v1 (READ-ONLY) — 적용 직전 실행·before snapshot 보존 필수
SELECT id, name, city, image_url, name_l10n, desc_l10n FROM city_spots WHERE id IN (28,40,1273,1319,1360,672,729,736,742,744,763,765,778,917,1088,1089,1098,1109,1125,1126,1633,427) ORDER BY id;
-- 기대(첫 실행): 아래 전부 0
SELECT count(*) FILTER (WHERE id IN (28,40,1273,1319,1360) AND image_url IS NOT NULL) AS img_has,
       count(*) FILTER (WHERE id IN (672,729,736,742,744,763,765,778,917,1088,1089,1098,1109,1125,1126,1633) AND coalesce(desc_l10n,'{}'::jsonb) ? 'ko') AS ko_has,
       count(*) FILTER (WHERE id IN (427,778,1319) AND coalesce(name_l10n,'{}'::jsonb) ? 'en') AS en_has
  FROM city_spots WHERE id IN (28,40,1273,1319,1360,672,729,736,742,744,763,765,778,917,1088,1089,1098,1109,1125,1126,1633,427);
