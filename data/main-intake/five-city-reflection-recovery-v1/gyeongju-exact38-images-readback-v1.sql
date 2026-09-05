-- gyeongju-exact38-images-readback-v1.sql (READ-ONLY)
-- 기대: relations 84 · primary(단일) 19 · image_url 19 · 경주 총 relation = 274+84
with t(spot_id) as (values (427),(428),(432),(440),(443),(444),(447),(456),(457),(461),(475),(480),(484),(490),(491),(492),(493),(494),(495),(496),(498),(502),(506),(507),(508),(513),(514),(519),(526),(528),(530),(532),(538),(539),(540),(543),(546),(548))
select count(*) filter (where exists (select 1 from public.city_spot_images i where i.city_spot_id=c.id)) spots_with_rel,
 (select count(*) from public.city_spot_images i join t on t.spot_id=i.city_spot_id) rel_rows,
 count(*) filter (where c.image_url is not null and c.image_url<>'') img_url_set,
 (select count(*) from public.city_spot_images i join t on t.spot_id=i.city_spot_id where i.is_primary) primaries
from t join public.city_spots c on c.id=t.spot_id;
select count(*) as gyeongju_rel_total from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='gyeongju';
