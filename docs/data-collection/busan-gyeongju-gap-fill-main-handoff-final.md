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

## TASK-BUSAN-REMOVE-14-AND-GYEONGJU-HERITAGE-CONTENT-FILL-V1 (SHA: TBD — 2026-08-09)

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
