-- naksan-three-inserts v1 — 실행 금지(Owner 승인 후 격리/운영 각각 정확 1회)
-- STO 공식 코스 KON000645 의 5 stop 중 공식 자료가 확보된 3곳(KTO verbatim):
--   흥인지문(126514) · 한양도성박물관(1939691) · 낙산공원(129501)
-- 이화마을·혜화문은 확인 원천(KTO 별칭 5종·STO 코스 페이지·VisitSeoul 검색)에서
-- 공식 설명·이미지 미확보 — name-only 유지(발명 금지). 카탈로그 전수(이름·별칭·좌표±300m·bridge) 본체 부재 실측.
-- 규칙: is_published=false 전용 · id 실행시점 발급 · external_id 중복 가드.
BEGIN;

WITH src (city, name, category, address, lat, lng, image_url, name_l10n, desc_l10n, source_type, external_id, is_published) AS (
 VALUES
  ('seoul', '흥인지문', 'attraction', '서울특별시 종로구 종로 288 (종로6가)', 37.5712209291, 127.0097180432, 'http://tong.visitkorea.or.kr/cms/resource/27/2536327_image2_1.jpg', jsonb_build_object('ko','흥인지문'), jsonb_build_object('ko','흥인지문은 서울성곽 8개의 문 가운데 동쪽에 있는 문으로 서울성곽은 서울 한양도성의 옛 이름이며 옛날 중요한 국가시설이 있는 한성부를 보호하기 위해 만들었다. 동쪽에 있는 큰 문이라 하여 동대문이라고도 부른다. 조선 태조 5년(1396) 도성 축조 때 건립했으며 단종 원년(1453)에 고쳐 지었고, 지금 있는 문은 고종 6년(1869)에 새로 지은 것이다. 앞면 5칸, 옆면 2칸 규모의 2층 건물이고 지붕은 앞면에서 볼 때 사다리꼴모양을 한 우진각 지붕이다. 지붕 처마를 받치기 위해 장식하여 만든 공포가 기둥 위뿐만 아니라 기둥 사이에도 있는 다포 양식인데, 그 형태가 가늘고 약하며 장식한 부분이 많아 조선 후기의 특징을 잘 나타내주고 있다. 또한 바깥쪽으로는 성문을 보호하고 튼튼히 지키기 위하여 반원 모양의 옹성을 쌓았다. 이는 적을 공격하기에 합리적으로 계획된 시설이라고 할 수 있다. 흥인지문은 도성의 8개 성문중에서 유일하게 옹성을 갖추고 있으며, 조선 후기 건축 양식을 잘 나타내고 있다.
수도권 지하철 1호선, 4호선 동대문역 9번 출구 바로 옆에 있다. 도보로 5분 거리에 성곽공원과 한양도성박물관이 있고 DDP와 동대문시장 등의 서울 명소가 있어서 같이 돌아보면 좋다.'), 'tourapi', 'kto:126514', false),
  ('seoul', '한양도성박물관', 'attraction', '서울특별시 종로구 율곡로 283 (종로6가)', 37.57285717668249, 127.00851288421596, 'https://tong.visitkorea.or.kr/cms/resource/53/3505653_image2_1.jpg', jsonb_build_object('ko','한양도성박물관'), jsonb_build_object('ko','서울 한양도성은 조선왕조 도읍지인 한성부의 경계를 표시하고 수도의 권위를 드러내며 외부의 침입을 방어하기 위해 1396년 축조된 도시 규모의 성곽유산이다. 평균 높이 약 5~8m, 전체 길이 약 18.6㎞에 이르는 한양도성은 한국의 고유 축성기법과 집단 장인 기술을 바탕으로 구축된 역사 문화 도시 서울의 랜드마크이다. 또한, 현존하는 전 세계의 도성 중 가장 규모가 크고 오랫동안 도성 기능을 수행한 문화유산으로 천만 서울 시민을 넘어서 서울을 찾는 내·외국인들이 즐겨 찾는 대표 명소이다. 흥인지문공원에 위치한 한양도성박물관은 조선시대부터 현재에 이르기까지 한양도성의 역사와 문화를 담은 박물관으로 상설전시실, 기획전시실, 한양도성 자료실과 학습실을 갖춘 문화공간이다. 한양도성박물관에서 600년 한양도성의 역사와 문화유산으로서의 미래가치를 확인할 수 있다.'), 'tourapi', 'kto:1939691', false),
  ('seoul', '낙산공원', 'attraction', '서울특별시 종로구 낙산길 41', 37.5805179476871, 127.006496092905, 'https://tong.visitkorea.or.kr/cms/resource/28/3506728_image2_1.jpg', jsonb_build_object('ko','낙산공원'), jsonb_build_object('ko','낙산공원은 대학로와 동대문으로부터 이어지며 역사와 문화를 함께 즐길 수 있는 공원이다. 낙산은 지형이 낙타의 등처럼 생겨 낙타산이라고도 했고, 궁에 우유를 보급하던 왕실 목장이 있어 타락산이라고도 불렀다. 1960년대 이후 시민아파트와 밀집된 주택으로 낙산 본래의 모습이 사라지게 되었고, 서울시가 낙산 복원계획을 수립하였다. 이 계획의 일환으로 공원화 사업이 진행되어 2002년 7월 낙산공원으로 개원하였다. 낙산공원 중앙광장에는 낙산전시관과 중앙무대, 매점 등이 있어서 쉬어가기 좋고 광장 바로 아래 주차장이 있어서 중앙광장으로 오기도 편하다. 낙산전시관은 낙산공원 입구에 있는 시설물로 낙산의 유래, 역사적 인물, 한양도성의 사진 자료 및 모형이 전시되어 낙산공원을 방문하는 시민들에게 다양한 정보를 제공한다. 주말에는 낙산과 서울한양도성에 관한 공원 이용 프로그램이 운영되며, 누구나 무료로 이용할 수 있다. 광장 한쪽으로는 낙산정이 있다. 낙산정은 낙산을 복원하면서 만든 정자로 서울의 전경이 한눈에 보이는 전망 좋은 곳이다.  
서울한양도성과 푸른 숲이 어우러져 아름다운 정취를 느낄 수 있는 시민의 휴식 공간으로 자리매김하였으며, 서울에서 가장 아름다운 야경을 볼 수 있는 곳으로 각광받고 있다. 언덕 정상에서 주택과 벽화가 있는 이화동 벽화마을로 갈 수 있고 흥인지문과 한양도성길로 가는 동대문 코스, 외부 성곽 벽면 전체를 보면서 걸을 수 있는 한성대 입구 방면 코스 등 다양한 코스가 있다. ◎ 한류의 매력을 만나는 여행 정보 - 애니메이션 
넷플릭스 애니메이션 ‘케이팝 데몬 헌터스’에서 루미와 진우가 대화를 나누며 걷던 장소 중 하나가 바로 이곳이다. 성곽 너머로 펼쳐지는 서울의 도시 풍경이 인상적으로 담겨, 애니메이션 속 감성을 더욱 깊이 있게 전한다. 실제로 방문하면 고즈넉한 성곽길과 함께 서울의 전경을 한눈에 내려다볼 수 있어 특별한 경험을 선사한다.'), 'tourapi', 'kto:129501', false)
), numbered AS (
 SELECT s.*, (SELECT COALESCE(MAX(id),0) FROM city_spots) + row_number() OVER () AS new_id FROM src s
)
INSERT INTO city_spots (id, city, name, category, address, lat, lng, image_url, name_l10n, desc_l10n, source_type, external_id, is_published, solo_friendly, foreign_card_accepted, cash_only)
SELECT new_id, city, name, category, address, lat, lng, image_url, name_l10n, desc_l10n, source_type, external_id, is_published, true, true, false
  FROM numbered n
 WHERE NOT EXISTS (SELECT 1 FROM city_spots e WHERE e.external_id = n.external_id)
RETURNING id, name, external_id;

COMMIT;
-- 운영 단계: insert(비공개) → external_id readback → Owner 공개 → 코스 연결(apply-new-place-links --plan naksan) → 재빌드.
