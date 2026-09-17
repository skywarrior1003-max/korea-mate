-- haeridan-street-insert v1 — 실행 금지(Owner 승인 후 격리/운영 각각 정확 1회)
-- 거리 본체 신규 1행: 해리단길(KTO contentid 2783306 — 이름·주소·좌표·본문·대표이미지 verbatim).
-- 카탈로그 전수(이름·비공개·좌표 근접) 검색에서 거리 본체 부재 실측(2026-09-17) — 1633(매장)과 별개 entity.
-- is_published=false 로만 삽입 · id 실행시점 발급 · external_id 중복 가드.
BEGIN;

WITH src (city, name, category, address, lat, lng, image_url, name_l10n, desc_l10n, source_type, external_id, is_published) AS (
 VALUES
  ('busan', '해리단길', 'attraction', '부산 해운대구 우동 510-7', 35.1648388507, 129.1576008763, 'https://tong.visitkorea.or.kr/cms/resource/37/3492437_image2_1.jpg', jsonb_build_object('ko','해리단길'), jsonb_build_object('ko','부산 해운대 도시철도역 4번 출구에서 옛 해운대 기차역 뒤편 기찻길을 건너면 해리단길이 시작된다. 해리단길은 서울의 경리단길에서 아이디어를 얻은 이름이다. 좁은 도로를 따라 다양한 개성의 카페와 음식점들이 속속 생겨나면서 해운대 인기 명소로 자리매김했다.
골목길 담벼락에 그려진 위트 넘치는 벽화를 비롯해 자유로운 거리 분위기를 즐길 수 있어 시민들은 물론 관광객들도 일부러 찾아오는 곳이다. 사진 찍기 좋은 아기자기한 외관의 카페와 식당, 색다른 기념품을 판매하는 소품샙, 비정기적으로 열리는 플리마켓 등 다채로운 볼거리가 발길을 끌어모은다.'), 'tourapi', 'kto:2783306', false)
), numbered AS (
 SELECT s.*, (SELECT COALESCE(MAX(id),0) FROM city_spots) + 1 AS new_id FROM src s
)
INSERT INTO city_spots (id, city, name, category, address, lat, lng, image_url, name_l10n, desc_l10n, source_type, external_id, is_published, solo_friendly, foreign_card_accepted, cash_only)
SELECT new_id, city, name, category, address, lat, lng, image_url, name_l10n, desc_l10n, source_type, external_id, is_published, true, true, false
  FROM numbered n
 WHERE NOT EXISTS (SELECT 1 FROM city_spots e WHERE e.external_id = n.external_id)
RETURNING id, name, external_id;

COMMIT;
-- 운영 단계: ① insert(비공개) → ② Owner 공개 → ③ busan-C-003#5 해리단길 stop 연결(external_id 'kto:2783306' 로 발급 id 조회) → ④ 재빌드.
