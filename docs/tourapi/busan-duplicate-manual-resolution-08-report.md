# TASK-DATA-BUSAN-DUPLICATE-MANUAL-RESOLUTION-08 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**

---

## 1. 판정 결과 요약

| 최종 상태 | 건수 |
|---|---|
| merge_existing | 9 |
| ready_for_candidate | 12 |
| reference_only | 2 |
| exclude_non_place | 0 |
| unresolved | 8 |
| **합계** | **31** |

---

## 2. merge_existing 9건

| candidate_id | title_ko | merge_target | 유형 | 보강 필드 |
|---|---|---|---|---|
| busan-VB-399 | 골목골목 와글와글 국제시장 | busan-K-00058 | canonical | hours, phone, source_detail_url |
| busan-VB-412 | 오이소! 보이소! 사이소! 자갈치시장 | busan-K-00057 | canonical | hours, phone, source_detail_url |
| busan-VB-400 | 부산 먹방의 성지 부평깡통시장 | busan-K-00176 | canonical | hours, phone, source_detail_url |
| busan-VB-363 | 어머, 구포장날은 꼭 가봐야 해! | busan-K-00148 | canonical | hours, phone, source_detail_url |
| busan-VB-327 | 기억의 장터 부전마켓타운 | busan-K-00055 | canonical | hours, phone, source_detail_url |
| busan-VB-300 | 영도 토박이 남항시장 & 봉래시장 | busan-K-00190 | canonical | hours, phone, source_detail_url, address(봉래시장 추가) |
| busan-VB-1858 | 파라다이스 호텔 부산에서 즐기는 프리미엄 체험 | busan-K-00078 | canonical | hours, phone, external_official_url, source_detail_url |
| busan-VB-990 | 탐방선과 자전거로 즐기는 재미있는 생태여행 | busan-VB-336 | vb_candidate | source_detail_url(자전거 프로그램 추가) |
| busan-VB-481 | 직접 만드는 한국의 맛! | busan-VB-518 | vb_candidate | source_detail_url |

> merge_to_canonical: 7건, merge_to_vb_candidate: 2건

**오참조 수정 사항:**
- busan-VB-412(자갈치시장): 이전 참조 busan-E-00011(자갈치축제) → 정정 busan-K-00057(부산 자갈치시장)
- busan-VB-363(구포장): 이전 참조 busan-A-00042(구포어린이교통공원) → 정정 busan-K-00148(구포시장)
- busan-VB-293(민락회타운): 이전 참조 busan-A-00026(민락수변공원) → 별개 장소 확인 → ready_for_candidate로 변경

---

## 3. ready_for_candidate 12건

| candidate_id | title_ko | category | subcategory |
|---|---|---|---|
| busan-VB-422 | 동래여행의 깨알 즐거움, 동래시장 | attraction | market |
| busan-VB-328 | 빛나는 서면시장 | attraction | market |
| busan-VB-294 | 텔레비전에 나온 시장맛집 해운대시장 | restaurant | food_market |
| busan-VB-293 | 광안리 바다의 참맛 민락회타운 | restaurant | seafood_market |
| busan-VB-292 | 좌판의 힘 기장시장 | attraction | market |
| busan-VB-2277 | 자연의 편안함을 품은 료칸 호텔, ‘이제 부산’ | accommodation | boutique_hotel |
| busan-VB-2273 | 기장 오션뷰를 품은 화려한 특급호텔, ‘아난티  코브’ | accommodation | luxury_resort |
| busan-VB-2270 | 송도 바다를 품은 럭셔리 스테이, 윈덤 그랜드 부산 | accommodation | luxury_hotel |
| busan-VB-2243 | 해운대 도심 속 화려한 웰니스, ‘파크 하얏트 부산’ | accommodation | luxury_hotel |
| busan-VB-1695 | 우시산 인 부산 | attraction | cultural_space |
| busan-VB-1680 | 해운대 한눈에 담은 프리미엄 스파&워터파크 클럽디오아시스 | attraction | spa_waterpark |
| busan-VB-518 | 부산 로컬푸드 쿠킹클래스 | restaurant | cooking_class |

**신규 확정 주요 사항:**
- accommodation 신규: 4건 (이제 부산 료칸, 아난티코브 호텔, 윈덤 그랜드, 파크 하얏트)
- 시장 신규: 5건 (동래시장, 서면시장, 해운대시장, 민락회타운, 기장시장)
- 클럽디오아시스: 엘시티 레지던스(busan-K-00675)와 동일 건물이나 별도 스파&워터파크 시설 → attraction 신규
- 우시산 인 부산: 비콘그라운드 내 확인된 문화 공간 → attraction/cultural_space

---

## 4. reference_only 2건

| candidate_id | title_ko | 사유 |
|---|---|---|
| busan-VB-2245 | 부산 곳곳에서 경험하는 노르딕 워킹, ‘놀핏’ | 이동형 투어 프로그램, 고정 방문 장소 아님 |
| busan-VB-1874 | 플로깅 투어하러 롤로와, 영도! | 이동형 투어 프로그램, 고정 방문 장소 아님 |

---

## 5. unresolved 8건

| candidate_id | title_ko | unresolved 사유 |
|---|---|---|
| busan-VB-2581 | 바다처럼 | "바다처럼"(해운대구 우동1로38번길 15-1 1층): 주소는 있으나 상호 "바다처럼"만으로 업종(카페/쇼핑... |
| busan-VB-2579 | 달콤한 부산의 매력, | "달콤한 부산의 매력,"(해운대구 우동1로 13-29 1층): 제목 미완성(쉼표 후 내용 없음), 실제 업체... |
| busan-VB-1899 | 자연도 흥미진진하다구! 낙동강 감동포구에서 즐기는 생태 어드벤처 | "낙동강 감동포구 생태 어드벤처": 주소 없음. 감동포구가 어느 포구인지 텍스트만으로 특정 불가. URL 방... |
| busan-VB-1870 | 세상에 쓸모없는 쓰레기는 없으니까! | "세상에 쓸모없는 쓰레기는 없으니까!"(강서구 생곡산단1로24번길 58): 기사체 제목으로 시설명 불명. 산... |
| busan-VB-1859 | K-POP 스타랑 동문 된 썰 푼다 | "K-POP 스타랑 동문 된 썰 푼다"(진구 동천로132번길 6 3층): 기사체 제목으로 댄스학원인지 체험관... |
| busan-VB-1855 | 라이언 홀리데이 인 부산 | "라이언 홀리데이 인 부산"(해운대해변로 292 지하1층): 인접한 파라다이스 호텔(296번지)과 다른 주소... |
| busan-VB-1177 | 아트다 아트 꿀잼 아트 | "아트다 아트 꿀잼 아트"(캐비네 드 쁘아송, 아난티코브 미디어아트 갤러리): canonical busan-... |
| busan-VB-542 | 다누비열차 | "다누비열차": 주소 없음. 낙동강 생태열차 추정이나 운영 노선·위치 텍스트로 특정 불가. URL 방문 필요... |

> 전체 unresolved는 VisitBusan URL 방문 또는 현장 확인 필요.

---

## 6. 검증 조건

| 조건 | 결과 |
|---|---|
| 31건 전부 추적 | ✓ |
| 상태별 합계 31건 | ✓ |
| merge_existing merge_target_id 누락 0 | ✓ |
| ready_for_candidate category/subcategory 누락 0 | ✓ |
| 근거 부족 항목 강제 확정 0 | ✓ (8건 unresolved) |
| 원본 후보·canonical 무변경 | ✓ (읽기 전용) |

---

## 7. 생성 파일

| 파일 | 내용 |
|---|---|
| busan-duplicate-manual-resolution.csv | 31건 판정 결과 |
| busan-duplicate-manual-resolution-metrics.json | 지표 요약 |
| busan-duplicate-manual-resolution-08-report.md | 본 보고서 |

---

TASK-DATA-BUSAN-DUPLICATE-MANUAL-RESOLUTION-08 중복·수동검토 확정 완료.

---

## REVIEW-09: 미확정 후보 최종 검토

**날짜:** 2026-07-24
**입력:** 8건 (unresolved)
**방법:** 공식 URL 방문 확인 (VisitBusan 페이지, 사업체 공식 사이트, 기관 사이트)

### REVIEW-09 판정 결과

| 최종 상태 | 건수 |
|---|---|
| ready_for_candidate | 3 |
| merge_existing | 3 |
| reference_only | 1 |
| unresolved (유지) | 1 |
| **합계** | **8** |

### ready_for_candidate 3건

| candidate_id | title_ko | category | subcategory | 확인 근거 |
|---|---|---|---|---|
| busan-VB-2581 | 바다처럼 | attraction | retail_store | Instagram @pretty_whale.shop. 고래 테마 소품·잡화 오프라인 판매점. 해운대구 우동1로38번길 15-1 1층 고정 점포. |
| busan-VB-2579 | 달콤한 부산의 매력, | restaurant | dessert_shop | busansand.co.kr 확인. 부산샌드(버터샌드 전문점). 해운대구 우동1로 13-29 1층 고정 매장. |
| busan-VB-1855 | 라이언 홀리데이 인 부산 | attraction | theme_park | VisitBusan 페이지 확인. 카카오프렌즈 캐릭터 테마파크. 지하1층 무료 전시·지하2층 유료 체험(20,000원). 파라다이스 호텔(해운대해변로 296)과 완전 별개 독립 시설. |

### merge_existing 3건

| candidate_id | title_ko | merge_target_id | 유형 | 확인 근거 |
|---|---|---|---|---|
| busan-VB-1870 | 세상에 쓸모없는 쓰레기는 없으니까! | busan-K-00350 | canonical | VB 주소(강서구 생곡산단1로24번길 58) = canonical 부산자원순환협력센터 주소 완전 일치. |
| busan-VB-1177 | 아트다 아트 꿀잼 아트 | busan-K-00224 | canonical | 아난티 공식 사이트 확인. 캐비네 드 쁘아쏭(쁘아송)은 아난티코브 내 F&B·어메니티 라인으로 독립 미디어아트 갤러리 아님. 부지(기장해안로 268-31)는 busan-K-00224(아난티 앳 부산 코브, 268-32) 인접 단지 내. |
| busan-VB-542 | 다누비열차 | busan-A-00004 | canonical | 태종대유원지 공식 사이트(bisco.or.kr) 확인. 다누비열차 = 태종대 내부 순환 관광 열차. busan-A-00004(태종대) 포함 부대시설. |

### reference_only 1건

| candidate_id | title_ko | 사유 |
|---|---|---|
| busan-VB-1899 | 자연도 흥미진진하다구! 낙동강 감동포구에서 즐기는 생태 어드벤처 | VisitBusan 페이지 확인. 화명생태공원·화명수상레포츠타운·금빛노을브릿지 등을 잇는 다중 거점 생태 투어 프로그램. 단일 고정 city_spot 아님. |

### unresolved 유지 1건

| candidate_id | title_ko | 사유 |
|---|---|---|
| busan-VB-1859 | K-POP 스타랑 동문 된 썰 푼다 | 공식 URL(sdkart.modoo.at) 2025년 6월 26일 서비스 종료로 접속 불가. 진구 동천로132번길 6 3층 업체의 현재 운영 여부 및 업종 확인 불가. 현장 방문 또는 대체 URL 확보 필요. |

### REVIEW-09 후 최종 집계 (31건 기준)

| 최종 상태 | TASK-08 | REVIEW-09 반영 후 |
|---|---|---|
| merge_existing | 9 | **12** |
| ready_for_candidate | 12 | **15** |
| reference_only | 2 | **3** |
| unresolved | 8 | **1** |
| **합계** | **31** | **31** |

---

TASK-DATA-BUSAN-UNRESOLVED-FINAL-REVIEW-09 미확정 후보 최종 검토 완료.
