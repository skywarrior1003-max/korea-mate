-- gyeongju-owner-two-images-apply-v1.sql — 동궁과 월지(439)·경주세계자동차박물관(506)
-- 원천: gyeongju-official-image-provenance-v2.jsonl(경주시 gyeongju.go.kr 공식 이미지, Final 수집분)
-- 권리: Final 판정 VG_OFFICIAL_PUBLIC("Official gyeongju.go.kr attraction images 공공저작물")
-- identity: 기존 city_spot_sources(gyeongju-GJ01-0017→439 · gyeongju-GJ01-0093→506) — 재매칭 0
-- 동궁과 월지 primary = Owner 지정 야경(제안: moonCourse13.jpg — 아래 대안 주석, PROD 게이트에서 Owner 확정)
--   야경 대안: course01_img5-1.jpg · course01_img5-3.jpg · moonCourse14.jpg · bustago1-2.jpg
--            · unescoCourse19.jpg · bustago2-20.jpg · bustago2-21.jpg · pick2_img2.jpg · pick7_img18.jpg
-- idempotent: 동일 URL 존재 시 INSERT 생략 · image_url 은 계산된 primary 로 갱신
begin;
with new_imgs(spot_id, source_id, url, is_primary, sort_order) as (
 values
  (439, 15, 'https://www.gyeongju.go.kr/design/tour2019/img/sub/moonCourse13.jpg', true, 1),
  (506, 82, 'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img24.jpg', true, 1)
)
insert into public.city_spot_images
 (city_spot_id, image_url, rights_status, attribution_required, rights_note, display_eligible, is_primary, sort_order, source_id, as_of)
select n.spot_id, n.url, 'VG_OFFICIAL_PUBLIC', true,
 'Official gyeongju.go.kr attraction images (공공저작물) · OWNER-DESIGNATED (동궁과 월지=야경 고정)',
 true, n.is_primary, n.sort_order, n.source_id, date '2026-08-08'
from new_imgs n
where not exists (
 select 1 from public.city_spot_images i where i.city_spot_id = n.spot_id and i.image_url = n.url
);

update public.city_spots c
set image_url = n.url, updated_at = now()
from (values
  (439, 'https://www.gyeongju.go.kr/design/tour2019/img/sub/moonCourse13.jpg'),
  (506, 'https://www.gyeongju.go.kr/design/tour2019/img/sub/pick7_img24.jpg')
) as n(spot_id, url)
where c.id = n.spot_id
  and (c.image_url is null or c.image_url = '' or c.id = 439); -- 439 는 Owner 지정 primary 최우선(override 허용)
commit;
