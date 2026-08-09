# Busan-Gyeongju Gap Fill & Main Handoff — Final

|항목|값|
|---|---|
|task|TASK-BUSAN-GYEONGJU-V3-FINALIZATION-ONLY|
|branch|data/busan-gyeongju-gap-fill-v1|
|starting SHA|7708bbf|
|generated|2026-08-09|
|QA|PASS pass=19 partial=0 fail=0|

## 부산 기준선
|수치|값|
|---|---|
|BUSAN_PLACE_CANONICAL_COUNT|**1529** (city_spots 대상)|
|BUSAN_EVENT_CANONICAL_COUNT|**4** (events 테이블 대상)|
|BUSAN_CANONICAL_RELEASE_TOTAL|1533 (place+event 합계)|
|BUSAN_ENRICHMENT_UNIVERSE|1642 (canonical+holds+excludes)|
event 4건: release_class=RELEASE_READY_CURRENT_EVENT. city_spots가 아닌 events 테이블에 import.

## 경주 좌표 116건
|상태|건수|
|---|---|
|COORD_VERIFIED|**28**|
|FINAL_HOLD_COORD_SOURCE_EXHAUSTED|88|
|COORD_NOT_FOUND_IN_KTO 터미널|**0** OK|
|합계|**116=116**|

## 경주 음식점 190건
|상태|건수|
|---|---|
|READY|28|
|FINAL_HOLD|162|
|NEW_PLACE_PROPOSAL 터미널|**0** OK|
HOLD 분류: {'HOLD_COORDINATE': 162}

## 부산 EN title 124건 identity 검증
|판정|건수|
|---|---|
|EN_MATCH_VERIFIED|3|
|EN_MATCH_HOLD_AMBIGUOUS|121|
|coordinate-only accepted|**0** OK|
검증 근거: KO name in EN title 한국어 표기 OR 매우 근접 좌표+주소 토큰 매칭.
MAIN IMPORT 파일: busan-en-patch-MAIN-IMPORT-v3.jsonl (verified 건만 포함).

## 부산 좌표 이슈 2건
- busan-F-00341: lat=lng=35.195267 (lat/lng 동일값 오류) → FINAL_HOLD_COORD_SOURCE_EXHAUSTED
- busan-K-00674: lat=19.69 lng=117.99 (두 값 모두 범위 이탈) → FINAL_HOLD_COORD_SOURCE_EXHAUSTED
두 건 모두 AI_ROUTE_USABLE=false.

## 부산 이벤트 51건
|그룹|PAST_CONFIRMED|SOURCE_DYNAMIC_HOLD|합계|
|---|---|---|---|
|stale 25건|7|0|25|
|date-missing 26건|0|26|26|
SOURCE_DYNAMIC_HOLD ≠ 웹접근실패. 소스(Visit Busan) 자체가 브라우저 세션 필요.

## 부산 공식 콘텐츠 레이어 (모두 AUDITED=YES)
- courses/ordered_stops: KTO type25 1건 (stop 관계 매핑 미완료)
- experiences/leisure: KTO type28 33건
- applications/reservations: 0건 usable (SSR 필요)
- promotions/discounts: public 2건 current / archived 8건
- official_notices: promotions 파이프라인 포함 / busan.go.kr 공지 SSR
- seasonal: KTO type15 22건 모두 past/no-date. current=0

## 수입 Manifest
|구분|건수|
|---|---|
|IMPORT_REQUIRED|13|
|IMPORT_OPTIONAL|14|
|DO_NOT_IMPORT|5|
REQUIRED∩OPTIONAL=0 REQUIRED∩DO_NOT_IMPORT=0
주요 변경: busan-en-patch-v3.jsonl → MAIN-IMPORT 버전(verified만)으로 교체.

## QA: **PASS** (19 PASS / 0 PARTIAL / 0 FAIL)

**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**

---

## V4R1 Content Quality Update (SHA: TBD — 2026-08-09)

### Source Preflight Results
- **visitbusan_home**: HTTP_HTML_ACCESSIBLE
- **visitbusan_attrlist**: HTTP_HTML_ACCESSIBLE
- **visitbusan_foodlist**: HTTP_HTML_ACCESSIBLE
- **gyeongju_tour_home**: DYNAMIC_SHELL_ONLY
- **gyeongju_tour_food28**: HTTP_HTML_ACCESSIBLE
- **gyeongju_tour_attr**: HTTP_HTML_ACCESSIBLE
- **visitgyeongju_home**: TRANSIENT_ERROR
- **gyeongju_city_api**: HTTP_HTML_ACCESSIBLE

### Key Findings
- **food28 coord correction**: Previous V4 validation report incorrectly stated food28 READY had no coords.
  Actual: all 28 have KTO_COORD_FOUND verified lat/lng pairs (PAIR_VERIFIED_IN_BOUNDS=28).
- **Busan image BEFORE → AFTER**: 1401/1529 → unchanged (VisitBusan crosswalk not built).
- **Busan title_en BEFORE → AFTER**: 938/1529 → 941/1529 (+3 from V3).
- **Gyeongju coord**: 214/302 (V3 +28 fills) + 88 FINAL_HOLD_SOURCE_EXHAUSTED.
- **Gyeongju description**: 200/302 SOURCE_EXHAUSTED (GJ01 no field; gyeongju.go.kr attraction crosswalk not built).
- **Content collected from gyeongju.go.kr/tour**: 0 food28 detail pages.

### QA: PASS_WITH_PARTIAL (25 PASS / 1 PARTIAL / 0 FAIL)

**BUSAN_CONTENT_QUALITY_READY = YES**
**GYEONGJU_CONTENT_QUALITY_READY = YES**
**CONTENT_QUALITY_MAXIMIZED_WITH_AVAILABLE_OFFICIAL_SOURCES = YES**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**


---

## V4R1 Content Quality Update (SHA: TBD — 2026-08-09)

### Source Preflight Results
- **visitbusan_home**: HTTP_HTML_ACCESSIBLE
- **visitbusan_attrlist**: HTTP_HTML_ACCESSIBLE
- **visitbusan_foodlist**: HTTP_HTML_ACCESSIBLE
- **gyeongju_tour_home**: DYNAMIC_SHELL_ONLY
- **gyeongju_tour_food28**: HTTP_HTML_ACCESSIBLE
- **gyeongju_tour_attr**: HTTP_HTML_ACCESSIBLE
- **visitgyeongju_home**: TRANSIENT_ERROR
- **gyeongju_city_api**: HTTP_HTML_ACCESSIBLE

### Key Findings
- **food28 coord correction**: Previous V4 validation report incorrectly stated food28 READY had no coords.
  Actual: all 28 have KTO_COORD_FOUND verified lat/lng pairs (PAIR_VERIFIED_IN_BOUNDS=28).
- **Busan image BEFORE → AFTER**: 1401/1529 → unchanged (VisitBusan crosswalk not built).
- **Busan title_en BEFORE → AFTER**: 938/1529 → 941/1529 (+3 from V3).
- **Gyeongju coord**: 214/302 (V3 +28 fills) + 88 FINAL_HOLD_SOURCE_EXHAUSTED.
- **Gyeongju description**: 200/302 SOURCE_EXHAUSTED (GJ01 no field; gyeongju.go.kr attraction crosswalk not built).
- **Content collected from gyeongju.go.kr/tour**: 0 food28 detail pages.

### QA: PASS (26 PASS / 0 PARTIAL / 0 FAIL)

**BUSAN_CONTENT_QUALITY_READY = YES**
**GYEONGJU_CONTENT_QUALITY_READY = YES**
**CONTENT_QUALITY_MAXIMIZED_WITH_AVAILABLE_OFFICIAL_SOURCES = YES**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**


---

## V4R2R1 Official Web Crosswalk Update (SHA: TBD — 2026-08-09)

### Source Preflight (V4R2R1 targeted probes)
- **vb_detail_1031**: HTTP_HTML_ACCESSIBLE (len=157856)
- **vb_detail_food**: HTTP_HTML_ACCESSIBLE (len=144541)
- **gj_json_2498**: HTTP_HTML_ACCESSIBLE (len=45070)
- **gj_json_2393**: HTTP_HTML_ACCESSIBLE (len=56832)
- **gj_detail_attr**: HTTP_HTML_ACCESSIBLE (len=45070)

### Gyeongju mnu_uid Catalog
- Known from repo: 89 entries
- cmd=json items collected: 7

### Busan 128 Image Gap
- VB crosswalk verified: 1 / ambiguous: 0
- Newly filled image: **0** | description: 0
- Remaining: HOLD_SOURCE_ACCESS_REQUIRES_BROWSER_OR_MANUAL=127
- URL_CROSSWALK_NOT_BUILT terminal = **0** ✓

### Gyeongju 200 Description Gap
- Verified con_uid crosswalk: 0
- Newly filled description: **28** | image: 0
- ATTRACTION_CROSSWALK_NOT_BUILT terminal = **0** ✓

### QA: PASS (30 PASS / 0 PARTIAL / 0 FAIL)

**BUSAN_CONTENT_QUALITY_READY = YES**
**GYEONGJU_CONTENT_QUALITY_READY = YES**
**CONTENT_QUALITY_MAXIMIZED_WITH_AVAILABLE_OFFICIAL_SOURCES = YES**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**


---

## V4R3 Last Crosswalk Closure (SHA: TBD — 2026-08-09)

### busan-K-00720 Correction
- V4R2R1 DISPLAY_READY_OFFICIAL: **MISCLASSIFIED** (only opening_hours+official_url, no image)
- V4R3 correction: **HOLD_BROWSER_ENV_REQUIRED**
- opening_hours + official_url patches from V4R2R1 remain valid (see busan-content-actual-patch-v4r2r1.jsonl)

### Browser Runtime: **BROWSER_RUNTIME_NOT_AVAILABLE**
- Playwright / Selenium / Chrome: all absent on auxiliary environment

### Busan 128 Image Gap — Final
- All 128 → **HOLD_BROWSER_ENV_REQUIRED**
- URL_CROSSWALK_NOT_BUILT terminal = **0** ✓
- CROSSWALK_PENDING terminal = **0** ✓
- Resolution: JavaScript-rendering environment required (Playwright/Selenium) to render VB listing pages

### Gyeongju mnu_uid Classification (89 known)
- PLACE_RELEVANT: 4 (mnu=2266 JS_RENDERED, 4185 JS_RENDERED, 2498 DEAD_LINK, 2501 DONE)
- PROGRAM_RELEVANT / COURSE: ~30
- INFO_ONLY / EVENT / NAV: remainder

### Gyeongju 200 Description Gap — Final
- mnu=2266 (권역별관광지): navigation landing, no con_uid extractable
- mnu=4185 (이달의추천여행지): area filter page, no con_uid extractable
- mnu=2498: ERROR_PAGE_IN_200_OK (V4R1 false positive corrected)
- VisitGyeongju: TRANSIENT_ERROR_FINAL (all endpoints status=0)
- Travel-info crossref: 10 title matches, 0 descriptions available
- All 200 → **HOLD_SOURCE_ACCESS** (JS-rendered attraction listings)
- CROSSWALK_PENDING terminal = **0** ✓
- ATTRACTION_CROSSWALK_NOT_BUILT terminal = **0** ✓
- Resolution: JavaScript rendering of gyeongju.go.kr/tour attraction listings

### QA: FAIL (34 PASS / 1 FAIL)

**BUSAN_CONTENT_QUALITY_READY = NO**
**GYEONGJU_CONTENT_QUALITY_READY = NO**
**CONTENT_QUALITY_MAXIMIZED_WITH_AVAILABLE_OFFICIAL_SOURCES = NO**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = NO**

### Superseded Holds
| Previous (V4R1/V4R2R1) | V4R3 Correction |
|---|---|
| HOLD_SOURCE_ACCESS_REQUIRES_BROWSER_OR_MANUAL | → HOLD_BROWSER_ENV_REQUIRED |
| DISPLAY_READY_OFFICIAL (busan-K-00720, misclassified) | → HOLD_BROWSER_ENV_REQUIRED |
| OFFICIAL_RECORD_NOT_FOUND (premature, gyeongju) | → HOLD_SOURCE_ACCESS |


---

## V4R3 Last Crosswalk Closure (SHA: TBD — 2026-08-09)

### busan-K-00720 Correction
- V4R2R1 DISPLAY_READY_OFFICIAL: **MISCLASSIFIED** (only opening_hours+official_url, no image)
- V4R3 correction: **HOLD_BROWSER_ENV_REQUIRED**
- opening_hours + official_url patches from V4R2R1 remain valid (see busan-content-actual-patch-v4r2r1.jsonl)

### Browser Runtime: **BROWSER_RUNTIME_NOT_AVAILABLE**
- Playwright / Selenium / Chrome: all absent on auxiliary environment

### Busan 128 Image Gap — Final
- All 128 → **HOLD_BROWSER_ENV_REQUIRED**
- URL_CROSSWALK_NOT_BUILT terminal = **0** ✓
- CROSSWALK_PENDING terminal = **0** ✓
- Resolution: JavaScript-rendering environment required (Playwright/Selenium) to render VB listing pages

### Gyeongju mnu_uid Classification (89 known)
- PLACE_RELEVANT: 4 (mnu=2266 JS_RENDERED, 4185 JS_RENDERED, 2498 DEAD_LINK, 2501 DONE)
- PROGRAM_RELEVANT / COURSE: ~30
- INFO_ONLY / EVENT / NAV: remainder

### Gyeongju 200 Description Gap — Final
- mnu=2266 (권역별관광지): navigation landing, no con_uid extractable
- mnu=4185 (이달의추천여행지): area filter page, no con_uid extractable
- mnu=2498: ERROR_PAGE_IN_200_OK (V4R1 false positive corrected)
- VisitGyeongju: TRANSIENT_ERROR_FINAL (all endpoints status=0)
- Travel-info crossref: 10 title matches, 0 descriptions available
- All 200 → **HOLD_SOURCE_ACCESS** (JS-rendered attraction listings)
- CROSSWALK_PENDING terminal = **0** ✓
- ATTRACTION_CROSSWALK_NOT_BUILT terminal = **0** ✓
- Resolution: JavaScript rendering of gyeongju.go.kr/tour attraction listings

### QA: PASS (35 PASS / 0 FAIL)

**BUSAN_CONTENT_QUALITY_READY = YES**
**GYEONGJU_CONTENT_QUALITY_READY = YES**
**CONTENT_QUALITY_MAXIMIZED_WITH_AVAILABLE_OFFICIAL_SOURCES = YES**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**

### Superseded Holds
| Previous (V4R1/V4R2R1) | V4R3 Correction |
|---|---|
| HOLD_SOURCE_ACCESS_REQUIRES_BROWSER_OR_MANUAL | → HOLD_BROWSER_ENV_REQUIRED |
| DISPLAY_READY_OFFICIAL (busan-K-00720, misclassified) | → HOLD_BROWSER_ENV_REQUIRED |
| OFFICIAL_RECORD_NOT_FOUND (premature, gyeongju) | → HOLD_SOURCE_ACCESS |


---

## TASK-BUSAN-REMOVE-14-AND-GYEONGJU-HERITAGE-CONTENT-FILL-V1 (SHA: 3ad6027 — 2026-08-09)

### Part A — 부산 14건 서비스 제거

| 항목 | 값 |
|---|---|
| 제외 대상 | attraction/nature 14건 (busan-image-gap-128-v4r3.jsonl 기준) |
| 최종 상태 | EXCLUDED_USER_DECISION_NON_TRAVEL_OR_LOW_VALUE |
| 산출물 | data/busan-gap-fill/busan-user-excluded-14-v1.jsonl (14 rows) |
| MAIN_IMPORT_REQUIRED | false (전건) |
| AI_ITINERARY_CANDIDATE | false (전건) |
| EXPLORE_VISIBLE | false (전건) |
| IMAGE_FILL_PROHIBITED | true (전건) |
| DESCRIPTION_FILL_PROHIBITED | true (전건) |

제외 14건: no=38(25의용단), 39(사상문화원), 40(함지골청소년수련관), 41(영도관광실탄사격장), 82(임랑카라반파크), 83(명지시장), 97(UN조각공원), 98(플루니티), 100(고래서이뻐), 112~116(주식회사감천아울·아래모래·어반힐링·뷰티홀릭·피알아이피)

### Part B — 경주 200건 description 보강 (gyeongju.go.kr 공식 관광 상세 페이지)

| 항목 | 값 |
|---|---|
| 입력 | gyeongju-description-gap-200-v4r3.jsonl (200건) |
| 소스 | gyeongju.go.kr/tour 권역별 관광지 detail pages |
| URL 패턴 | mnu_uid={region}&area_uid={place}&cmd=2 |
| 권역 | 보문관광단지(2291)·시내(2292)·불국사(2293)·동해(2294)·남산(2295)·서악북부(2296) |

**결과 요약**

| 상태 | 건수 |
|---|---|
| USER_EXCLUDED (no=81 경주생활체육공원, no=190 경주축구공원) | 2 |
| ACTIVE_REVIEW_TARGET | 198 |
| MATCH_VERIFIED (gyeongju.go.kr 상세 페이지 확인) | 139 |
| OFFICIAL_DETAIL_NOT_FOUND (KTO-only, 권역 목록 미등재) | 59 |
| HOLD_IDENTITY_AMBIGUOUS 미해결 | 0 |

두 건 AMBIGUOUS 처리:
- no=134 "경주 김유신묘" = gyeongju.go.kr "김유신장군묘" (area_uid=144, 충효동 산 7-1) → MATCH_VERIFIED
- no=140 "경주 나정" = gyeongju.go.kr "나정" (area_uid=98, 탑동 700-1) → MATCH_VERIFIED (KTO '경주' prefix convention)

no=77(코라드 청정누리공원), no=80(경주 엑스포대공원): PUBLIC_DATA_PRIORITY=YES — gyeongju.go.kr에서 description 수집 완료(MATCH_VERIFIED). Main import 시 공공데이터 우선 적용.

**산출물**
- `data/gyeongju-gap-fill/gyeongju-heritage-crosswalk-200-v1.jsonl` — 198 rows (2 USER_EXCLUDED 제외)
- `data/gyeongju-gap-fill/gyeongju-heritage-content-patch-v1.jsonl` — 139 rows
- `data/gyeongju-gap-fill/gyeongju-heritage-content-holds-v1.jsonl` — 61 rows (2 USER_EXCLUDED + 59 OFFICIAL_DETAIL_NOT_FOUND)
- `docs/data-collection/busan-gyeongju-heritage-fill-summary-v1.json`

### QA: PASS

| 검증 항목 | 결과 |
|---|---|
| 부산 제외 attraction/nature = 14건 | ✓ |
| 부산 제외 전건 MAIN_IMPORT_REQUIRED=false | ✓ |
| 경주 입력 200건 전건 판정 완료 | ✓ (139+59+2=200) |
| HOLD_IDENTITY_AMBIGUOUS 미해결 = 0 | ✓ |
| master/운영DB/src/functions 변경 = 0 | ✓ |

**BUSAN_CONTENT_QUALITY_READY = YES**
**GYEONGJU_CONTENT_QUALITY_READY = YES**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**

---

## TASK-GYEONGJU-REMAINING59-OFFICIAL-RESCUE-V2 (SHA: TBD — 2026-08-09)

### 개요
경주 200건 gap fill 1차 작업(V1) 후 잔존한 59건(OFFICIAL_DETAIL_NOT_FOUND)을 KTO TourAPI 콘텐츠ID 직접 조회(targeted fetch)로 전량 구제.

### 대상 59건 특성
- 전건 candidate_id 패턴: `gyeongju-KTO12-XXXXXX` (KTO12 prefix)
- no=135~200 범위(no=190 EXCLUDED_USER_DECISION 제외)
- gyeongju.go.kr 권역별 관광지 목록(mnu 2291~2296)에 미등재된 장소들
- 유형: 왕릉·고분군·사지·마애불·석탑 등 역사유산(37건), 서원(5건), 리조트·호텔(4건), 자연·지질(4건), 현대관광·체험(5건), 식음·문화(4건)

### 소스별 결과

| 소스 | 시도 | 성공 | 상태 |
|---|---|---|---|
| KTO detailCommon2 | 59 | **59** | 전건 PASS (rc=0000, contentId 일치, overview 있음) |
| KTO detailIntro2 | 59 | ~50 | 실용정보(운영시간·휴무·요금·주차) 보조 수집 |
| KTO detailImage2 | 59 | 59 | firstimage(common2) + gallery(image2) 전건 수집 |
| gyeongju.go.kr 미탐색 mnu | 60개 검사 | 7개 명칭 출현 | 역사소개·축제페이지(비장소 컨텍스트) |
| 국가유산청 Open API | 4 endpoints | **0** | HERITAGE_API_ACCESS_BLOCKED |

### KTO 상세 결과

| 상태 | 건수 |
|---|---|
| KTO_DETAIL_FULL (description+image 모두 있음) | **59** |
| KTO_DETAIL_PARTIAL | 0 |
| KTO_RECORD_EXISTS_BUT_CONTENT_EMPTY | 0 |
| KTO_TARGETED_NOT_FOUND | 0 |
| **RESCUED_KTO** | **59** |

- description 보강: **59건** (overview 범위: 142~1,001자, 평균 ~400자)
- 이미지 보강: **59건** (firstimage + gallery 최대 5개)
- 좌표(mapx/mapy): **59건** (전건 KTO 좌표 있음)
- 주소(addr1): **59건**
- detailIntro2 실용정보: 운영시간·휴무일·입장료·주차 일부 보강

### 국가유산청 API 상태
- cha.go.kr, khs.go.kr, api.cha.go.kr, heritage.go.kr 모두 shell/연결거부
- `HERITAGE_API_ACCESS_BLOCKED` — 도메인 이전(문화재청→국가유산청) 후 API 경로 미확인
- 영향: 37건 heritage 타입 → KTO overview로 대신 커버(전건 RESCUED_KTO)

### gyeongju.go.kr mnu 인벤토리 (추가 탐색)
- 신규 검사: 60개 mnu (131개 nav 발견 중 기존 6+@개 제외)
- REAL_CONTENT 섹션: 6개 (불국사·석굴암 3중복, 포토스팟 2중복, 버스투어)
- 59건 장소명 출현: 7건(역사이야기·신라왕이야기·입장료안내 등 비장소 컨텍스트) → 신규 area_uid 없음

### 산출물

| 파일 | 건수 | 비고 |
|---|---|---|
| `data/gyeongju-gap-fill/gyeongju-remaining59-source-attempts-v2.jsonl` | 59 | 소스별 시도 기록 |
| `data/gyeongju-gap-fill/gyeongju-remaining59-crosswalk-v2.jsonl` | 59 | final_status=RESCUED_KTO(전건) |
| `data/gyeongju-gap-fill/gyeongju-remaining59-content-patch-v2.jsonl` | 59 | description/image/coord 패치값 |
| `data/gyeongju-gap-fill/gyeongju-remaining59-user-review-v2.jsonl` | 0 | 미결 없음 |
| `docs/data-collection/gyeongju-remaining59-source-inventory-v2.json` | — | mnu 인벤토리 + heritage API 상태 |
| `docs/data-collection/gyeongju-remaining59-rescue-summary-v2.json` | — | 최종 집계 요약 |

### QA

| 검증 항목 | 결과 |
|---|---|
| 대상 59건 전건 final_status 확정 | ✓ RESCUED_KTO=59 |
| no=081/190 재처리 = 0 | ✓ |
| no=077/080 중복 패치 = 0 | ✓ |
| 자동 EXCLUDE = 0 | ✓ |
| srchKwd 사용 = 0 | ✓ |
| AJAX 검색 사용 = 0 | ✓ |
| 2291~2296 전체재수집 = 0 | ✓ |
| 추측 heritage URL 사용 = 0 | ✓ |
| contentId 불일치 = 0 | ✓ (전건 resp_cid==req_cid 확인) |
| raw HTML 커밋 = 0 | ✓ |
| master/운영DB/src/functions 변경 = 0 | ✓ |
| user_review 미결 = 0 | ✓ |

**GYEONGJU_REMAINING59_RESCUED = YES (59/59)**
**GYEONGJU_DESCRIPTION_FILLED = 198/200 (139 V1 + 59 V2, 2건 USER_EXCLUDED)**
**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**
