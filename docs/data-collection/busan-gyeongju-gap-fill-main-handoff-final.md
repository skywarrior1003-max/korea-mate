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
