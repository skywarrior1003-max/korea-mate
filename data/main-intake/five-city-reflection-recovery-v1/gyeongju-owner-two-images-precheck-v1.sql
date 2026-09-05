-- gyeongju-owner-two-images-precheck-v1.sql (READ-ONLY)
-- 기대: 두 행 모두 is_published=true · image_url null · rel_n=0 · source_id 15/82 존재
select c.id, c.name, c.is_published, c.image_url,
 (select count(*) from public.city_spot_images i where i.city_spot_id=c.id) rel_n,
 (select count(*) from public.city_spot_sources s where s.id in (15,82) and s.city_spot_id=c.id) src_ok
from public.city_spots c where c.id in (439,506) order by c.id;
