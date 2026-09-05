-- gyeongju-owner-two-images-readback-v1.sql (READ-ONLY)
-- 기대: 각 1 relation(display_eligible·is_primary) · image_url = 지정 URL · 다른 행 영향 0
select c.id, c.name, substring(c.image_url,1,70) img,
 (select count(*) from public.city_spot_images i where i.city_spot_id=c.id) rel_n,
 (select count(*) from public.city_spot_images i where i.city_spot_id=c.id and i.is_primary and i.display_eligible) prim
from public.city_spots c where c.id in (439,506) order by c.id;
select count(*) as gyeongju_img_total from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='gyeongju';
