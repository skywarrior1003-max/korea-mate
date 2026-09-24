-- 전주 `메르밀진미집 본점`(city_spots id=776) 오사진 제거 — Production 준비 SQL
-- (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1 §7 · 2026-09-24)
--
-- 결함 (Production 실측 2026-09-24, 읽기 전용):
--   id=776 · name='메르밀진미집 본점' · city='jeonju' · category='restaurant'
--   image_url='https://tong.visitkorea.or.kr/cms/resource/42/2570942_image2_1.jpg'
--   → KTO CMS 콘텐츠 2570942 의 사진(침대·숙박 이미지)이 잘못 매핑돼 있다.
--   실제 장소는 전주 완산구 전주천동로 94 의 국수 음식점(외부 지도 대조 확인).
--
-- 역조회: 같은 2570942 계열 이미지를 쓰는 행은 776 하나뿐(오염 전파 없음).
--
-- 올바른 공식 이미지 확보 시도: KTO TourAPI searchKeyword('메르밀'·'진미집'·
-- '메르밀진미집 본점', contentTypeId=39) → 0건. 이 음식점은 KTO 콘텐츠가 없다.
-- 네이버·구글·블로그 사진 복제는 저작권상 금지(§7-5·7). → 잘못된 구체 사진보다
-- 중립 fallback 이 낫다(§7-6): image_url 을 NULL 로 두면 카드·상세가 기존
-- placeholder(placeholder-spot.svg)로 렌더된다.
--
-- 실행 계약:
--   · Owner 승인 후 Production SQL Editor / Management API 로 정확히 1회.
--   · WHERE 가 현재 오염값과 정확히 일치할 때만 갱신 — 이미 고쳐졌으면 0행.
--   · 적용 후 /place/776 은 SSG 베이크라 **재빌드 후 배포가 있어야 상세에 반영**
--     (검색 카드 등 DB 실시간 경로는 즉시 반영).
--
-- 롤백(필요 시): 아래 UPDATE 의 SET/WHERE 값을 맞바꿔 1회 실행.

UPDATE public.city_spots
   SET image_url = NULL
 WHERE id = 776
   AND name = '메르밀진미집 본점'
   AND city = 'jeonju'
   AND image_url = 'https://tong.visitkorea.or.kr/cms/resource/42/2570942_image2_1.jpg';

-- 검증(적용 직후):
--   SELECT id, name, image_url FROM public.city_spots WHERE id = 776;
--   → image_url IS NULL 이어야 한다.
