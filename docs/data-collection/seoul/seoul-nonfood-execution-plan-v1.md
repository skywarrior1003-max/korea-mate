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

| 분류 | 근사 (Task 3) | 확정 (Task 4) | R1 교정 (이번) | 교정 방향 |
|---|---|---|---|---|
| PLACE_DETAIL_TARGET | ~123 | 573 | **573** | 변경 없음 (상설공연 venue 2건 포함) |
| SEARCHABLE_ONLY_OR_USER_PICK | ~716 | 250 | **250** | 변경 없음 |
| EXISTING_RAW_RECOVERY | 미분류 | 38 | **38** | 변경 없음 |
| COMPLETE_NO_ACTION | 미분류 | 1,697 | **1,697** | FOOD=PROTECTED_COMPLETE 표현 명확화 |
| ACTIVE_EVENT_SERVICE_POOL | 미분류 | 미분류 | **4** | 신규 — EVENT_TRACK active 4건 EXCLUDED에서 분리 |
| INACTIVE_OR_HISTORICAL_EVENT | 미분류 | 미분류 | **1,186** | 1,190 - active 4 |
| GENERAL_ACCOMMODATION_EXCLUDE | 미분류 | 미분류 | **17** | 변경 없음 |
| EXCLUDED_TOTAL | 미분류 | 1,207 (오류) | **1,203** | 1,186 + 17 (active 4 분리 후) |

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

### CURRENT_OR_FUTURE_CONFIRMED_EVENT = 6 (SERVICE_EVENT_POOL)

현재 SERVICE_EVENT_POOL. 7일 refresh cycle (~2026-08-18).

> **중요**: 6건의 routing track이 단일하지 않음.  
> · 2건 (옹기콘서트, 연희판판): PLACE_CONDITIONAL_REVIEW A-routing → **PLACE_DETAIL_TARGET(573)에 포함**  
> · 4건 (태권도공연, 정원박람회, 남산골, 야외도서관): EVENT_TRACK D-routing → **ACTIVE_EVENT_SERVICE_POOL(4)로 분리**  
> Disjoint 분류에서 각 CID는 하나의 class에만 속함. SERVICE_EVENT_POOL은 routing class를 초과하는 개념.

| source_record_id | 제목 | 상태 | 기간 | routing_class |
|---|---|---|---|---|
| KOPsj8gga | 조선 양반 접객 문화 체험 공연 '옹기콘서트' | ONGOING | 2026-07-02~2026-12-10 | PLACE_DETAIL_TARGET |
| KOPnkfasx | 연희 상설 공연 〈연희판판〉 | ONGOING | 2026-04-04~2026-10-31 | PLACE_DETAIL_TARGET |
| KOPd5mmfg | 2026 서울시 태권도 공연 | ONGOING | 2026-05-09~2026-10-18 | ACTIVE_EVENT_SERVICE_POOL |
| KOP47mbp7 | 2026 서울국제정원박람회 | ONGOING | 2026-05-01~2026-10-27 | ACTIVE_EVENT_SERVICE_POOL |
| KOPw5jg9e | 2026 남산골 전통체험 : 예술가의 시간 | ONGOING | 2026-04-03~2026-10-25 | ACTIVE_EVENT_SERVICE_POOL |
| KOPvro3vg | 2026 서울야외도서관 | ONGOING | 2026-04-23~2026-11-01 | ACTIVE_EVENT_SERVICE_POOL |

manifest: `data/seoul-source-audit/seoul-nonfood-active-event-manifest-v1.json`

### COMPLETE_NO_ACTION = 1,697

> **FOOD 표현**: RESTAURANT_TRACK 1,259건은 전체 accounting에서 COMPLETE_NO_ACTION으로 계상.  
> 실행 문서 상 의미: `FOOD = PROTECTED_COMPLETE / NO_EXECUTION` — 서울 non-Food 실행 대상 아님.  
> `SEOUL_FOOD_EXECUTION_TARGET = 0` 유지.

| 항목 | 건수 | 상태 |
|---|---|---|
| RESTAURANT_TRACK | 1,259 | **FOOD = PROTECTED_COMPLETE / NO_EXECUTION** (CLOSED_WITH_LIMITATION, 재개 금지) |
| PLACE_CORE_CANDIDATE | 316 | CORE_DETAIL_COMPLETE (PLACE_CORE detail task 완료) |
| EXPERIENCE_CANDIDATE | 120 | EXPERIENCE_DETAIL_COMPLETE (동일 task 완료) |
| TEMPLE_STAY_CANDIDATE | 2 | TEMPLE_STAY_COMPLETE |
| **합계** | **1,697** | |

### ACTIVE_EVENT_SERVICE_POOL = 4 (EVENT_TRACK 출신)

EVENT_TRACK 1,190건 중 현재 서비스 pool에 있는 4건. EXCLUDED가 아닌 별도 class.

| 항목 | 건수 | 근거 |
|---|---|---|
| EVENT_TRACK active (KOPd5mmfg, KOP47mbp7, KOPw5jg9e, KOPvro3vg) | 4 | ACTIVE_EVENT_SERVICE_POOL — freshness 대상, AI itinerary/event 노출 가능 |

> 나머지 2건 (KOPsj8gga, KOPnkfasx)은 PLACE_CONDITIONAL_REVIEW A-routing → PLACE_DETAIL_TARGET(573)에 포함됨.  
> 이 2건은 상설 공연 venue로 routing 상 물리적 장소(PHYSICAL_PLACE)로 분류.

### INACTIVE_OR_HISTORICAL_EVENT = 1,186

| 항목 | 건수 | 근거 |
|---|---|---|
| EVENT_TRACK (active 4건 제외) | 1,186 | HISTORICAL_BULK_DETAIL_CALLS=0, EVENT_WORK_STATUS=CLOSED |

### EXCLUDED_TOTAL = 1,203

| 항목 | 건수 | 근거 |
|---|---|---|
| INACTIVE_OR_HISTORICAL_EVENT | 1,186 | 과거/날짜미확정/recurring미발표 event archive |
| GENERAL_ACCOMMODATION_EXCLUDE | 17 | ACCOMMODATION_EXCLUDE |
| **합계** | **1,203** | |

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
TOTAL = 3765  (= INPUT_TOTAL)

PLACE_DETAIL_TARGET           = 573   (CONDITIONAL A 528 + Shopping HIGH/INTENT 30 + UNRESOLVED 15)
  [포함] 상설공연 venue: KOPsj8gga(옹기콘서트), KOPnkfasx(연희판판) — PLACE_CONDITIONAL_REVIEW A-routing
SEARCHABLE_ONLY_OR_USER_PICK  = 250
EXISTING_RAW_RECOVERY_TARGET  = 38
COMPLETE_NO_ACTION            = 1697  (FOOD=PROTECTED_COMPLETE 1259 + CORE 316 + EXP 120 + TEMPLE 2)
ACTIVE_EVENT_SERVICE_POOL     = 4     (EVENT_TRACK active: KOPd5mmfg/KOP47mbp7/KOPw5jg9e/KOPvro3vg)
INACTIVE_OR_HISTORICAL_EVENT  = 1186  (EVENT_TRACK 1190 - active 4)
GENERAL_ACCOMMODATION_EXCLUDE = 17
EXCLUDED_TOTAL                = 1203  (1186 + 17)
  합계 = 573+250+38+1697+4+1186+17 = 3765  ✓

CURRENT_OR_FUTURE_CONFIRMED_EVENT = 6  (SERVICE_POOL: 4 EVENT_TRACK + 2 PLACE_CONDITIONAL venue)
ACTIVE_EVENT_INSIDE_GENERIC_EXCLUDED = 0
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
