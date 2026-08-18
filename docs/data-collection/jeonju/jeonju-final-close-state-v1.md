# TASK-JEONJU-TARGETED-FINAL-ENRICHMENT-QA-AND-CLOSE-V1 State

**Status**: COMPLETE (PASS)
**Branch**: `data/jeonju-targeted-completion-v1`
**As-of**: 2026-08-18
**Prev HEAD**: `d71e4c6` (TASK-JEONJU-ENTITY-FIRST-CURATION-V1)

---

## Baseline

```
REPO_ROOT            = korea-mate/
BRANCH               = data/jeonju-targeted-completion-v1
START_HEAD           = d71e4c6
COMMON_POLICY_COMMIT = bc8d5d4
PHASE1_FILE          = data/jeonju-raw-collection-v1/jeonju-curation-phase1-v1.json
PHASE1_SERVICE       = 237
PHASE1_RELATION      = 82
PHASE1_NOT_SERVICE   = 80
PHASE1_REVIEW        = 25
PHASE1_TOTAL         = 424
```

---

## Step 0 — 수치 불일치 해소

### NOT_SERVICE_SPOT 80 분해 (확정)

```
ACCOMMODATION_STD:          73  (official 13 + KTO 60)
PLACE_LOW_TOURISM_GATE:      5
WHOLESALE_MARKET_GATE:       1
CONTENT_UNAVAILABLE_GATE:    1
TOTAL:                      80  ✓
```

이전 보고서의 Layer 3 설명("ACCOMMODATION_STD: 79")은 집계 오류 표기였으며,
실제 JSON 데이터의 총계 80은 정확함.

### TOURISM_REVIEW 5번째 항목 확인

```
PLACE_TOURISM_REVIEW (4):  불정사(317526)·약수암(337432)·청하서원(1957104)·학소암(485691)
PLACE_TOURISM_UNCERTAIN(1): 세병공원(2759662) ← 5번째 항목
```

---

## W1 — Event 9건 Freshness Gate

**API**: KorService2/detailIntro2 (contentTypeId=15)  
**판정일**: 2026-08-18

| cid | title | start | end | status |
|-----|-------|-------|-----|--------|
| 3569496 | 담그랑께 나누랑께 | 20251130 | 20251130 | EXPIRED |
| 2838316 | 무형유산원 나들이 | 20250927 | 20250928 | EXPIRED |
| 3468240 | 전라관찰사의 탄생 | 20251018 | 20251130 | EXPIRED |
| 3381612 | 전주막걸리축제 | 20251031 | 20251101 | EXPIRED |
| 2642299 | 전주제야축제 | 20251231 | 20251231 | EXPIRED |
| 2767541 | 제19회 전북과학축전 | 20251017 | 20251019 | EXPIRED |
| 1855589 | 제19회 전북청소년영화제 | 20251107 | 20251108 | EXPIRED |
| 2861680 | 제8회 전주국제단편영화제 | 20250925 | 20250929 | EXPIRED |
| 3522298 | 2025 전주드론축구월드컵 | 20250925 | 20250928 | EXPIRED |

```
W1_RESULT     = 9/9 EXPIRED
ACTIVE_CURRENT = 0
ACTIVE_FUTURE  = 0
EXPIRED        = 9
EXPIRED_EVENT_ACTIVE_PROMOTION = 0  ← 정책 준수
```

전주 이벤트 9건 모두 2025년 개최 완료. 현재 2026-08-18 기준 활성 이벤트 없음.
향후 재개최 확인 후 re-activation 가능.

---

## W2 — 한옥 20건 KEEP_EXPERIENTIAL 심사

**기준**: 체험 프로그램 명시 / 고택(전통 건물) / 숙박 자체가 관광 경험으로 성립

### KEEP_EXPERIENTIAL (5건 → ACTIVE_SERVICE)

| cid | title | 근거 |
|-----|-------|------|
| 1972487 | 시원 한옥체험관 | "체험관" 명시 — 전통 체험 시설 |
| 2610549 | 예원당(한옥체험 예원당) | "한옥체험" 명시 |
| 2610985 | 전주 한옥숙박 체험관 | "체험관" 명시 |
| 3469822 | 대동고택 | "고택" — 역사적 전통 건물 |
| 2708322 | 이화고택 | "고택" — 역사적 전통 건물 |

### STANDARD_ACCOMMODATION_EXCLUDE (15건 → NOT_SERVICE_SPOT)

길건너한옥마을·대성 정담한옥·더 한옥·라온한옥꿀잠·마당예쁜집·  
백년한옥·사랑나무 한옥펜션·이가한옥·전주 한옥마을 덕수궁·  
전주한옥마당·전주한옥마을 산아래·전주한옥숙박 사랑루·  
한옥미담·한옥이야기·홍시

```
W2_KEEP_EXPERIENTIAL       = 5
W2_STANDARD_EXCLUDE        = 15
HANOK_REVIEW_RESOLVED      = 20/20  ✓
```

---

## W3 — Tourism Review 5건 Final

**기준**: cat3 분류 + 위치 맥락 + 관광 가치

### KEEP_TOURISM (4건 → ACTIVE_SERVICE)

| cid | title | cat3 | 근거 |
|-----|-------|------|------|
| 317526 | 불정사(전주) | 사찰(A02010800) | 남고산성 내 불교 사찰 — 문화유산 관광 가치 |
| 337432 | 약수암(전주) | 사찰(A02010800) | 도당산 산중 암자 — 자연·영적 관광 |
| 1957104 | 청하서원 | 휴양림(A02010700)* | 전통 유교 서원 — 역사문화 유산 |
| 485691 | 학소암(전주) | 사찰(A02010800) | 산중 암자 — 자연·문화 관광 |

*청하서원 cat3=A02010700(휴양림)은 KTO 분류 오류 가능성, 실제는 서원(역사문화시설)

### EXCLUDE (1건 → NOT_SERVICE_SPOT)

| cid | title | cat3 | 근거 |
|-----|-------|------|------|
| 2759662 | 세병공원 | 문화원(A02020700) | 도심 공원 — KEEP_SET 미포함, 관광 목적지 기준 미달 |

```
W3_KEEP_TOURISM  = 4
W3_EXCLUDE       = 1
TOURISM_REVIEW_RESOLVED = 5/5  ✓
```

---

## W4 — 한옥레일바이크 Identity Check

```
OFFICIAL:  OFF-9764  sid=9764  (문화시설)  lat=35.8295  lng=127.1761
KTO:       KTO-2426995  cid=2426995  (레포츠)  lat=35.8297  lng=127.1760
ADDRESS:   both = 전주시 덕진구 동부대로 420 (우아동1가)
NAME:      both = 전주한옥레일바이크
DISTANCE:  ~26m (GPS 오차 범위)
DECISION:  SAME_ENTITY_CONFIRMED
```

**Action**: KTO-2426995 merged into OFF-9764 (removed as standalone)  
OFF-9764 유지 (official coord + phone 063-273-7788 보유)

```
W4_MERGE         = CONFIRMED
MERGED_PAIRS     = 5 total (베테랑칼국수·전라감영·자매갈비전골·한벽굴·한옥레일바이크)
```

---

## 최종 서비스 카탈로그

### 산출 파일

```
A  data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json
   → 553KB, 423 candidates (424 - 1 W4 merge)
   → W1/W2/W3/W4 결정 포함
   → 최종 eligibility 반영
```

### Layer 1: ACTIVE SERVICE CATALOG (236건)

```
PLACE_CULTURAL:          72  (AI_AUTO)
FOOD:                    68  (AI_CONDITIONAL)
PLACE_TOURISM:           34  (AI_AUTO)
PLACE_HERITAGE:          25  (AI_AUTO)
PLACE_NATURE:            12  (AI_AUTO)
PLACE_GENERAL:           12  (AI_AUTO)
ACCOMMODATION_HANOK_KEEP: 5  (AI_CONDITIONAL) ← W2 신규
PLACE_TOURISM_KEEP:       4  (AI_AUTO)        ← W3 신규
SPECIALTY_INTEREST:       3  (AI_CONDITIONAL)
ACTIVITY_EXPERIENCE:      1  (AI_CONDITIONAL)
TOTAL:                  236
```

### Layer 2: EVENT EXPIRED (9건)

2025년 개최 완료. 재개최 확인 후 re-activation 가능.

### Layer 3: RELATION CONTEXT (82건)

```
EDITORIAL: 53  (지금전주는12+이달의추천여행12+스토리관광9+플레이전주여행12+미식여행editorial8)
COURSE:    29  (여행코스18+트레킹코스11)
```

### Layer 4: EXCLUDED (96건)

```
ACCOMMODATION_STD:        88  (original 73 + W2 standard 15)
PLACE_LOW_TOURISM_GATE:    6  (original 5 + W3 세병공원 1)
WHOLESALE_MARKET_GATE:     1
CONTENT_UNAVAILABLE_GATE:  1
```

### REVIEW_REQUIRED: 0 (전건 해소)

---

## 5-Axis Product Eligibility (ACTIVE SERVICE 236건)

```
SEARCHABLE       = 236/236  ✓  (전체)
EXPLORE          = 235/236  ✓  (건지산 1건 제외 — 좌표 없음)
AI_ITINERARY     = 236/236  ✓  (전체)
USER_CAN_SELECT  = 235/236  ✓  (건지산 1건 제외)
USER_CAN_SAVE    = 235/236  ✓  (건지산 1건 제외)

AI_MODE:
  AI_AUTO       = 159  (PLACE_* 도메인)
  AI_CONDITIONAL =  77  (FOOD·ACTIVITY·SPECIALTY·HANOK_KEEP)
```

---

## Gap Finalization (ACTIVE SERVICE 236건)

```
┌───────────────────────────┬──────┬────────────────────────────┐
│ Gap                       │ 건수 │ Priority                   │
├───────────────────────────┼──────┼────────────────────────────┤
│ NAV_GAP                   │    1 │ REQUIRED_BEFORE_PUBLIC     │
│   (건지산 — 좌표·주소 없음)│      │                            │
├───────────────────────────┼──────┼────────────────────────────┤
│ EVENT_DATE_GAP            │    0 │ REQUIRED_BEFORE_AI (해소됨)│
├───────────────────────────┼──────┼────────────────────────────┤
│ IMAGE_GAP                 │   30 │ NICE_TO_HAVE               │
│ PHONE_GAP (Food/Activity) │   70 │ NICE_TO_HAVE               │
└───────────────────────────┴──────┴────────────────────────────┘
```

**NAV_GAP 비고**:  
자매갈비전골(OFF-16133)은 has_coord=False이나 KTO 보완 좌표 있음 (kto_lat=35.8199, kto_lng=127.1535) → EXPLORE=True.  
실질적 NAV_GAP = 건지산(OFF-13619) 1건만.

---

## Final QA

```
TOTAL_UNIQUE_CANDIDATES_ACCOUNTED  = 423/423 ✓  (424 - 1 W4 merge)
ACTIVE_SERVICE + EXPIRED + EXCLUDED + RELATION = 236+9+96+82 = 423 ✓
REVIEW_REQUIRED_REMAINING          = 0 ✓  (25/25 해소)
FAKE_COORD                         = 0 ✓
FAKE_ENTITY_NAME                   = 0 ✓
EXPIRED_EVENT_ACTIVE_PROMOTION     = 0 ✓
ESTIMATED_COORD_GENERATED          = 0 ✓
STANDARD_ACCOMMODATION_IN_CATALOG  = 0 ✓ (88건 모두 EXCLUDED)
COMMON_POLICY_CHANGED              = 0 ✓
MASTER_CHANGED                     = 0 ✓
HERITAGE_FILL_UNTRACKED_TOUCHED    = 0 ✓
ELIGIBILITY_COMPLETE               = 236/236 ✓
DISPLAY_NAME_SERVICE_COMPLETE      = 236/236 ✓
DETERMINISTIC_QA                   = PASS
```

---

## Commit Files

```
A  data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json
   → 553KB, 423 candidates, final_status per entity
   → W1~W4 decisions + gap_analysis + eligibility_summary

A  docs/data-collection/jeonju/jeonju-final-close-state-v1.md
   → 이 문서
```

---

## Close Decision

```
JEONJU_FINAL_CLOSE_STATUS     = COMPLETE
ACTIVE_SERVICE_CATALOG        = 236
EVENT_EXPIRED                 = 9
EXCLUDED                      = 96
RELATION_CONTEXT              = 82
TOTAL_UNIQUE                  = 423
CONFIRMED_MERGES_TOTAL        = 5
FAKE_COORD                    = 0
FAKE_ENTITY_NAME              = 0
REVIEW_REQUIRED_REMAINING     = 0
SAFE_TO_CLOSE                 = YES
NEXT                          = JEONJU data/jeonju-targeted-completion-v1 branch close, NEXT_CITY=TBD
```
