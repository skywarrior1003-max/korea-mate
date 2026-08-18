# TASK-JEONJU-OFFICIAL-SOURCE-FOUNDATION-AND-RAW-COLLECTION-V2 State

| 항목 | 값 |
|---|---|
| TASK | TASK-JEONJU-OFFICIAL-SOURCE-FOUNDATION-AND-RAW-COLLECTION-V2 |
| 완료일 | 2026-08-18 |
| BRANCH | data/jeonju-targeted-completion-v1 |
| JEONJU_COMMON_POLICY_COMMIT | bc8d5d4 |
| FINAL_QA | PASS |
| SAFE_TO_PROCEED | YES |
| NEXT_TASK | TASK-JEONJU-CURATION-V1 (한옥 experiential 심사 포함) |

---

## Baseline

- **BRANCH**: `data/jeonju-targeted-completion-v1`
- **JEONJU_COMMON_POLICY_COMMIT**: `bc8d5d4`
- **JEONJU_BBOX**: lat 35.7–35.9 / lng 127.0–127.2 (common policy 기존 정의)
- **EXISTING_RAW**: 없음 (V1 검증 확인, 실제 repo 재확인)

---

## V1 Findings Applied

| IMPROVE | 내용 | 적용 결과 |
|---|---|---|
| IMPROVE-1 | KTO KorService2 + areaCode=37 + sigunguCode=12 | ✅ 적용. KTO_SCOPE_VALID=YES, LEAK=0 |
| IMPROVE-2 | openapi.jeonju.go.kr 역할 제한 (한옥 전용) | ✅ 적용. HTTP 500 확인, PLACE_PRIMARY 아님 |
| IMPROVE-3 | visitjeonju.com 403 → 대체 source | ✅ 적용. 도메인 탈취(도박사이트) 추가 확인 |
| IMPROVE-4 | KTO EngService2 EN=0 | ✅ 적용. tour.jeonju.go.kr/eng 대체 확인 |

---

## Source Matrix

| 영역 | PRIMARY | SECONDARY | STATUS |
|---|---|---|---|
| PLACE | tour.jeonju.go.kr (비짓전주, SPA) | KTO KorService2 (areaCode=37, sigunguCode=12) | SPA 미수집, KTO 수집 완료 |
| FOOD | tour.jeonju.go.kr (미수집) | KTO contentTypeId=39 | KTO 66건 수집 |
| EVENT | 전주시/전북 공식 | KTO contentTypeId=15 | KTO 9건 수집, freshness 검증 필요 |
| PROMOTION | tour.jeonju.go.kr | — | 미확인 (FUTURE_WORK) |
| TOURISM_NEWS | tour.jeonju.go.kr, jeonju.go.kr | — | 미확인 (FUTURE_WORK) |

## Multilingual

| 언어 | 상태 | Source |
|---|---|---|
| KO | FULL | tour.jeonju.go.kr, tour.jb.go.kr, KTO |
| EN | PARTIAL | tour.jeonju.go.kr/eng (확인됨, 데이터 미수집) |
| JA | PARTIAL | tour.jeonju.go.kr/jpn (확인됨, 데이터 미수집) |
| ZH | GAP | tour.jeonju.go.kr/chn=404, tour.jb.go.kr ZH=soft404 |

---

## KTO Collection

```
SERVICE        = KorService2
AREA_CODE      = 37 (전북특별자치도)
SIGUNGU_CODE   = 12 (전주시)
SCOPE_VALID    = YES
NON_JEONJU_LEAK = 0
BBOX_FAIL      = 0

contentTypeId=12 (관광지):       46건
contentTypeId=14 (문화시설):     22건
contentTypeId=15 (행사):          9건
contentTypeId=25 (여행코스):      0건
contentTypeId=28 (레포츠):        2건
contentTypeId=32 (숙박):         80건
contentTypeId=38 (쇼핑):          4건
contentTypeId=39 (음식점):       66건
TOTAL                          229건
```

## Phase 9 Eligibility (KTO 229건)

```
CORE_DESTINATION_CANDIDATE           63건 (63=Heritage41+CulturalFacility11+KTO11)
FOOD_CANDIDATE                       66건
STANDARD_ACCOMMODATION (제외)        60건
ACTIVITY_OR_OPERATOR_REVIEW          20건 (한옥숙박 — KEEP_EXPERIENTIAL 심사 필요)
CONDITIONAL_OR_SEASONAL_CANDIDATE    10건
EVENT_CANDIDATE                       9건
SPECIALTY_INTEREST_CANDIDATE          1건
```

## Coverage (비숙박 169건 기준)

```
ADDRESS_COVERAGE    = 169/169 (100%)
COORD_COVERAGE      = 169/169 (100%)
IMAGE_COVERAGE      = 130/169 (77%)
PHONE_COVERAGE      =   9/169 (5%)
BBOX_VALID          = 229/229 (100%)
```

## QA

```
EXISTING_RAW_FIRST                  = PASS (기존 0건 확인)
OFFICIAL_PRIMARY                    = PASS (KTO blanket 아님, source matrix 정의)
KTO_SCOPE_VALID                     = YES
KTO_NON_JEONJU_SCOPE_LEAK           = 0
ACTIVITY_BLANKET_EXCLUSION          = 0 (20건 개별 review 보존)
STANDARD_ACCOMMODATION_AUTO_PROMOTION = 0
FAKE_COORD                          = 0
FAKE_IMAGE                          = 0
CONSUMER_MAP_BULK_SCRAPING          = 0
SECRET_LEAK                         = 0
VISITJEONJU_BYPASS_ATTEMPT          = 0
OTHER_CITY_DATA_CHANGED             = 0
MASTER_CHANGED                      = 0
PRODUCTION_CHANGED                  = 0
DETERMINISTIC_QA                    = PASS
```

## Common Policy

- `CITY_SPECIFIC_FINDINGS`: visitjeonju.com 도메인 탈취(도박사이트) — 다른 도시에도 관광 공식 웹사이트 탈취 점검 권장
- `COMMON_POLICY_CANDIDATES`: 없음
- `COMMON_POLICY_CHANGED`: NO

## Raw Files

| 파일 | 설명 | 건수 |
|---|---|---|
| `data/jeonju-raw-collection-v1/jeonju-kto-raw-v1.jsonl` | KTO 전주시 전체 229건 | 229 |
| `data/jeonju-raw-collection-v1/jeonju-source-matrix-v1.json` | 소스 역량/접근 현황 | — |
| `data/jeonju-raw-collection-v1/jeonju-eligibility-prelim-v1.json` | 예비 eligibility 분류 | — |
| `data/jeonju-raw-collection-v1/jeonju-hanok-review-candidates-v1.jsonl` | 한옥 체험 심사 대상 | 20 |

---

## Final Decision

```
JEONJU_SOURCE_FOUNDATION         = PASS_WITH_WARN
JEONJU_RAW_COLLECTION_STARTED    = YES
PLACE_SOURCE_READY               = PARTIAL (KTO 수집 완료, 비짓전주 SPA 미수집)
FOOD_SOURCE_READY                = PARTIAL (KTO 66건, 전화/운영시간 미확보)
EVENT_SOURCE_READY               = PARTIAL (KTO 9건, freshness 검증 필요)
PROMOTION_SOURCE_READY           = NO (공식 source 탐색 필요)
TOURISM_NEWS_SOURCE_READY        = NO (공식 공지 탐색 필요)
MULTILINGUAL_SOURCE_STATUS       = PARTIAL (EN/JA URL 확인, ZH GAP)
SAFE_TO_PROCEED_TO_JEONJU_CURATION = YES
NEXT_RECOMMENDED_TASK            = TASK-JEONJU-CURATION-V1
```

---
PASS_WITH_WARN 사유: tour.jeonju.go.kr SPA 데이터 미수집(JS 렌더링 필요), ZH 커버리지 갭, Food 전화번호/운영시간 미확보. 이는 모두 curation 단계에서 보완 가능한 항목으로 raw foundation으로서 충분.
