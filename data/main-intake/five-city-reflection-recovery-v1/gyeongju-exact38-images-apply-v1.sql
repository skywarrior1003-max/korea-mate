-- gyeongju-exact38-images-apply-v1.sql — PROVENANCE-EXACT-MATCH-RECOVERY-PREP-V1
-- 원천: gyeongju-official-image-provenance-v2(blob 799efb73…, gyeongju.go.kr 공식) ×
--       관광지명 EXACT UNIQUE match(NFC·trim·공백축약만) — fuzzy/부분일치/의미매칭 0
-- 대상: EXACT_UNIQUE 38곳 / 이미지 relation 84행 · primary+image_url 은 단일이미지 19곳만
--       (다중이미지 19곳은 relation 만 — primary 는 Owner 규칙 확정 게이트)
-- 권리: VG_OFFICIAL_PUBLIC(공공저작물, Final 판정 그대로) · identity: 기존 city_spot_sources.candidate_id
-- idempotent: 동일 URL 존재 시 skip · 실행은 별도 Owner 승인 PROD-SQL 태스크 1회
begin;
with new_imgs(spot_id, source_id, url, is_primary, sort_order) as (
 values
 (427,3,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/yusin4.jpg',false,1),
 (427,3,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/yusin5.jpg',false,2),
 (427,3,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-3.jpg',false,3),
 (427,3,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-4.jpg',false,4),
 (427,3,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-5.jpg',false,5),
 (427,3,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-6.jpg',false,6),
 (428,4,'https://www.gyeongju.go.kr/design/tour2019/img/sub/escape_13.jpg',true,1),
 (432,8,'https://www.gyeongju.go.kr/design/tour2019/img/sub/mujang2-1.jpg',true,1),
 (440,16,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_03.jpg',false,1),
 (440,16,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_04.jpg',false,2),
 (440,16,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_05.jpg',false,3),
 (440,16,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_06.jpg',false,4),
 (440,16,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_07.jpg',false,5),
 (440,16,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_08.jpg',false,6),
 (443,19,'https://www.gyeongju.go.kr/design/tour2019/img/sub/escape_18.jpg',true,1),
 (444,20,'https://www.gyeongju.go.kr/design/tour2019/img/sub/bustago3-7.jpg',false,1),
 (444,20,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp6.gif',false,2),
 (447,23,'https://www.gyeongju.go.kr/design/tour2019/img/sub/escape_12.jpg',true,1),
 (456,32,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-30.jpg',false,1),
 (456,32,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-32.jpg',false,2),
 (456,32,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-33.jpg',false,3),
 (456,32,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202601-34.jpg',false,4),
 (457,33,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp3.gif',true,1),
 (461,37,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/tvSun25.jpg',true,1),
 (475,51,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp9.gif',true,1),
 (480,56,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn16.jpg',false,1),
 (480,56,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn19.jpg',false,2),
 (480,56,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn20.jpg',false,3),
 (484,60,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_36.jpg',false,1),
 (484,60,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_42.jpg',false,2),
 (484,60,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_43.jpg',false,3),
 (484,60,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_44.jpg',false,4),
 (484,60,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_45.jpg',false,5),
 (484,60,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_46.jpg',false,6),
 (490,66,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_02.jpg',false,1),
 (490,66,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_19.jpg',false,2),
 (490,66,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_20.jpg',false,3),
 (490,66,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_21.jpg',false,4),
 (491,67,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202608-22.jpg',false,1),
 (491,67,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202608-23.jpg',false,2),
 (492,68,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202606_23.jpg',false,1),
 (492,68,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_14.jpg',false,2),
 (492,68,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_15.jpg',false,3),
 (493,69,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202604-39.png',false,1),
 (493,69,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202606_15.jpg',false,2),
 (494,70,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_22.jpg',false,1),
 (494,70,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_23.jpg',false,2),
 (494,70,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_24.jpg',false,3),
 (495,71,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_17.jpg',true,1),
 (496,72,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_18.jpg',true,1),
 (498,74,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick6_img7.jpg',true,1),
 (502,78,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tvImg53.jpg',true,1),
 (506,82,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img24.jpg',true,1),
 (507,83,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img25.jpg',true,1),
 (508,84,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img26.jpg',true,1),
 (513,89,'https://www.gyeongju.go.kr/design/tour2019/img/sub/petCourse26.jpg',true,1),
 (514,90,'https://www.gyeongju.go.kr/design/tour2019/img/sub/petCourse24.jpg',true,1),
 (519,95,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202602_41.png',true,1),
 (526,102,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp13.gif',true,1),
 (528,104,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202603_24.jpg',false,1),
 (528,104,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp12.gif',false,2),
 (530,106,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp14.gif',true,1),
 (532,108,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_37.jpg',false,1),
 (532,108,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_38.jpg',false,2),
 (532,108,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_39.jpg',false,3),
 (532,108,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_40.jpg',false,4),
 (532,108,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_41.jpg',false,5),
 (538,114,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn8.jpg',false,1),
 (538,114,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn9.jpg',false,2),
 (538,114,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn10.jpg',false,3),
 (538,114,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn11.jpg',false,4),
 (538,114,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/autumn12.jpg',false,5),
 (539,115,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202603_20.jpg',false,1),
 (539,115,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202603_22.jpg',false,2),
 (540,116,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_24.jpg',false,1),
 (540,116,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp8.gif',false,2),
 (543,119,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_28.jpg',false,1),
 (543,119,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202605_29.jpg',false,2),
 (546,122,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202606_02.jpg',false,1),
 (546,122,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp7.gif',false,2),
 (548,124,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202603_14.jpg',false,1),
 (548,124,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202603_15.jpg',false,2),
 (548,124,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202603_16.jpg',false,3),
 (548,124,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp16.gif',false,4)
)
insert into public.city_spot_images
 (city_spot_id, image_url, rights_status, attribution_required, rights_note, display_eligible, is_primary, sort_order, source_id, as_of)
select n.spot_id, n.url, 'VG_OFFICIAL_PUBLIC', true,
 'Official gyeongju.go.kr attraction images (공공저작물) · EXACT_UNIQUE name match',
 true, n.is_primary, n.sort_order, n.source_id, date '2026-08-08'
from new_imgs n
where not exists (select 1 from public.city_spot_images i where i.city_spot_id=n.spot_id and i.image_url=n.url)
  and not (n.is_primary and exists (select 1 from public.city_spot_images i2 where i2.city_spot_id=n.spot_id and i2.is_primary));

update public.city_spots c
set image_url = p.url, updated_at = now()
from (values
 (428,'https://www.gyeongju.go.kr/design/tour2019/img/sub/escape_13.jpg'),
 (432,'https://www.gyeongju.go.kr/design/tour2019/img/sub/mujang2-1.jpg'),
 (443,'https://www.gyeongju.go.kr/design/tour2019/img/sub/escape_18.jpg'),
 (447,'https://www.gyeongju.go.kr/design/tour2019/img/sub/escape_12.jpg'),
 (457,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp3.gif'),
 (461,'https://www.gyeongju.go.kr/design/tour2019/img/sub/course/tvSun25.jpg'),
 (475,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp9.gif'),
 (495,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_17.jpg'),
 (496,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202607_18.jpg'),
 (498,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick6_img7.jpg'),
 (502,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tvImg53.jpg'),
 (506,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img24.jpg'),
 (507,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img25.jpg'),
 (508,'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img26.jpg'),
 (513,'https://www.gyeongju.go.kr/design/tour2019/img/sub/petCourse26.jpg'),
 (514,'https://www.gyeongju.go.kr/design/tour2019/img/sub/petCourse24.jpg'),
 (519,'https://www.gyeongju.go.kr/design/tour2019/img/sub/tMonth_2026/202602_41.png'),
 (526,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp13.gif'),
 (530,'https://www.gyeongju.go.kr/design/tour2019/img/sub/stamp14.gif')
) as p(spot_id, url)
where c.id = p.spot_id and (c.image_url is null or c.image_url = '');
commit;
