-- gyeongju-regional-l10n apply v1
-- 성격: 키 부재 시에만 추가(no-overwrite) · idempotent(재실행 시 0행) · 삭제/치환 0.
-- 대상: 경주 regional 15 stop 의 city_spots 14행 EN 제목 + 432/530 JA·ZH(공식 native).
-- 원천: data/four-city-regional-final-package-v1 @ 0c3a45e (en_title verbatim ·
--        432 ja/zh = gyeongju.museum.go.kr · 530 = UNESCO 공식 다국어 페이지).
-- 주의: 패키지 en 행의 description 은 중국어 혼입이 확인되어 의도적으로 제외했다.
-- 복구: 각 키는 아래 값과 일치할 때 name_l10n - '<key>' 로 제거 가능(master jsonl 참조).
BEGIN;

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Gyerim Forest (경주 계림)'), updated_at = now()
 WHERE id = 425 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju National Museum (국립경주박물관)'), updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('ja','国立慶州博物館'), updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('zh','国立庆州博物馆'), updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ja','新羅千年の首都「慶州」に位置する国立慶州博物館は、新羅の文化遺産が一同に集結した韓国を代表する博物館です。'), updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('zh','位于新罗千年首都庆州的国立庆州博物馆是可以纵观新罗文化遗产的韩国代表性博物馆。'), updated_at = now()
 WHERE id = 432 AND city = 'gyeongju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Cheonmachong Tomb (Daereungwon Ancient Tombs)'), updated_at = now()
 WHERE id = 436 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Donggung Palace and Wolji Pond'), updated_at = now()
 WHERE id = 439 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Bunhwangsa Temple'), updated_at = now()
 WHERE id = 444 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Woljeonggyo Bridge'), updated_at = now()
 WHERE id = 454 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Cheomseongdae Observatory'), updated_at = now()
 WHERE id = 457 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Hwangnidan Street'), updated_at = now()
 WHERE id = 462 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Najeong Well'), updated_at = now()
 WHERE id = 468 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Bae-dong Samneung Royal Tombs'), updated_at = now()
 WHERE id = 473 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Five Royal Tombs'), updated_at = now()
 WHERE id = 475 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Poseokjeong Pavilion Site'), updated_at = now()
 WHERE id = 481 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Seokguram Grotto [UNESCO World Heritage]'), updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('ja','石窟庵と仏国寺'), updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('zh','石窟庵和佛国寺'), updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('zh','石窟庵建于公元8世纪，位于吐含山的斜坡上，石窟庵内有一尊纪念佛像，该佛像以普密斯帕莎穆德拉姿势面朝着大海。佛像周围有各种神仙、菩萨及弟子的雕像，雕刻细腻写实，是远东地区佛教艺术的杰作。'), updated_at = now()
 WHERE id = 530 AND city = 'gyeongju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Bae-dong Samneung Royal Tombs'), updated_at = now()
 WHERE id = 665 AND city = 'gyeongju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

-- 검증 게이트 — 기대 상태가 아니면 전체 롤백
DO $$
DECLARE en_cnt int; ja_cnt int; zh_cnt int;
BEGIN
  SELECT count(*) INTO en_cnt FROM city_spots
   WHERE id IN (425,432,436,439,444,454,457,462,468,473,475,481,530,665) AND coalesce(name_l10n,'{}'::jsonb) ? 'en';
  SELECT count(*) INTO ja_cnt FROM city_spots
   WHERE id IN (432,530) AND coalesce(name_l10n,'{}'::jsonb) ? 'ja';
  SELECT count(*) INTO zh_cnt FROM city_spots
   WHERE id IN (432,530) AND coalesce(name_l10n,'{}'::jsonb) ? 'zh';
  IF en_cnt <> 14 OR ja_cnt <> 2 OR zh_cnt <> 2 THEN
    RAISE EXCEPTION 'gyeongju l10n apply verification failed: en=% ja=% zh=%', en_cnt, ja_cnt, zh_cnt;
  END IF;
END $$;

COMMIT;
