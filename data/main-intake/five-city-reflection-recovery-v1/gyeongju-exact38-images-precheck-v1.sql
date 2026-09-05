-- gyeongju-exact38-images-precheck-v1.sql (READ-ONLY)
-- 기대: 대상 38곳 전부 published · image_url null · relation 0 · primary 충돌 0
with t(spot_id) as (values (427),(428),(432),(440),(443),(444),(447),(456),(457),(461),(475),(480),(484),(490),(491),(492),(493),(494),(495),(496),(498),(502),(506),(507),(508),(513),(514),(519),(526),(528),(530),(532),(538),(539),(540),(543),(546),(548))
select count(*) targets,
 count(*) filter (where c.is_published) pub,
 count(*) filter (where c.image_url is not null and c.image_url<>'') has_img,
 count(*) filter (where exists (select 1 from public.city_spot_images i where i.city_spot_id=c.id)) has_rel
from t join public.city_spots c on c.id=t.spot_id;
