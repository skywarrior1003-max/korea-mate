# TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**

---

## 1. 검토 방법

전체 173건의 `title_ko` + `address` 필드를 직접 검토하여 분류 결정.
URL 방문(Playwright) 없이 텍스트 기반 검토 완료.
(URL 방문이 필요한 항목은 `manual_review`로 분류)

---

## 2. 상태별 건수

| review_status | shopping | experience | 합계 |
|---|---|---|---|
| ready_for_candidate | 31 | 85 | 116 |
| duplicate_suspected | 11 | 8 | 19 |
| reference_only | 3 | 15 | 18 |
| manual_review | 2 | 10 | 12 |
| exclude_non_place | 6 | 2 | 8 |
| **합계** | **53** | **120** | **173** |

---

## 3. ready_for_candidate category 분포

| category | 건수 |
|---|---|
| attraction | 87 |
| restaurant | 5 |
| nature | 21 |
| event | 3 |
| **합계** | **116** |

### subcategory 분포 (주요)

| subcategory | 건수 |
|---|---|
| department_store | 7 |
| craft_workshop | 6 |
| shopping_mall | 4 |
| retail_store | 4 |
| walking_trail | 4 |
| lifestyle_shop | 3 |
| specialty_shop | 3 |
| souvenir_shop | 3 |
| duty_free | 3 |
| cooking_class | 3 |
| perfume_workshop | 3 |
| water_sports | 3 |
| shopping_street | 2 |
| theater | 2 |
| pet_park | 2 |
| dog_park | 2 |
| theme_cafe | 2 |
| wellness_center | 2 |
| camping | 2 |
| craft_center | 2 |
| water_sports_center | 2 |
| spa_sauna | 2 |
| character_shop | 1 |
| market | 1 |
| museum | 1 |
| ecological_site | 1 |
| escape_room | 1 |
| lifestyle_space | 1 |
| fishing_village | 1 |
| esports_arena | 1 |
| sports_bar | 1 |
| climbing_gym | 1 |
| pet_center | 1 |
| pet_cafe | 1 |
| pet_store | 1 |
| lighthouse | 1 |
| experience_center | 1 |
| bakery_experience | 1 |
| seafood_experience | 1 |
| digital_art_museum | 1 |
| food_experience | 1 |
| beach_cinema | 1 |
| ice_rink | 1 |
| upcycling_workshop | 1 |
| dance_experience | 1 |
| indoor_entertainment | 1 |
| forest_trail | 1 |
| drone_show | 1 |
| art_workshop | 1 |
| tea_class | 1 |
| cultural_center | 1 |
| theme_park | 1 |
| adventure_ride | 1 |
| river_cruise | 1 |
| art_museum | 1 |
| diving | 1 |
| ecological_park | 1 |
| children_museum | 1 |
| folk_village | 1 |
| art_center | 1 |
| observatory | 1 |
| cultural_village | 1 |
| aquarium | 1 |
| children_theme_park | 1 |
| martial_arts | 1 |
| outdoor_activity | 1 |
| ecological_tour | 1 |
| surfing_school | 1 |
| street_performance | 1 |
| yacht_tour | 1 |
| temple_stay | 1 |
| farm_experience | 1 |

---

## 4. duplicate_suspected (19건)

| 유형 | 건수 |
|---|---|
| accommodation (호텔·리조트) | 7 |
| market (시장·상권) | 11 |
| 기타 (탐방선 중복 등) | 1 |

---

## 5. exclude_non_place (8건) — 주요 유형

- 기간 선정 리스트 콘텐츠 ("부산관광기념품10선" 3건)
- 복수 장소 가이드 ("부산 백화점에 놀러가자!" 등)
- 브랜드 홍보·행사 후기 (주소 없음)
- 제목 미완성 콘텐츠

---

## 6. manual_review (12건) — 확인 필요 이유

| candidate_id | 사유 |
|---|---|
| busan-VB-2581 | 제목 "바다처럼" — 업종·장소 식별 불가, 주소만 존재 |
| busan-VB-2579 | 제목 미완성("달콤한 부산의 매력,"), 주소는 있으나 업종 불명 |
| busan-VB-2245 | 놀핏 노르딕 워킹 — 오퍼레이터 주소, 실제 산책 장소 별도 확인 필요 |
| busan-VB-1899 | "낙동강 감동포구 생태 어드벤처" — 주소 없음, 포구 이름 불명확 |
| busan-VB-1874 | 플로깅 투어 — 투어 오퍼레이터 주소, 고정 체험 장소 별도 확인 필요 |
| busan-VB-1870 | 업사이클 체험, 강서구 산단 주소 — 공방인지 공장인지 불명 |
| busan-VB-1859 | K-POP 댄스학원 소개 — 체험 공간인지 학원인지 불명 |
| busan-VB-1695 | "우시산 인 부산" — 수영구 주소, 업종(찻집·갤러리?) 불명 |
| busan-VB-1177 | 아트다 아트(아난티코브 미디어아트관?) — 호텔 부속 시설 여부 확인 필요 |
| busan-VB-518 | 부산 로컬푸드 쿠킹클래스(서구 구덕로 186번길 1) — VB-481(15번지)과 같은 거리, 동일 시설 여부 확인 필요 |
| busan-VB-481 | 직접 만드는 한국의 맛(서구 구덕로 186번길 15) — VB-518과 같은 거리, 동일 시설 여부 확인 필요 |
| busan-VB-542 | "다누비열차" — 주소 없음, 낙동강 생태열차 여부 별도 확인 필요 |

---

## 7. 새 category 필요성

| 제안 category | 해당 건수 | 현재 임시 매핑 | 이유 |
|---|---|---|---|
| shopping | 31 | attraction | 백화점·면세점·소품샵은 attraction과 의미 차이 명확 |
| outdoor_activity | 6 | nature | 서핑·카약·클라이밍 등 스포츠는 자연 방문과 목적 상이 |

> 이번 태스크에서 신규 category 적용 금지 원칙 준수. 위 유형은 5개 기존 category 내 최적 매핑으로 처리.

---

## 8. 검증 조건

| 조건 | 결과 |
|---|---|
| shopping 53 + experience 120 = 173건 전부 추적 | ✓ |
| 상태별 합계 173건 | ✓ |
| ready_for_candidate category 허용값 위반 0 | ✓ |
| subcategory 공백 0 | ✓ |
| 원본 integrated candidates 무변경 | ✓ (읽기 전용) |
| 운영 DB 미반영 | ✓ |

---

## 9. 생성 파일

| 파일 | 내용 |
|---|---|
| busan-unknown-category-review.csv | 173건 분류 결과 |
| busan-unknown-category-review-metrics.json | 지표 요약 |
| busan-unknown-category-review-07-report.md | 본 보고서 |

---

TASK-DATA-BUSAN-UNKNOWN-CATEGORY-REVIEW-07 unknown_allowed 분류 검토 완료.
