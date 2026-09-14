-- jeonju-regional-l10n apply v1
-- 성격: 키 부재 시에만 추가(no-overwrite) · idempotent(재실행 0행) · 삭제/치환 0.
-- 대상: 749 전주한옥마을 ZH · 744 청연루·남천교 JA/ZH · 736 완산꽃동산 JA/ZH
-- 원천: visitjeonju 공식 /jpn·/cnh 편집 원문(2026-09-14 직접 확인, master jsonl 에 URL).
-- 복구: master jsonl 값과 일치할 때만 name_l10n/desc_l10n - '<key>' 로 제거.
BEGIN;

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('zh','全州韩屋村'), updated_at = now()
 WHERE id = 749 AND city = 'jeonju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('zh','全州韩屋村是在朝鲜王朝发源地——全州的历史背景中形成的，是韩国规模最大的韩屋聚落。即使在20世纪初近代建筑大量兴建的时期，居民们仍坚持韩屋生活，因此如今约700余栋韩屋依然完整地保存在城市中心。以太祖李成桂根脉所留的庆基殿为中心，古城巷道与生活文化交织在一起，被评价为最能代表韩国文化身份的象征性空间。瓦屋的线条、巷弄的韵味、石墙的呼吸自然衔接，使全州韩屋村成为少见的“活着的传统景观”。'), updated_at = now()
 WHERE id = 749 AND city = 'jeonju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('ja','晴煙樓・南川橋'), updated_at = now()
 WHERE id = 744 AND city = 'jeonju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ja','南川橋は全州川にかかる散策名所で、その上に建つ晴煙樓は川の風景を最も美しく眺められる楼閣です。欄干にもたれると、やわらかく流れる水面と季節ごとに表情を変える水辺の風景が広がります。春には桜が咲き誇り、夏には濃い緑が茂り、秋にはススキと紅葉が銀色・赤色に染まり、訪れる人の足を思わず止めます。晴煙樓から眺める景色は、静かに流れる全州の日常そのものです。'), updated_at = now()
 WHERE id = 744 AND city = 'jeonju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('zh','晴烟楼·南川桥'), updated_at = now()
 WHERE id = 744 AND city = 'jeonju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('zh','南川桥是跨越全州川的热门散步地点，而建在桥上的晴烟楼则是欣赏河景的最佳位置。靠在桥栏上，可以看到柔和流淌的河水，以及随着四季变化的静谧风景。春天樱花盛开，夏天绿意葱茏，秋天芦苇与红枫染成银色与红色，吸引行人驻足。站在晴烟楼上眺望，眼前展现的正是全州悠缓的日常节奏。'), updated_at = now()
 WHERE id = 744 AND city = 'jeonju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('ja','完山花山'), updated_at = now()
 WHERE id = 736 AND city = 'jeonju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ja','全州韓屋村から徒歩5分。そこには、まるで一幅の絵画のような風景が広がる「完山花山」があります。完山花山は桜や八重桜も美しいですが、見上げるほど背の高い巨大なツツジの群落が成す壮観は、まさに感嘆の一言に尽きます。'), updated_at = now()
 WHERE id = 736 AND city = 'jeonju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ja';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('zh','完山花山'), updated_at = now()
 WHERE id = 736 AND city = 'jeonju' AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'zh';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('zh','完山花山不仅樱花与重瓣樱花绚烂夺目，那远超头顶的巨型大踯躅花群落更是壮观得令人叹为观止。习惯了平时仅到腰部高度的踯躅花的人们，定会惊叹于这高过头顶、投下红色花阴的与众不同的踯躅花群落规模。'), updated_at = now()
 WHERE id = 736 AND city = 'jeonju' AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'zh';

DO $$
DECLARE zh_name int; ja_name int; zh_desc int; ja_desc int;
BEGIN
  SELECT count(*) INTO zh_name FROM city_spots WHERE id IN (749,744,736) AND coalesce(name_l10n,'{}'::jsonb) ? 'zh';
  SELECT count(*) INTO ja_name FROM city_spots WHERE id IN (744,736) AND coalesce(name_l10n,'{}'::jsonb) ? 'ja';
  SELECT count(*) INTO zh_desc FROM city_spots WHERE id IN (749,744,736) AND coalesce(desc_l10n,'{}'::jsonb) ? 'zh';
  SELECT count(*) INTO ja_desc FROM city_spots WHERE id IN (744,736) AND coalesce(desc_l10n,'{}'::jsonb) ? 'ja';
  IF zh_name <> 3 OR ja_name <> 2 OR zh_desc <> 3 OR ja_desc <> 2 THEN
    RAISE EXCEPTION 'jeonju l10n apply verification failed: zh_name=% ja_name=% zh_desc=% ja_desc=%', zh_name, ja_name, zh_desc, ja_desc;
  END IF;
END $$;

COMMIT;
