-- jeonju-images-full-readback-v2.sql (READ-ONLY, 적용 직후)
-- 기대: eligible 224 · rel 224 · prim 211 · spot_img 211 · https 224 ·
--   dup 0 · multi_prim 0 · published 211(변화 0) · 잔여 무이미지 25곳
select
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju') as rel,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.display_eligible) as eligible,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.is_primary) as prim,
 (select count(*) from public.city_spots c where lower(c.city)='jeonju' and c.image_url is not null and c.image_url <> '') as spot_img,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.image_url like 'https://%') as https_rel,
 (select count(*) from (select i.city_spot_id, i.image_url from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' group by 1,2 having count(*)>1) d) as dup,
 (select count(*) from (select i.city_spot_id from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.is_primary group by 1 having count(*)>1) m) as multi_prim,
 (select count(*) from public.city_spots c where lower(c.city)='jeonju' and coalesce(c.is_published,false)) as published,
 (select count(*) from public.city_spots c where lower(c.city)='jeonju' and not exists (select 1 from public.city_spot_images i where i.city_spot_id=c.id)) as spots_without_img;
