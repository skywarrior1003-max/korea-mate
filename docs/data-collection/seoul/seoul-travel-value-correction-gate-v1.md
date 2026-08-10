# Seoul Travel Value Correction & Detail Gate v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-POLICY-CORRECTION-AND-DETAIL-GATE-V1 |
| 생성일 | 2026-08-10 |
| START SHA | 7f9fae5 |
| BRANCH | data/seoul-collection-v1 |
| 수정 대상 | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 산출물 4개 이슈 |
| DB_CHANGE | 0 |
| NEW_API_CALLS | 0 |

---

## A. START STATE

| 항목 | 값 |
|---|---|
| START SHA | `7f9fae5` |
| branch | `data/seoul-collection-v1` |
| 직전 TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 전체 방향 | PASS |
| 수정 대상 | 4개 이슈 (집계 오류, 이미지 오류, MAIN 단정, 고정 공식) |

---

## B. INTENT COUNT RECONCILIATION

### 수정 전 (오류)

```
_meta.description: "44개"
summary.total_intents: 44
summary.STRONG: 8
summary.MODERATE: 18
summary.WEAK: 13
summary.NOT_AVAILABLE: 1
합계: 40  ← 배열 길이와 불일치
```

### 수정 후 (실제 배열 기준)

```python
# 실측 결과 (python count)
len(intents) = 45
STRONG: 11
MODERATE: 19
WEAK: 14
NOT_AVAILABLE: 1
합계: 45  ← 배열 길이와 일치
중복 intent: NONE
```

### STRONG 11개 (수정 후)

| intent | 이전 집계 포함 여부 |
|---|---|
| heritage_history | ✅ (집계됨) |
| traditional_culture | ✅ |
| nature_trekking | ✅ |
| hangang_experience | ✅ |
| korean_cuisine | ❌ (누락) |
| shopping | ❌ (누락) |
| festival | ✅ |
| family_kids | ✅ |
| night_view | ✅ |
| cycling | ❌ (누락) |
| walking_urban | ✅ |

이전 STRONG=8 집계에서 korean_cuisine, shopping, cycling 3개가 누락됨.

### ai_eligible 재계산

| 판정 | 수정 전 | 수정 후 |
|---|---|---|
| YES | 5 | 7 |
| CONDITIONAL | 38 | 37 |
| NO | 1 | 1 |

YES 7개: heritage_history, traditional_culture, nature_trekking, hangang_experience, family_kids, night_view, walking_urban

### 원인

summary 블록은 최종 배열 확정 전에 작성된 초안 수치였음.
배열이 source of truth. 배열 재계산 후 summary 업데이트 완료.

### 수정된 파일

- `docs/data-collection/seoul/seoul-traveler-need-coverage-matrix-v1.json`
  - `_meta.description`: 44개 → 45개
  - `_meta.corrected` 필드 추가
  - `summary.total_intents`: 44 → 45
  - `summary.STRONG`: 8 → 11
  - `summary.MODERATE`: 18 → 19
  - `summary.WEAK`: 13 → 14
  - `summary.ai_eligible_YES`: 5 → 7
  - `summary.ai_eligible_CONDITIONAL`: 38 → 37
  - `_correction_note` 추가

```
TRAVELER_INTENT_TOTAL = 45
TRAVELER_INTENT_STATUS_SUM = 45 (= 11+19+14+1)
INTENT_COUNT_RECONCILED = YES
```

---

## C. IMAGE SCHEMA REVERIFICATION

### 조사 방법

새로운 API 호출 없이 기존 산출물만으로 재검증.

| 조사 대상 | 위치 | 결과 |
|---|---|---|
| LIST API image | `data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl` | `main_img` 필드 존재 |
| DETAIL API image | `data/seoul-source-audit/seoul-visitseoul-detail-dryrun-v1.jsonl` | `has_image` 필드 존재 |
| DETAIL 스크립트 | `scripts/run-visitseoul-inventory-collector-v1.py` | `content.get("main_img")` → `has_image` |
| Live samples | `data/seoul-source-audit/seoul-visitseoul-live-samples-v1.jsonl` | `images_count` 필드 존재 |

### 실측 결과

```
LIST API 전체 3,765건:
  main_img 필드 보유: 3,765 (100%)
  main_img 값 비어있지 않음: 3,765 (100%)

예시 URL:
  https://api.visitseoul.net/comm/getImage?srvcId=POST&parentSn=44&fileTy=POSTTHUMB&fileNo=3&thumbTy=M&postTy=P

DETAIL API (dryrun 16건):
  has_image=True: 16 / 16 (100%)
  (has_image = bool(content.get("main_img")) — DETAIL도 main_img 반환)
```

### 판정

```
IMAGE_SCHEMA_STATE = C: LIST_HAS_MAIN_IMAGE_AND_DETAIL_HAS_MAIN_IMAGE
  - LIST API: main_img URL 100% 보유 (full inventory JSONL에 이미 수집됨)
  - DETAIL API: main_img 반환 (dryrun has_image=True 16/16)

COLLECTOR_IMAGE_PARSER_BUG = NO
  - full inventory collector는 main_img 정상 수집함 (scripts/run-visitseoul-full-inventory-v1.py line 616)

INTEGRATED_DETAIL_CALLER_MISSED_IMAGE = YES
  - integrated_detail_caller.py가 analysis dict에 main_img URL 저장 안 함
  - 단, 이미 full inventory JSONL에 모두 존재하므로 재호출 불필요

IMAGE_PROVENANCE:
  - IMAGE_SOURCE_LIST_MAIN_IMG: visitseoul LIST /contents/list → main_img (100% 수집됨)
  - IMAGE_SOURCE_DETAIL_MAIN_IMG: visitseoul DETAIL /contents/info → main_img (동일 필드)
  - IMAGE_SOURCE_RELATED: 별도 related images 배열 — 구조 미확인 (이번 TASK 범위 외)
```

### 이전 결론 오류 원인

`integrated_detail_caller.py`가 analysis dict에 이미지 URL을 저장하지 않은 것을 보고 "Detail API 미포함"으로 잘못 판단. 실제로는 LIST API의 `main_img`가 full inventory JSONL에 이미 100% 수집되어 있었음.

### 수정된 파일

- `docs/data-collection/seoul/seoul-traveler-utility-field-gap-v1.json`
  - `photo_url` 항목: status `OTHER_SOURCE` → `STRUCTURED`
  - availability: `NOT_IN_DETAIL_API` → `100% (LIST main_img, 3,765/3,765건 이미 수집됨)`
  - `image_schema_state` 필드 추가
  - `collector_parser_bug = NO` 추가
  - `high_priority_gaps`에서 `photo_url` 제거
  - summary: STRUCTURED 12 → 13, OTHER_SOURCE 6 → 5

- `docs/data-collection/seoul/seoul-integrated-detail-strategy-v1.md`
  - NEXT-TASK-2 이미지 항목: "별도 수집 필요" → "이미 완료"
  - TIER 5 이미지 항목 수정

```
IMAGE_SCHEMA_REVERIFIED = YES
DETAIL_IMAGE_CONCLUSION = LIST_HAS_MAIN_IMAGE_AND_DETAIL_HAS_MAIN_IMAGE
COLLECTOR_IMAGE_PARSER_BUG = NO
IMAGE_PROVENANCE_DOCUMENTED = YES
ADDITIONAL_API_CALLS = 0
```

---

## D. MAIN AI FILTER CLAIM CORRECTION

### 수정 전 문제 문구

`docs/data-collection/multicity-main-data-handoff-v1.md` SECTION 3에서:

> "2. `READY=true` 또는 `city_spots에 존재` 단독으로 AI 후보가 **되지 않도록** 확인한다."

→ 현재 MAIN이 이런 구조라고 단정하는 뉘앙스.

QA 체크리스트에서:

> "AI_ITINERARY_MAIN_CHANGE_REQUIRED = YES 확인 및 구현 (7축 TV Gate 기반 필터링)"

→ 변경이 이미 확정된 것처럼 서술.

### 수정 후

```
SECTION 3 Action 2 수정:
"`READY=true` 또는 `city_spots에 존재` 단독으로 AI 후보가 결정되는 구조인지
실제 코드에서 먼저 확인한다. 만약 그런 구조가 확인된 경우, Travel Value +
eligibility + traveler intent + current usability를 반영하도록 개선한다."

QA 체크리스트 수정:
"MAIN이 실제 AI candidate filtering 코드를 먼저 검토한다. 현재 구현이
READY/data presence만으로 결정되는 구조인지 확인 후, 필요 시 개선
(CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK)"
```

```
CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK
UNVERIFIED_MAIN_IMPLEMENTATION_CLAIMS = 0
```

---

## E. TRAVEL VALUE 7-AXIS CORRECTION

### 수정 전 문제

`docs/data-collection/seoul/seoul-integrated-travel-value-policy-v1.md` Section 2에서:

```
| `YES` | TV1≥MEDIUM, TV3≥MEDIUM, TV5≥HIGH, TV7=ACTIVE/SEASONAL/RECURRING | AI 추천 자격 확정 |
```

`docs/data-collection/multicity-place-eligibility-policy-v1.md` PART 16에서:

```
AI_ITINERARY = YES: TV1≥MEDIUM, TV3≥MEDIUM, TV5≥HIGH, TV7=ACTIVE/SEASONAL/RECURRING
```

### 문제점

7축 Travel Value는 Evidence Framework이지, 모든 domain에 동일하게 적용하는 필수 산술 공식이 아님.

예시:
- 솔로 다이닝 restaurant: TV2 TRAVELER_UTILITY가 높고 TV5 INTENT_MATCH가 있으면 CONDITIONAL 가능 — TV3 KOREA_UNIQUENESS가 낮아도 적합.
- K-pop popup event: TV4 EXPERIENCE + TV5 INTENT_MATCH + TV7 CURRENT_USABILITY가 핵심.
- 할랄 식당: TV2 + TV5로 충분.

### 수정 후

고정 threshold formula 제거. 대신:

**5개 기본 Gate (필수):**

| # | 조건 |
|---|---|
| G1 | Entity / Source Identity 검증됨 |
| G2 | CURRENT_USABILITY (TV7) = 여행 시점 적합 |
| G3 | 핵심 정보 충분 (좌표, 주소 등) |
| G4 | traveler intent와 의미 있는 match |
| G5 | 하나 이상의 TV 근거 존재 |

**Domain별 주요 TV 근거 축:**

역사/궁궐: TV1+TV3+TV4 / 솔로 restaurant: TV2+TV5 / K-pop event: TV4+TV5+TV7 / 할랄: TV2+TV5

**AI 판정:**

- YES: G1~G5 모두 충족 + 다수 TV 축에서 강한 근거
- CONDITIONAL: G1~G5 충족 + traveler intent 명시 매칭 시 (조건 명시 필수)
- NO: G2 부적합(ENDED) / G4 없음 / G5 없음

```
TRAVEL_VALUE_7_AXIS_ROLE = EVALUATION_FRAMEWORK
FIXED_AI_THRESHOLD_FORMULA = REMOVED
TRAVELER_UTILITY_CAN_DRIVE_CONDITIONAL_AI_VALUE = YES
```

---

## F. CORE DOMAIN 정책 유지 확인

| 정책 | 상태 |
|---|---|
| RESTAURANT_IS_CORE_TRAVEL_DOMAIN | YES ✅ |
| EVENT_IS_CORE_TIME_SENSITIVE_TRAVEL_DOMAIN | YES ✅ |
| NATURE_TREKKING_MODEL_INTEGRATED | YES ✅ |
| SHOPPING_IS_CORE_TRAVEL_DOMAIN | YES ✅ |
| KPOP_DISCOVERY_FROM_VISITSEOUL | CONDITIONAL ✅ |
| COUNT_TARGET | NOT_DEFINED_BY_DESIGN ✅ |
| NUMERIC_PRUNING_POLICY | FORBIDDEN ✅ |
| CATEGORY_BLANKET_EXCLUSION | FORBIDDEN ✅ |
| SOURCE_CONTENT_EQUALS_PHYSICAL_PLACE | NO ✅ |
| GENERIC_ENTITY_RELATION_MODEL_REQUIRED | YES (M:N) ✅ |

---

## G. NEXT DETAIL STRATEGY

### 수요 기반 분류 (건수 목표 없음)

| 분류 | 대상 | 비고 |
|---|---|---|
| A. DETAIL_REQUIRED_NOW | PLACE_CORE 中 list 정보만으로 TV 판단 불가한 경우 / PLACE_CONDITIONAL 中 track 전환 가능성 | 건수 quota 없음 |
| B. DETAIL_ALREADY_SUFFICIENT | Nature 119건, Restaurant 40건, Event 35건, Shopping 18건, Experience 12건, K-pop 8건 | policy 확정됨 |
| C. UTILITY_ENRICHMENT | 할랄/비건/솔로 특화 restaurant — SPECIALTY_INTEREST 분류 확인 | 건수 목표 없음 |
| D. EVENT_DATE_ENRICHMENT | description→regex→official site 순 날짜 보강 파이프라인 | 별도 task 설계 |
| E. OTHER_OFFICIAL_SOURCE_REQUIRED | 하이브 인사이트/SM TOWN (VisitSeoul 미등록) / 할랄 인증 공식 리스트 / 비건 HappyCow | 외부 source 연동 |
| F. EXTERNAL_SEARCH_LAYER_SUITABLE | 일반 체인 지점 수백 개 | canonical detail 불필요 |
| G. USER_ENRICHMENT_SUITABLE | 솔로 다이닝/외국어 메뉴/알레르기/웨이팅 | UGC 장기 보강 |
| H. HOLD / USER_REVIEW_REQUIRED | YG/JYP/FNC 사옥, UNKNOWN TYPE, EXPERIENCE_CANDIDATE 4건 | 수동 검토 |

**IMAGE_ENRICHMENT 재분류: B (DETAIL_ALREADY_SUFFICIENT)**
- main_img 이미 full inventory JSONL에 100% 수집됨

**Event date 추출 설계 확정:**
```
1. post_desc / sumry에서 날짜 regex 추출
2. extra.cmmn_hmpg_url 공식 사이트 확인
3. 기타 공식 source
```

이번 TASK에서 Event 1,190건 bulk date extraction 금지.

---

## H. 수정된 문서 목록

| 파일 | 수정 내용 |
|---|---|
| `docs/data-collection/seoul/seoul-traveler-need-coverage-matrix-v1.json` | 수정 1: summary 재계산 (45, STRONG=11, MODERATE=19, WEAK=14, ai_YES=7, ai_COND=37) |
| `docs/data-collection/seoul/seoul-traveler-utility-field-gap-v1.json` | 수정 2: photo_url STRUCTURED, main_img 100% available, 보강 우선순위 LOW |
| `docs/data-collection/seoul/seoul-integrated-travel-value-policy-v1.md` | 수정 4: Section 2 고정 threshold 제거, 5개 기본 Gate + Evidence Framework로 교체. Section 3 PLACE_CORE 자동 YES 보장 표현 제거 |
| `docs/data-collection/seoul/seoul-integrated-detail-strategy-v1.md` | 수정 2 반영: 이미지 항목 수정. Section E: 건수 quota 기반 → 수요 기반 분류(A~H)로 교체 |
| `docs/data-collection/multicity-main-data-handoff-v1.md` | 수정 3: MAIN AI filter 단정 표현 → 조건부 ("확인 후 판단") 수정. QA 체크리스트 항목 수정 |
| `docs/data-collection/multicity-place-eligibility-policy-v1.md` | 수정 4: PART 16 고정 threshold 수식 → Evidence Framework 참조로 교체 |
| `docs/data-collection/seoul/seoul-travel-value-correction-gate-v1.md` | **신규** (이 문서) |

---

## I. SCRIPT / PARSER CHANGES

```
SCRIPT_CHANGES = NONE
```

- `integrated_detail_caller.py`가 main_img를 저장하지 않은 것은 확인됨
- 단, full inventory JSONL에 이미 모두 수집되어 있으므로 script 수정 불필요
- 향후 detail caller에서 main_img를 함께 저장하는 것은 선택적 개선 사항 (이번 TASK 범위 외)

---

## J. SAFETY

| 항목 | 값 |
|---|---|
| NEW_API_CALLS | **0** |
| SECRET_LEAK | 0 |
| DB_CHANGE | 0 |
| SRC_PRODUCT_CHANGE | 0 |
| UI_CHANGE | 0 |
| MASTER_TOUCH | 0 |
| BUSAN_GYEONGJU_BRANCH_TOUCH | 0 |
| git add . 또는 git add -A | 사용 안 함 |
| FULL_DETAIL_COLLECTION | NOT_STARTED |

---

## K. GIT

| 항목 | 값 |
|---|---|
| START SHA | `7f9fae5` |
| BRANCH | `data/seoul-collection-v1` |
| 수정 파일 수 | 7개 (신규 1 + 기존 6 수정) |
| PUSH | 이 문서 작성 후 commit & push |

---

## 최종 QA 플래그

```
INTENT_COUNT_RECONCILED = YES
TRAVELER_INTENT_TOTAL = 45
TRAVELER_INTENT_STATUS_SUM = 45 (STRONG=11 + MODERATE=19 + WEAK=14 + NOT_AVAILABLE=1)

IMAGE_SCHEMA_REVERIFIED = YES
DETAIL_IMAGE_CONCLUSION = LIST_HAS_MAIN_IMAGE_AND_DETAIL_HAS_MAIN_IMAGE
COLLECTOR_IMAGE_PARSER_BUG = NO
IMAGE_PROVENANCE_DOCUMENTED = YES
ADDITIONAL_API_CALLS = 0

CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK
UNVERIFIED_MAIN_IMPLEMENTATION_CLAIMS = 0

TRAVEL_VALUE_7_AXIS_ROLE = EVALUATION_FRAMEWORK
FIXED_AI_THRESHOLD_FORMULA = REMOVED
TRAVELER_UTILITY_CAN_DRIVE_CONDITIONAL_AI_VALUE = YES

COUNT_TARGET_DEFINED = NO
NUMERIC_PRUNING_POLICY = FORBIDDEN

RESTAURANT_IS_CORE_TRAVEL_DOMAIN = YES
EVENT_IS_CORE_TIME_SENSITIVE_TRAVEL_DOMAIN = YES
NATURE_TREKKING_MODEL_INTEGRATED = YES

SOURCE_CONTENT_EQUALS_PHYSICAL_PLACE = NO
GENERIC_ENTITY_RELATION_MODEL_REQUIRED = YES

NATURE_RECALLED = 0
NEW_API_CALLS = 0
FULL_DETAIL_COLLECTION = NOT_STARTED

DB_CHANGE = 0
SRC_PRODUCT_CHANGE = 0
UI_CHANGE = 0
SECRET_LEAK = 0

NEXT_DETAIL_COLLECTION_STRATEGY_READY = YES
```

### NEXT_DETAIL_COLLECTION_STRATEGY_READY = YES 판정 근거

| 조건 | 충족 |
|---|---|
| intent 집계 정합성 완료 | ✅ (45건, STRONG=11 재계산) |
| image field 실제 구조 확정 | ✅ (LIST main_img 100%, 이미 수집됨) |
| MAIN 미검증 표현 수정 | ✅ (조건부 표현으로 수정) |
| fixed threshold 제거 | ✅ (Evidence Framework으로 교체) |
| integrated detail strategy 업데이트 | ✅ (수요 기반 A~H 분류) |
| Restaurant/Event/Nature/Shopping/Experience 동일 원칙 유지 | ✅ |
