-- retired-place-minimal-restore v1 — **실행 금지**
-- 전제: Final authoritative 예외(재공개)는 Owner 결정 사항 — 결정 후 격리/운영 각각 정확 1회.
-- 대상 2행: 7 이기대(Igidae Coastal Walk — 참조 51 itineraries·2 user_spots 보존)·39 청사포 다릿돌전망대(참조 12).
-- 내용: ko 이름/본문(KTO verbatim) + unsplash placeholder 이미지 교체(값조건) + is_published 전환(조건부).
-- 29(이기대 이중 행·참조 17)는 복구하지 않고 비공개 유지 — 병합·삭제·ID 재부여 0.
-- 코스 연결(busan-C-002#12→7·busan-C-003#7→39)은 본 SQL 이 아니라 별도 JSON 커밋(공개 결정 후).
BEGIN;

-- 7 ← KTO 3008212 이기대해안산책로 (busan-C-002#12 이기대해안산책로)
UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('ko','이기대해안산책로'), updated_at = now()
 WHERE id = 7 AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'ko';
UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','이기대해안산책로는 부산국가 지질공원으로 지정되어 있는 곳으로 부산의 해안트레킹 코스인 부산 갈맷길의 2코스 구간이기도 하며, 동해를 바라보는 경관과 밀려드는 파도를 바라보는 경관이 빼어날 뿐 아니라 낚시꾼의 낚시터로 아주 좋은 곳이다. 동생말, 어울마당, 농바위, 오륙도 해맞이공원에 이르는 해안 산책로이며, 바위절벽, 구름다리, 데크로 길을 낸 곳으로 자연경관이 훌륭한 곳이다. 데크로  조성되어 있는 해안 산책로 곳곳에 전망대가 설치되어 있어 자연경관을 조망하기 좋으며, 해운대, 광안대교, 마린시티 등 부산의 명소들을 바라보며 걸을 수 있다. 해안산책로의 끝자락에 있는 해맞이공원에는 오륙도스카이워크가 설치되어 있어 많은 관광객이 찾는 곳이며, 오륙도, 영도 등을 조망할 수 있고, 오륙도에 들어가는 선착장도 있다.'), updated_at = now()
 WHERE id = 7 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';
UPDATE city_spots SET image_url = 'https://tong.visitkorea.or.kr/cms/resource/55/3008155_image2_1.JPG', updated_at = now()
 WHERE id = 7 AND image_url = 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600';
UPDATE city_spots SET is_published = true, updated_at = now()
 WHERE id = 7 AND is_published = false;

-- 39 ← KTO 2607943 청사포 다릿돌전망대 (busan-C-003#7 청사포다릿돌전망대)
UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('ko','청사포 다릿돌전망대'), updated_at = now()
 WHERE id = 39 AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'ko';
UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','2017년 8월 17일 개장한 청사포 다릿돌전망대는 해남부선 폐선부지를 산책로로 조성한 그린레일웨이에 있다. 도심 속 어촌인 청사포, 수려한 해안경관, 일출, 낙조 등을 감상할 수 있어 부산의 대표적인 관광명소로 꼽힌다. 
2024년 8월 길이 72.5m, 폭 3m 규모로 상판이 해수면에서 20m 높이에 바다 방향으로 쭉 뻗은 일자형에서 길이 191m, 폭 3m 규모 U자형으로 확장했다. 전망대 끝자락에는 반달 모양의 투명 바닥을 설치해 바다 위를 걷는 아슬아슬함을 느낄 수 있다.
전망대 바로 앞에서부터 해상 등대까지 가지런히 늘어선 5개의 암초인 다릿돌을 바라보며 청사포의 수려한 해안경관과 일출, 낙조의 자연 풍광을 감상할 수 있다. 

(출처 : 해운대구청)'), updated_at = now()
 WHERE id = 39 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';
UPDATE city_spots SET image_url = 'https://tong.visitkorea.or.kr/cms/resource/94/2941194_image2_1.bmp', updated_at = now()
 WHERE id = 39 AND image_url = 'https://source.unsplash.com/1200x800/?busan,skywalk,sea';
UPDATE city_spots SET is_published = true, updated_at = now()
 WHERE id = 39 AND is_published = false;

COMMIT;
-- rollback(값조건): ko 키 제거(WHERE 값 일치)·image_url 을 prev_image_placeholder 로 복귀·is_published=false 복귀.
