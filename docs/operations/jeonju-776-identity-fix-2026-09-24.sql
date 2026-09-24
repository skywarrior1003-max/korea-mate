-- 전주 `메르밀진미집 본점`(city_spots id=776) 정체성 교정 — 주소 1필드
-- (JEONJU-776-PLACE-IDENTITY-CORRECTION-V1 · 2026-09-24)
--
-- 조사 결과 (2026-09-24, 원천 2+ 교차):
--   · 오염 실체 = **address 문자열 하나**. '향교길 11'은 인접(직선 ≈77m)
--     게스트하우스 `다나하루`의 주소다(야놀자·부킹 등 다수 확인).
--   · lat/lng(35.8111035, 127.1504062)는 트리플(35.8111326,127.1504397)·
--     식신(35.811129,127.150421)과 **±4m 일치 — 실제 음식점 위치라 무수정**.
--   · 실제 주소 = 전북특별자치도 전주시 완산구 **전주천동로 94**
--     (공식 원천: tour.jeonju.go.kr dataSid=17463 게시물 명시 + 다이닝코드·
--      식신·트리플 일치. 지번 전동 237).
--   · 전화 063-288-4020 확정이나 city_spots 에 phone 컬럼이 없어 저장 불가
--     (intake deferred 의 063-222-1000 은 전주시청 대표번호 — 오염값, 미반영 상태).
--   · external_id `jeonju:OFF-17463`·official_url(전주 공식 게시물)은 진짜
--     음식점 소개 원천이라 유지. image_url 은 직전 릴리스의 NULL 유지.
--
-- 경위: Final `jeonju-final-service-catalog-v1` 매칭이 provenance
--   `match_type: "AMBIGUOUS"` 로 주소·(과거)이미지·deferred phone 에 인접
--   숙소/시청 값이 결합됨. Final 원본은 Data Track 소유 — 여기서는 무수정,
--   candidate-corrections-jeonju-776-identity-v1.json 으로 전달.
--
-- 실행 계약: Owner 승인 절차의 일부로 정확히 1회. WHERE 는 PK+조사 시점
-- 원값 전체 일치 — 이미 바뀌었으면 0행이고 아무 것도 수정하지 않는다.
--
-- 롤백 참고(형식만 — '향교길 11' 은 확인된 오염값이라 기본 롤백 대상이 아니며,
-- image_url 은 어떤 롤백에서도 침대 이미지로 복원하지 않는다):
--   UPDATE public.city_spots SET address='전북특별자치도 전주시 완산구 향교길 11'
--    WHERE id=776 AND address='전북특별자치도 전주시 완산구 전주천동로 94';

BEGIN;

-- 수정 전 확인(정확히 1행이어야 함)
SELECT id, name, city, category, address, lat, lng, image_url, external_id
  FROM public.city_spots
 WHERE id = 776
   AND name = '메르밀진미집 본점'
   AND city = 'jeonju'
   AND category = 'restaurant'
   AND address = '전북특별자치도 전주시 완산구 향교길 11'
   AND image_url IS NULL
   AND lat = 35.8111035497203
   AND lng = 127.150406207841;

UPDATE public.city_spots
   SET address = '전북특별자치도 전주시 완산구 전주천동로 94'
 WHERE id = 776
   AND name = '메르밀진미집 본점'
   AND city = 'jeonju'
   AND category = 'restaurant'
   AND address = '전북특별자치도 전주시 완산구 향교길 11'
   AND image_url IS NULL
   AND lat = 35.8111035497203
   AND lng = 127.150406207841;

-- 수정 후 검증: 새 주소 1행·구 주소 0행·타 필드 불변
SELECT id, name, category, address, lat, lng, image_url, external_id, is_published
  FROM public.city_spots
 WHERE id = 776;

COMMIT;
