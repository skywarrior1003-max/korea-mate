-- jeonju-final-closeout-readback-v1.sql (READ-ONLY, 적용 직후)
-- 기대: total 236 · published 211 · excluded_unpub 25 · deleted 0(total 유지) · rel 224 · eligible 224 ·
--   prim 211 · spot_img 211 · published_without_img 0 · dup 0 · multi_prim 0 · https 224
select
 (select count(*) from public.city_spots c where lower(c.city)='jeonju') as total,
 (select count(*) from public.city_spots c where lower(c.city)='jeonju' and coalesce(c.is_published,false)) as published,
 (select count(*) from public.city_spots c where c.id in (792,793,794,808,809,810,817,820,830,831,836,838,843,855,860,869,885,886,887,902,903,904,905,908,909) and not coalesce(c.is_published,false)) as excluded_unpub,
 (select count(*) from public.city_spots c where c.id in (792,793,794,808,809,810,817,820,830,831,836,838,843,855,860,869,885,886,887,902,903,904,905,908,909)) as excluded_rows_kept,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju') as rel,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.display_eligible) as eligible,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.is_primary) as prim,
 (select count(*) from public.city_spots c where lower(c.city)='jeonju' and c.image_url is not null and c.image_url <> '') as spot_img,
 (select count(*) from public.city_spots c where lower(c.city)='jeonju' and coalesce(c.is_published,false)
   and not exists (select 1 from public.city_spot_images i where i.city_spot_id=c.id)) as published_without_img,
 (select count(*) from (select i.city_spot_id, i.image_url from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' group by 1,2 having count(*)>1) d) as dup,
 (select count(*) from (select i.city_spot_id from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.is_primary group by 1 having count(*)>1) m) as multi_prim,
 (select count(*) from public.city_spot_images i join public.city_spots c on c.id=i.city_spot_id where lower(c.city)='jeonju' and i.image_url like 'https://%') as https_rel;
