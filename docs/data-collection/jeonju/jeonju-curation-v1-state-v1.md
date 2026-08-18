# TASK-JEONJU-ENTITY-FIRST-CURATION-V1 State

**Status**: COMPLETE (PASS)
**Branch**: `data/jeonju-targeted-completion-v1`
**As-of**: 2026-08-18

---

## Baseline

```
REPO_ROOT                    = korea-mate/
BRANCH                       = data/jeonju-targeted-completion-v1
START_HEAD                   = 949392a  (V7 title audit complete)
COMMON_POLICY_COMMIT         = bc8d5d4
SOURCE_TOTAL                 = 428
FINAL_INTEGRATED_UNIQUE_PRE  = 425  (before Phase 9)
FINAL_INTEGRATED_UNIQUE_POST = 424  (after Phase 9 new merge)
```

---

## Phase 1 — Candidate Classification

### Classification Rules

| Official Menu Title | Phase 1 Bucket | Domain |
|---------------------|----------------|--------|
| 문화시설 | SERVICE_ENTITY | PLACE_CULTURAL |
| 주요명소/역사전통 | SERVICE_ENTITY | PLACE_HERITAGE |
| 향토유산 | SERVICE_ENTITY | PLACE_HERITAGE |
| 주요관광지 | SERVICE_ENTITY | PLACE_GENERAL |
| 자연생태 | SERVICE_ENTITY | PLACE_NATURE |
| 미식여행 (entity page) | SERVICE_ENTITY | FOOD |
| K-라이프스타일 | SERVICE_ENTITY | SPECIALTY_INTEREST |
| 숙박 | NOT_SERVICE_SPOT | ACCOMMODATION_STD |
| 여행코스 | RELATION_OR_CONTEXT | COURSE |
| 트레킹코스 | RELATION_OR_CONTEXT | COURSE |
| 이달의추천여행 | RELATION_OR_CONTEXT | EDITORIAL |
| 지금전주는 | RELATION_OR_CONTEXT | EDITORIAL |
| 스토리관광 | RELATION_OR_CONTEXT | EDITORIAL |

**Phase 3 Reclassifications (confirmed via source_url HTML inspection):**
- `플레이전주여행` (12건): 에디토리얼 동영상/브이로그 기사 → RELATION_OR_CONTEXT / EDITORIAL
- `미식여행 CLASS_C` (8건): 카테고리 기사 (브런치 시리즈, 빵지순례 등) → RELATION_OR_CONTEXT / EDITORIAL
- `K-라이프스타일 sid=14451`: 1,696 bytes 응답 (콘텐츠 없음) → NOT_SERVICE_SPOT / CONTENT_UNAVAILABLE_GATE

### Final Phase 1 Totals (before Phase 9)

```
SERVICE_ENTITY       = 238
RELATION_OR_CONTEXT  = 82
NOT_SERVICE_SPOT     = 80
REVIEW_REQUIRED      = 25
TOTAL                = 425
```

### SERVICE_ENTITY Breakdown

```
PLACE_CULTURAL:   72  (official 문화시설 50 + KTO 문화시설 22)
FOOD:             68  (official 미식여행 entity 4 + KTO 음식점 64)
PLACE_TOURISM:    35  (KTO 관광지 KEEP_SET)
PLACE_HERITAGE:   25  (official 주요명소/역사전통 18 + 향토유산 7)
PLACE_NATURE:     12  (official 자연생태 12)
PLACE_GENERAL:    12  (official 주요관광지 12)
EVENT:             9  (KTO 행사 9)
SPECIALTY_INTEREST: 3 (KTO 쇼핑 3 — 남부시장·도깨비시장·관광기념품관)
ACTIVITY_EXPERIENCE: 2 (KTO 레포츠 2 — 학생교육문화관·한옥레일바이크)
TOTAL:           238
```

### NOT_SERVICE_SPOT Breakdown

```
ACCOMMODATION_STD:         66  (KTO 숙박 표준 — STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT 정책)
ACCOMMODATION_STD(off):    13  (official 숙박 13)
PLACE_LOW_TOURISM_GATE:     5  (KTO 관광지 EXCLUDE_SET — 나들목가족공원 등)
WHOLESALE_MARKET_GATE:      1  (KTO cid=2750890 전주시농수산물도매시장)
CONTENT_UNAVAILABLE_GATE:   1  (official sid=14451 K-라이프스타일 — 콘텐츠 없음)
TOTAL:                     80  (13 official + 67 KTO)
```

### REVIEW_REQUIRED Breakdown

```
ACCOMMODATION_HANOK_REVIEW:  20  (KTO 숙박 중 한옥·고택·체험 키워드 — KEEP_EXPERIENTIAL 심사)
PLACE_TOURISM_REVIEW:         4  (KTO 관광지 cid=317526,337432,485691,1957104)
PLACE_TOURISM_UNCERTAIN:      1  (KTO 관광지 KEEP_SET 미포함)
TOTAL:                       25
```

---

## Phase 3 — Display Name Recovery (source_url fetches)

```
RECORDS_FETCHED          = 116  (SERVICE_ENTITY CLASS_C 112 + CLASS_B 4)
FETCH_ERRORS             = 0
PARSE_SUCCESS            = 107
PARSE_FAIL               = 9  (향토유산 7 re-parsed correctly, K-라이프 1 unavailable, empty 1)

RELATION_OR_CONTEXT_FETCHED = 43  (editorial/course display names)
RELATION_RESOLVED           = 32

TOTAL_DISPLAY_NAME_RESOLVED = 367 / 424  (87%)
UNRESOLVED (non-SERVICE)    = 57  (트레킹코스·스토리관광 일부 + 숙박·CONTENT_UNAVAILABLE)
SERVICE_ENTITY_UNRESOLVED   = 0  (모든 SERVICE_ENTITY 이름 확보)
```

### HTML Parsing Pattern (BBS_0000003 게시판)

```
Primary:   <div class="dbView_info"> → <h3> → <em>슬로건</em> ENTITY_NAME
Fallback:  <div class="dbView_info"> → <h3> (no em tag, e.g. 향토유산)
BBS_0000038 (미식여행): <h3>ARTICLE_TITLE</h3> <ul class="list_info">
```

### CLASS_B Records Resolved via Phase 3

| sid | 주요명소/역사전통 | 복원된 이름 | 비고 |
|-----|---------|---------|------|
| 10118 | 동고산성·동고사 | source_url_detail_fetch | |
| 15637 | 정혜사 | source_url_detail_fetch | |
| 16670 | 한벽굴 | source_url_detail_fetch | V6 MEDIUM → Phase 9 CONFIRMED_MERGE |
| 16671 | 전주사고 | source_url_detail_fetch | |

---

## Phase 5 — Essential Info Gate (SERVICE_ENTITY 237건)

```
NAV_READY             = 236  (has_coord: official 좌표 또는 KTO 좌표)
NAV_ANCHOR            = 1    (공식 좌표 없음, KTO 좌표 보완)
LOCATION_INSUFFICIENT = 1    (좌표 없음, 주소 없음)
ADDRESS_READY         = 0
```

---

## Phase 6 — Travel Value Curation (SERVICE_ENTITY 237건)

```
CORE_DESTINATION = 156  (PLACE_* 도메인 합계)
FOOD             = 68
EVENT            = 9    (Event freshness gate 필요 — detailCommon2 fetch)
ACTIVITY         = 2
SPECIALTY        = 3    (쇼핑: 남부시장·도깨비시장·관광기념품관)
```

---

## Phase 7 — Product Eligibility (SERVICE_ENTITY 237건)

```
SEARCHABLE         = 237  (모든 SERVICE_ENTITY)
EXPLORE            = 236  (LOCATION_INSUFFICIENT 1건 제외)
AI_ITINERARY       = 237
USER_CAN_SELECT    = 236
USER_CAN_SAVE      = 236

AI_MODE:
  AI_AUTO       = ~149  (PLACE_* 도메인)
  AI_CONDITIONAL = ~88  (FOOD·EVENT·ACTIVITY·SPECIALTY)
```

---

## Phase 8 — Gap Inventory (SERVICE_ENTITY 237건)

```
PHONE_GAP         = 130  (~55% — KTO 음식점 대부분 TEL 없음)
IMAGE_GAP         = 26   (~11% — 일부 관광지·공간)
EVENT_DATE_GAP    = 9    (행사 9건 모두 — detailCommon2 fetch 필요)
NAV_GAP           = 1    (LOCATION_INSUFFICIENT 1건)

Priority:
  REQUIRED_BEFORE_AI:      EVENT_DATE_GAP (9건)
  REQUIRED_BEFORE_PUBLIC:  NAV_GAP (1건)
  NICE_TO_HAVE:            PHONE_GAP, IMAGE_GAP
```

---

## Phase 9 — Identity Recheck

### 신규 HIGH_CONFIDENCE MERGE (1건)

```
TYPE:           CONFIRMED_MERGE_PHASE9
OFFICIAL:       sid=16670, 주요명소/역사전통, display_name=한벽굴 (source_url_detail_fetch)
KTO:            cid=2946402, 관광지(KEEP_SET), title=한벽굴
EVIDENCE:       EXACT_NAME + COORD_VERY_CLOSE (10m, 35.8119)
V6_PRIOR:       SAME_ENTITY_MEDIUM_CONFIDENCE (미확정)
ACTION:         KTO-2946402 → merged into OFF-16670 (removed from standalone)
KTO_SUPPLEMENT: coord(already_in_official), addr1, image_url

TOTAL_CONFIRMED_PAIRS = 4
  1. OFF-16310 베테랑칼국수 ↔ KTO-2759615 (EXACT_MATCH, V5)
  2. OFF-10114 전라감영 ↔ KTO-3066348 (STRONG_MATCH, V5)
  3. OFF-16133 자매갈비전골 ↔ KTO-2870801 (CONFIRMED_MERGE, V6)
  4. OFF-16670 한벽굴 ↔ KTO-2946402 (CONFIRMED_MERGE_PHASE9, V8-curation)
```

### 주의: 한옥레일바이크 잠재 중복

```
Official: sid=9764 (문화시설) display_name=전주한옥레일바이크 → SERVICE_ENTITY
KTO:      cid=2426995 (레포츠) title=전주한옥레일바이크 → SERVICE_ENTITY
→ WATCH-P9: 두 레코드 동일 엔티티일 가능성. 좌표 확인 후 결정 필요.
```

---

## Phase 10 — Final Catalog Summary

### Layer 1: SERVICE CATALOG (237건)

서비스 엔티티: 직접 city_spot으로 등록 가능한 장소/음식/이벤트.

```
CORE_DESTINATION = 156  (AI_AUTO: 관광지·문화시설·자연·역사)
FOOD             = 68   (AI_CONDITIONAL: 음식점·미식여행 entity)
EVENT            = 9    (AI_CONDITIONAL: 행사, freshness gate)
ACTIVITY         = 2    (AI_CONDITIONAL: 레포츠)
SPECIALTY        = 3    (AI_CONDITIONAL: 쇼핑·특별)
```

### Layer 2: RELATION CONTEXT (82건)

컨텍스트 레이어: city_spot이 아니나 AI 추천 컨텍스트·링크로 활용 가능.

```
EDITORIAL = 53  (지금전주는12 + 이달의추천여행12 + 스토리관광9 + 플레이전주여행12 + 미식여행editorial8)
COURSE    = 29  (여행코스18 + 트레킹코스11)
```

### Layer 3: EXCLUDED (105건)

서비스 범위 외: STANDARD_ACCOMMODATION 정책, 낮은 관광 가치, 콘텐츠 없음.

```
ACCOMMODATION_STD:         79  (official 13 + KTO 66)
PLACE_LOW_TOURISM_GATE:     5  (나들목가족공원·완산생활체육공원·황강서원·화산서원비·우리놀이터마루달)
WHOLESALE_MARKET_GATE:      1  (전주시농수산물도매시장)
CONTENT_UNAVAILABLE_GATE:   1  (sid=14451 K-라이프스타일)
```

### REVIEW_REQUIRED (25건, 미결)

```
HANOK_REVIEW:       20  (한옥·고택·체험 숙박 — KEEP_EXPERIENTIAL 심사)
TOURISM_REVIEW:      4  (불정사·약수암·학소암·청하서원 — 관광지 경계)
TOURISM_UNCERTAIN:   1  (KEEP_SET 미포함 KTO 관광지)
```

---

## Phase 11 — QA

```
ALL_INPUT_ACCOUNTED_FOR       = 424 / 424  ✓  (425 - 1 Phase9 merge = 424)
SOURCE_PROVENANCE_PRESERVED   = YES  ✓
FAKE_TITLE                    = 0   ✓
FAKE_COORD                    = 0   ✓  (추정 좌표 생성 없음)
DISPLAY_NAME_SERVICE_COMPLETE = 237 / 237  ✓
STANDARD_ACCOMMODATION_EXCLUDED = YES  ✓
COMMON_POLICY_CHANGED         = 0   ✓
MASTER_CHANGED                = 0   ✓
OTHER_CITY_DATA_CHANGED       = 0   ✓
HERITAGE_FILL_UNTRACKED_TOUCHED = 0  ✓
EXISTING_TRACKED_FILES_UNEXPECTEDLY_MODIFIED = 0  ✓
DETERMINISTIC_QA              = PASS
```

### WATCH 항목 인계

```
WATCH-W1: EVENT_FRESHNESS_GATE — 행사 9건 detailCommon2 fetch → ONGOING/UPCOMING 판정
  cid=3569496,2838316,3468240,3381612,2642299,2767541,1855589,2861680 — freshness check
  cid=3522298 (2025전주드론축구월드컵) — 2025 개최, 현재 2026 → LIKELY_EXPIRED 검토

WATCH-W2: HANOK_EXPERIENTIAL_REVIEW — 20건 KEEP_EXPERIENTIAL_LODGING 기준 심사
  한옥·전통·고택 키워드 숙박: 길건너한옥마을·대동고택·이화고택 등

WATCH-W3: TOURISM_RELEVANCE_GATE — 4건 개별 확인
  cid=317526 불정사, 337432 약수암, 485691 학소암, 1957104 청하서원

WATCH-W4: 한옥레일바이크 중복 확인
  sid=9764 (official 문화시설) vs cid=2426995 (KTO 레포츠) — 좌표 비교 후 결정

WATCH-W5: 다국어 표시이름 — 영·일·중 display_name 번역 별도 과제
```

---

## Commit Files

```
A  data/jeonju-raw-collection-v1/jeonju-curation-phase1-v1.json
   → 424 candidates: phase1_bucket / domain / display_name / info_gate /
     travel_value / eligibility(5-axis) / gaps / Phase9 merge annotation
   → SERVICE_ENTITY=237, RELATION_OR_CONTEXT=82, NOT_SERVICE_SPOT=80, REVIEW_REQUIRED=25
   → Phase9: OFF-16670 한벽굴 ← KTO-2946402 CONFIRMED_MERGE

A  docs/data-collection/jeonju/jeonju-curation-v1-state-v1.md
   → 이 문서
```

---

## Final Decision

```
CURATION_V1_STATUS           = COMPLETE
SERVICE_CATALOG_COUNT        = 237
RELATION_CONTEXT_COUNT       = 82
EXCLUDED_COUNT               = 105  (NOT_SERVICE_SPOT)
PENDING_REVIEW_COUNT         = 25
FINAL_UNIQUE_CANDIDATES      = 424  (4 confirmed merges from 428 source)
FAKE_COORD                   = 0
FAKE_ENTITY_NAME             = 0
SAFE_TO_CLOSE                = YES
NEXT                         = EVENT_FRESHNESS_GATE + HANOK_REVIEW + PHASE_BUILD
```
