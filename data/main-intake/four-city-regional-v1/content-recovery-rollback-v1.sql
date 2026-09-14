-- content-recovery ROLLBACK v1 — 실행 금지. 이미지=값조건 NULL 복귀(원값 NULL 이었음), 텍스트 키=값조건 제거.
BEGIN;

UPDATE city_spots SET image_url = NULL, updated_at = now()
 WHERE id = 28 AND image_url = 'https://tong.visitkorea.or.kr/cms/resource/69/3492369_image2_1.jpg';

UPDATE city_spots SET image_url = NULL, updated_at = now()
 WHERE id = 40 AND image_url = 'https://tong.visitkorea.or.kr/cms/resource/99/3546099_image2_1.jpg';

UPDATE city_spots SET image_url = NULL, updated_at = now()
 WHERE id = 1273 AND image_url = 'http://tong.visitkorea.or.kr/cms/resource/44/3561844_image2_1.jpg';

UPDATE city_spots SET image_url = NULL, updated_at = now()
 WHERE id = 1319 AND image_url = 'https://tong.visitkorea.or.kr/cms/resource/70/3561970_image2_1.jpg';

UPDATE city_spots SET image_url = NULL, updated_at = now()
 WHERE id = 1360 AND image_url = 'http://tong.visitkorea.or.kr/cms/resource/00/2646400_image2_1.jpg';

-- desc_l10n.ko / en 키 제거는 master jsonl 의 원천값과 대조 후 개별 실행(값조건):

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 672 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 672); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 729 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 729); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 736 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 736); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 742 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 742); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 744 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 744); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 763 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 763); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 765 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 765); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 778 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 778); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 917 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 917); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1088 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1088); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1089 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1089); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1098 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1098); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1109 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1109); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1125 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1125); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1126 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1126); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1633 AND md5(desc_l10n->>'ko') = (SELECT md5(desc_l10n->>'ko') FROM city_spots WHERE id = 1633); -- 실제 실행 시 master 원문과 대조한 조건으로 교체

ROLLBACK; -- 안전장치: 이 파일은 그대로 실행해도 반영되지 않는다(실행 시 값조건 확정본으로 교체)
