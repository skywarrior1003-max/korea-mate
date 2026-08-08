# Busan-Gyeongju Gap Fill & Main Handoff v3

|항목|값|
|---|---|
|task|TASK-BUSAN-GYEONGJU-OVERNIGHT-GAP-FILL-CORRECTION-AND-FINAL-HANDOFF-V3|
|branch|data/busan-gyeongju-gap-fill-v1|
|V2|df77100|
|generated|2026-08-08|
|QA|PASS_WITH_PARTIAL pass=13 partial=1 fail=0|

## 부산 기준선 명확화
|수치|값|
|---|---|
|BUSAN_CANONICAL_RELEASE|1533 (place 1529 + event 4)|
|BUSAN_ENRICHMENT_UNIVERSE|1642|
|차이|109 = hold_event68 + exclude_dup37 + structural4|
V2 completeness-matrix 1642 universe -> V3에서 1533 canonical로 정정.

## 경주 좌표 116건
|상태|건수|
|---|---|
|COORD_VERIFIED|**28**|
|FINAL_HOLD_COORD_SOURCE_EXHAUSTED|88|
|COORD_NOT_FOUND_IN_KTO 터미널|**0** OK|
|합계|**116=116**|
Cascade: V2 type12/14/28 -> V3 all-type area list -> searchKeyword2.

## 음식점 190건
|상태|건수|
|---|---|
|READY|28|
|FINAL_HOLD|162|
|NEW_PLACE_PROPOSAL 터미널|**0** OK|
HOLD 분류: {'HOLD_COORDINATE': 162}

## 부산 좌표 이슈
- busan-K-00674 반송공원 lat=19.69 -> searchKeyword2 교정 시도
- busan-F-00341 보느파티쓰 리 lat=35.19 -> COORD_OK_IN_BOUNDS

## 부산 EN
- EngService2 Busan area list 수집 완료
- 좌표 근접 EN title 패치: 124건

## 부산 이벤트
- stale 25건: raw_date_text 파싱 HOLD_PAST_EVENT 재분류 일부 가능
- date-missing 26건: SOURCE_DYNAMIC_HOLD

## 부산 코스/경험
- KTO type25(courses) + type28(leisure) Busan 수집 완료

## QA: **PASS_WITH_PARTIAL** (13 PASS / 1 PARTIAL / 0 FAIL)

**BUSAN_GYEONGJU_MAIN_HANDOFF_READY = YES**