-- opening-hours-raw-fallback-readback-v1.sql (READ-ONLY, 적용 직후)
-- 기대: raw_set = precheck 의 target_null_hours · structured_preserved = 기존 structured 수(변화 0) ·
--   raw_overwrote_structured 0 · 도시 분포 = seoul/busan/gyeongju 만
select
 (select count(*) from public.city_spots c where c.opening_hours ? 'raw') as raw_set,
 (select count(*) from public.city_spots c where c.opening_hours is not null and not (c.opening_hours ? 'raw')) as structured_preserved,
 (select count(*) from public.city_spots c where (c.opening_hours ? 'raw') and (c.opening_hours ? 'open')) as mixed_rows,
 (select json_object_agg(city, n) from (select lower(city) as city, count(*) as n from public.city_spots where opening_hours ? 'raw' group by 1) x) as raw_by_city;
