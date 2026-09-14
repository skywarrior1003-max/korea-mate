-- content-recovery readback v1 (READ-ONLY) — 기대: 이미지 5/5 · desc ko 16/16 · en 3행 name+desc
SELECT id, (image_url IS NOT NULL) AS has_img, (desc_l10n ? 'ko') AS has_ko, (desc_l10n ? 'en') AS has_en_desc, name_l10n->>'en' AS en_name
  FROM city_spots WHERE id IN (28,40,1273,1319,1360,672,729,736,742,744,763,765,778,917,1088,1089,1098,1109,1125,1126,1633,427) ORDER BY id;
