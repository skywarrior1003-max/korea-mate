# 서울 Non-Food Execution Plan v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-NONFOOD-EXECUTION-PLAN-V1 |
| 생성일 | 2026-08-12 |
| branch | data/seoul-collection-v1 |
| 근거 정책 | multicity-place-eligibility-policy-v1.md (2ca9e09+2b301d4) |
| 근거 정책 | multicity-event-freshness-policy-v1.md (c99095e+5263084+0076664+983c8d9) |
| 입력 소스 | seoul-full-enrichment-routing-v2.jsonl (3,765건) |
| API_CALLS | 0 |
| DATA_SOURCE_CHANGE | 0 |

---

## 범위 교정 요약

이전 근사 수치(`TASK-SEOUL-RECOVER-APPROVED-PLACE-EVENT-POLICY-AND-CORRECT-NONFOOD-SCOPE-R1`)를
V2 routing 실데이터 기반 exact 수치로 교체.

| 분류 | 근사 (Task 3) | 확정 (이번 Task) | 교정 방향 |
|---|---|---|---|
| PLACE_DETAIL_TARGET | ~123 | **573** | 확대 — V2 A-routing 전체 반영 |
| SEARCHABLE_ONLY_OR_USER_PICK | ~716 | **250** | 축소 — H-routing 35 + 일반 shopping 211 + 교육 4 |
| EXISTING_RAW_RECOVERY | 미분류 | **38** | 신규 — B-routing 기존 detail 보유 |
| COMPLETE_NO_ACTION | 미분류 | **1,697** | 신규 — CORE 316 + EXP 120 + TEMPLE 2 + FOOD 1,259 |
| EXCLUDED | 미분류 | **1,207** | 신규 — EVENT 1,190 + ACCOMMODATION 17 |

---

## Execution Class 정의

### PLACE_DETAIL_TARGET = 573

VisitSeoul detail API 호출이 필요한 장소.
V2 routing A-routing 결정 기준 + eligibility policy 적용.

| 분류 | 건수 | 근거 |
|---|---|---|
| CONDITIONAL A-routing (전체) | 528 | V2 routing 시스템 판단 — detail 없이 AI eligibility 결정 불가 |
| SHOPPING HIGH/INTENT | 30 | HIGH_TRAVEL_VALUE 또는 INTENT_SPECIFIC_VALUE 보유 (k-beauty/k-pop/백화점/면세점) |
| UNRESOLVED A-routing | 15 | 자연관광>하천 13건 + 역사관광 2건 |
| **합계** | **573** | |

manifest: `data/seoul-source-audit/seoul-nonfood-place-detail-target-manifest-v1.json`

**카테고리 분포:**

| 카테고리 | 건수 |
|---|---|
| 문화관광>전시시설 | 337 |
| 문화관광>전시시설>미술관/화랑 | 50 |
| 문화관광>전시시설>기타전시시설 | 29 |
| 문화관광>레저스포츠시설 | 27 |
| 문화관광 | 22 |
| 역사관광>종교성지 | 20 |
| 문화관광>공연시설 | 20 |
| 쇼핑>전문매장/상가 (HIGH/INTENT) | 15 |
| 자연관광>자연경관(하천) | 13 |
| 쇼핑>백화점 | 9 |
| 문화관광>교육시설 (INTENT) | 9 |
| 자연관광 | 9 |
| 문화관광>기타문화관광지 | 4 |
| 쇼핑>면세점 | 2 |
| 쇼핑>쇼핑몰 | 2 |
| 쇼핑 (HIGH/INTENT) | 2 |
| 문화관광>테마공원 | 2 |
| 역사관광 | 1 |

### SEARCHABLE_ONLY_OR_USER_PICK = 250

추가 detail API 불필요. SEARCHABLE=YES, USER_CAN_SELECT=YES 기본 적용.
AI_ITINERARY=NO (detail 없이 결정 가능한 경우).

| 분류 | 건수 | 근거 |
|---|---|---|
| Shopping GENERAL_TRAVEL_VALUE (A-routing) | 211 | 일반 상업시설 — eligibility policy RULE 3: AI 자동 포함 금지. SEARCHABLE=YES, USER_CAN_SELECT=YES |
| CONDITIONAL H-routing (기타문화관광지 ambiguous) | 35 | OTHER_CULTURAL_SITE_AMBIGUOUS — USER_CAN_SELECT=YES, AI=NO pending review |
| CONDITIONAL F-routing (도서관 등) | 3 | 교육/도서관 — EXTERNAL_SEARCH_VALUE, LOW_TRAVEL_VALUE → SEARCHABLE만 |
| CONDITIONAL C-routing (교육/이벤트) | 1 | EXTERNAL_SEARCH_VALUE → SEARCHABLE만 |
| **합계** | **250** | |

manifest: `data/seoul-source-audit/seoul-nonfood-searchable-user-pick-manifest-v1.json`

> **RULE 4 적용**: USER PICKED PLACE > AI AUTO RECOMMENDATION FILTER  
> SEARCHABLE_ONLY 250건은 사용자가 직접 선택하면 itinerary input으로 사용 가능.  
> 일반 상업시설이라는 이유만으로 삭제 금지.

### EXISTING_RAW_RECOVERY = 38

이미 detail payload 보유. 신규 API 호출 없이 eligibility 평가 가능.

| 분류 | 건수 | 근거 |
|---|---|---|
| Shopping B-routing | 21 | 기존 통합 detail 샘플 (B-routing = existing_detail_available=True) |
| CONDITIONAL B-routing | 10 | PLACE_CORE 이전 task에서 수집된 공연장/미술관/사찰 포함 |
| UNRESOLVED B-routing | 7 | 테마공원 CORE 4건 + 기타 3건 |
| **합계** | **38** | |

manifest: `data/seoul-source-audit/seoul-nonfood-existing-raw-recovery-manifest-v1.json`

### CURRENT_OR_FUTURE_CONFIRMED_EVENT = 6

현재 SERVICE_EVENT_POOL. 7일 refresh cycle (~2026-08-18).

| source_record_id | 제목 | 상태 | 기간 |
|---|---|---|---|
| KOPsj8gga | 조선 양반 접객 문화 체험 공연 '옹기콘서트' | ONGOING | 2026-07-02~2026-12-10 |
| KOPnkfasx | 연희 상설 공연 〈연희판판〉 | ONGOING | 2026-04-04~2026-10-31 |
| KOPd5mmfg | 2026 서울시 태권도 공연 | ONGOING | 2026-05-09~2026-10-18 |
| KOP47mbp7 | 2026 서울국제정원박람회 | ONGOING | 2026-05-01~2026-10-27 |
| KOPw5jg9e | 2026 남산골 전통체험 : 예술가의 시간 | ONGOING | 2026-04-03~2026-10-25 |
| KOPvro3vg | 2026 서울야외도서관 | ONGOING | 2026-04-23~2026-11-01 |

manifest: `data/seoul-source-audit/seoul-nonfood-active-event-manifest-v1.json`

### COMPLETE_NO_ACTION = 1,697

| 항목 | 건수 | 상태 |
|---|---|---|
| RESTAURANT_TRACK | 1,259 | FOOD_CLOSED (CLOSED_WITH_LIMITATION) |
| PLACE_CORE_CANDIDATE | 316 | CORE_DETAIL_COMPLETE (PLACE_CORE detail task 완료) |
| EXPERIENCE_CANDIDATE | 120 | EXPERIENCE_DETAIL_COMPLETE (동일 task 완료) |
| TEMPLE_STAY_CANDIDATE | 2 | TEMPLE_STAY_COMPLETE |
| **합계** | **1,697** | |

### EXCLUDED = 1,207

| 항목 | 건수 | 근거 |
|---|---|---|
| EVENT_TRACK | 1,190 | EVENT_HISTORY_EXCLUDED — HISTORICAL_BULK_DETAIL_CALLS=0, EVENT_WORK_STATUS=CLOSED |
| GENERAL_ACCOMMODATION_EXCLUDE | 17 | ACCOMMODATION_EXCLUDE |
| **합계** | **1,207** | |

---

## Stale 지시 제거

### ~~§2-A. Event Date/Status Pipeline~~ → RETIRED

**문서**: `docs/data-collection/seoul/seoul-next-collection-priority-v1.md` §2-A  
**충돌 정책**: `multicity-event-freshness-policy-v1.md` (commit 0076664)  
**결론**: D-routing 1,152건 bulk detail = HISTORICAL_BULK_DETAIL_CALLS=0 위반. 실행 금지.  
**조치**: 해당 문서에 RETIRED 표시 완료 (이번 task에서 inline 처리).

### ~~§2-B. Restaurant Utility~~ → SUPERSEDED

**문서**: `docs/data-collection/seoul/seoul-next-collection-priority-v1.md` §2-B  
**근거**: `SEOUL_FOOD_EXECUTION_TARGET = 0` (CLOSED_WITH_LIMITATION)  
**조치**: 해당 문서에 SUPERSEDED 표시 완료.

---

## 실행 Batch 계획

### Batch 1 — Existing Raw Recovery (API_CALLS=0)

**대상**: EXISTING_RAW_RECOVERY 38건  
**방법**: 기존 detail payload → eligibility policy 적용 → AI_ITINERARY/SEARCHABLE/EXPLORE 축 평가  
**출력**: eligibility assessment 결과 (normalized 파일 업데이트)  
**API**: 0  

포함:
- Shopping 21건 (기존 통합 detail)
- 공연장/미술관/사찰 10건 (PLACE_CORE task 수집분)
- UNRESOLVED 테마공원 등 7건

### Batch 2 — VisitSeoul Targeted Detail (VISITSEOUL_DETAIL_API_TARGET=573)

**대상**: PLACE_DETAIL_TARGET 573건  
**방법**: VisitSeoul contents/info API (상세정보 endpoint)  
**품질 gate**: TV1~TV7 Travel Value Gate 전체 통과 여부 평가  
**출력**: normalized detail JSONL + eligibility assessment

카테고리 우선순위 (동일 batch 내):
1. 전시시설>미술관/화랑 50건 + 전시시설>기타전시시설 29건 (확실한 tourism value)
2. 공연시설 20건 + 종교성지 20건 + 레저스포츠 27건
3. 전시시설 337건 (대용량 — 병렬 처리 또는 sub-batch)
4. Shopping HIGH/INTENT 30건 + UNRESOLVED 15건 + 기타

**배치 설계**:
- MAX_CONCURRENT: TBD (VisitSeoul API rate limit 준수)
- ERROR_GATE: 실패율 5% 초과 시 중단
- RETRY: 최대 3회

### Batch 3 — Active Event Freshness (EVENT_FRESHNESS_TARGET=6)

**대상**: SERVICE_EVENT_POOL 6건  
**방법**: VisitSeoul event contents/info + official URL 확인  
**주기**: 7일 refresh (다음 실행: ~2026-08-18)  
**출력**: 상태 변경 이벤트 감지, pool 업데이트  

조건:
- ENDED → SERVICE_POOL 제거, 아카이브 보존 (삭제 금지)
- NEW_CONFIRMED_EVENT → SERVICE_POOL 추가

---

## 제외 확인

```
SEOUL_FOOD_EXECUTION_TARGET = 0       (CLOSED_WITH_LIMITATION)
KTO_SEOUL_EXECUTION_TARGET = 0        (NOT_NEEDED_FOR_CURRENT_SCOPE)
PAST_EVENT_ACTIVE_TARGET = 0          (EVENT_WORK_STATUS=CLOSED)
UNCONFIRMED_RECURRING_EVENT_ACTIVE_TARGET = 0
DATELESS_EVENT_ACTIVE_TARGET = 0
HISTORICAL_BULK_EVENT_DETAIL_TARGET = 0
ENTITY_RELATION_DB_CONNECT = NOT_IN_THIS_PLAN  (별도 Main 판단)
DUPLICATE_MERGE = NOT_IN_THIS_PLAN
ZH_VARIANT_POLICY = NOT_IN_THIS_PLAN
DB_IMPORT = NOT_IN_THIS_PLAN
```

---

## 검증 결과

```
PLACE_DETAIL_TARGET = 573
SEARCHABLE_ONLY_OR_USER_PICK = 250
EXISTING_RAW_RECOVERY_TARGET = 38
COMPLETE_NO_ACTION = 1697
EXCLUDED = 1207
  합계 = 3765  (= INPUT_TOTAL, MANIFEST_OVERLAP=0)

CURRENT_OR_FUTURE_CONFIRMED_EVENT = 6
PAST_EVENT_ACTIVE_TARGET = 0
UNCONFIRMED_RECURRING_EVENT_ACTIVE_TARGET = 0
DATELESS_EVENT_ACTIVE_TARGET = 0
HISTORICAL_BULK_EVENT_DETAIL_TARGET = 0

VISITSEOUL_DETAIL_API_TARGET = 573
EXISTING_RAW_RECOVERY_TARGET = 38
EVENT_FRESHNESS_TARGET = 6

SEOUL_FOOD_EXECUTION_TARGET = 0
KTO_SEOUL_EXECUTION_TARGET = 0
MANIFEST_OVERLAP = 0
UNCLASSIFIED_TARGET = 0
```

---

## 다음 실행 작업

```
NEXT_TASK = SEOUL_NONFOOD_TARGETED_EXECUTION_BATCH_1
내용:
  - EXISTING_RAW_RECOVERY 38건 eligibility 평가
  - (이후) VISITSEOUL_DETAIL_API_TARGET 573건 API 수집
  - Stale 문서 §2-A/§2-B RETIRED 표시는 이번 task에서 완료
```

---

## 변경이력

| 날짜 | 내용 |
|---|---|
| 2026-08-12 | v1 최초 작성 — TASK-SEOUL-NONFOOD-EXECUTION-PLAN-V1 |
