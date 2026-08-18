# TASK-JEONJU-AMBIGUOUS-IDENTITY-RESOLUTION-V1 State

**Status**: COMPLETE (PASS_WITH_REVIEW)
**Branch**: `data/jeonju-targeted-completion-v1`
**As-of**: 2026-08-18

---

## Baseline

```
REPO_ROOT                    = korea-mate/
BRANCH                       = data/jeonju-targeted-completion-v1
START_HEAD                   = edf7297
COMMON_POLICY_COMMIT         = bc8d5d4
OFFICIAL_PRIMARY_TOTAL       = 199
KTO_TOTAL                    = 229
SOURCE_TOTAL                 = 428
PREVIOUS_INTEGRATED_UNIQUE   = 426
PREVIOUS_CONFIRMED_PAIRS     = 2
PREVIOUS_AMBIGUOUS           = 93
```

---

## Phase 1 — Existing Confident Match Re-verification

```
EXACT_MATCH_RECHECKED  = 1
  OFF: sid=16310 '베테랑칼국수' (미식여행)
  KTO: cid=2759615 '베테랑칼국수' (음식점) | addr=전북특별자치도 전주시 완산구 경기전길 135
  DIST = 21.1m | EVIDENCE = EXACT_NAME + COORD_VERY_CLOSE
  OFF_PHONE = 063-222-1000 | KTO_TEL = (없음)
  VERDICT: CONFIRMED_SAME_ENTITY

STRONG_MATCH_RECHECKED = 1
  OFF: sid=10114 '전주의 유구한 역사성 회복, 전라감영의 복원' (주요명소/역사전통)
  KTO: cid=3066348 '전라 감영' (관광지) | addr=전북특별자치도 전주시 완산구 전라감영로 55 (중앙동4가)
  DIST = 98.8m | EVIDENCE = PARTIAL_NAME + COORD_VERY_CLOSE | OFF_PHONE = 063-281-2977
  VERDICT: CONFIRMED_SAME_ENTITY
    (기사 제목에 '전라감영' 포함, 같은 역사지구, catCompat ✓)

DOWNGRADED = 0
```

---

## Phase 2 — Ambiguous 93건 Resolution

### 분류 방법론

Priority order:
1. PHONE_MATCH → HIGH_CONFIDENCE
2. EXACT_NAME (entity title) + category_compat (no coord / very close) → HIGH_CONFIDENCE
3. PARTIAL_NAME + COORD_VERY_CLOSE + category_compat → HIGH_CONFIDENCE
4. COURSE/EDITORIAL menu + category_compat + proximity → PARENT_CHILD_OR_AREA_POI
5. COURSE/EDITORIAL menu + category_incompatible → DISTINCT_ENTITY
6. Category incompatibility (defined compat matrix) → DISTINCT_ENTITY
7. Area keyword detection + category_compat → PARENT_CHILD_OR_AREA_POI
8. PARTIAL_NAME + COORD_NEAR + category_compat → MEDIUM_CONFIDENCE
9. Real title + category_compat + COORD_VERY_CLOSE (no name match) → MEDIUM_CONFIDENCE
10. No name, no phone, coord only → INSUFFICIENT_EVIDENCE

### 결과

```
TOTAL_REVIEWED               = 93
SAME_ENTITY_HIGH_CONFIDENCE  = 1
SAME_ENTITY_MEDIUM_CONFIDENCE= 1
DISTINCT_ENTITY              = 36
PARENT_CHILD_OR_AREA_POI     = 19
RELATED_BUT_DISTINCT         = 0
NAME_COLLISION               = 0
INSUFFICIENT_EVIDENCE        = 36

REVIEW_REQUIRED_REMAINING    = 37  (1 MEDIUM + 36 INSUFFICIENT)
```

### 주요 발견 사항

**Evidence 분포** (93건 중):
- 92건: score=8 (COORD_VERY_CLOSE only, ~0.001° 이내)
- 1건: score=10 (EXACT_NAME only, official coord 없음)
- 0건: PHONE_MATCH (KTO 비이벤트 레코드는 TEL 없음)

**Official title 분포**:
- `통합검색`: 71건 → name-based 분류 불가능
- `게시물 보기 페이지`: 8건 → 동일
- Article titles (코스/추천여행 breadcrumb): 7건 → entity title 아님
- Real entity titles: 7건 (자매갈비전골 등)

---

## Phase 3 — Safe Merge (HIGH_CONFIDENCE_NEW_MERGES = 1)

```
MERGE: 자매갈비전골
  official_dataSid   = 16133
  official_menu      = 미식여행
  official_phone     = 063-222-1000
  official_has_coord = False
  kto_contentid      = 2870801
  kto_title          = '자매갈비전골'
  kto_type           = 음식점
  kto_addr1          = 전북특별자치도 전주시 완산구 기린대로 121
  kto_lat/lng        = 35.8198804174 / 127.1534611530
  evidence           = EXACT_NAME (score=10; 좌표 비교 불가 → AMBIGUOUS였으나 identity 명확)
  canonical          = official_primary
  kto_supplements    = [coordinate, address, image]
  conflict           = NONE
  crossmatch_updated = _match_type "AMBIGUOUS" → "CONFIRMED_MERGE"
                       canonical_lat/lng, kto_addr1 필드 추가
```

**MEDIUM_CONFIDENCE (unmerged)**:
- sid=16670 '일제강점기의 아픈 흔적...' (역사전통) ↔ '한벽굴' (관광지), dist=16.8m
- 기사가 한벽굴을 다루는 것으로 추정되나, 제목에 '한벽굴' 없음 → identity 미확정
- → REVIEW_IN_CURATION (source_url detail fetch로 확인 가능)

---

## Phase 4 — Normalization Variations Checked

V5-R2 matcher에서 놓쳤을 수 있는 표현 차이 확인:
- 공백/특수문자: 정규화 함수 적용, 차이 없음
- 괄호/호점: 자매갈비전골 EXACT_NAME으로 포착됨 ✓
- 전화번호 하이픈: 정규화 후 비교 적용
- 좌표 소수점: 원시값 비교
- 한옥마을/경기전 suffix: area keyword detection에 포함
- 본점/직영점: 해당 케이스 없음

**NORMALIZATION_GAP = 0** (새로운 HIGH_CONFIDENCE 후보 없음)

---

## Phase 5 — Distinct Entity Breakdown (36건)

### Category incompatibility (28건)

```
숙박 → 관광지:           7건  (공식 숙박 POI, KTO 관광지 → 다른 엔티티)
문화시설 → 숙박:         3건
주요관광지 → 음식점:     2건
문화시설 → 행사/공연/축제:2건
미식여행 → 숙박:         2건
미식여행 → 관광지:       2건
주요관광지 → 쇼핑:       2건
주요명소/역사전통 → 음식점:2건
주요명소/역사전통 → 쇼핑: 1건
주요명소/역사전통 → 숙박: 1건
주요관광지 → 숙박:       1건
향토유산 → 음식점:       1건
자연생태 → 문화시설:     1건
문화시설 → 레포츠:       1건
```

### Course/editorial with incompatible KTO type (8건)

```
여행코스 → 숙박:          3건  (코스 기사 ↔ 인근 숙박 → DISTINCT)
여행코스 → 행사/공연/축제: 1건
이달의추천여행 → 숙박:    1건
이달의추천여행 → 쇼핑:    1건
지금전주는 → 숙박:        1건
스토리관광 → 행사:        1건
```

---

## Phase 6 — Parent/Child Relations (19건)

### AREA_CONTAINS_POI (5건)

```
자연생태 ↔ 세병공원 (관광지)
자연생태 ↔ 기지제·기지제 수변공원 (관광지)
주요관광지 ↔ 자만마을 벽화갤러리 (관광지)
주요관광지 ↔ 전주 남부시장 (쇼핑) ×2
```

### EDITORIAL_FEATURES_POI (11건)

```
지금전주는: 전주 대사습청, 수복회관, 전주 남부시장
이달의추천여행: 전주완산도서관, 전주공예품전시관, 전주전통한지원, 전주 대사습청×3, 엄가네시골집해장국, 사랑나무 한옥펜션
```

### COURSE_HAS_STOP (3건)

```
여행코스 → 전주동물원 (코스 제목에 '전주동물원에서')
여행코스 → 국립전주박물관 (dist=2.4m, 코스 anchor)
여행코스 → 국립전주박물관 (dist=2.4m, 두 번째 코스)
```

**WRONG_RELATION_MERGE = 0** (관계 보존만, merge 없음)

---

## Phase 7 — Source Limitations (6건)

| # | Limitation | Status | Impact |
|---|---|---|---|
| 1 | Official title artifact (157/199 = `통합검색`) | REVIEW_IN_CURATION | source_url detail fetch로 해소 가능 |
| 2 | 93 AMBIGUOUS group (identity 미확정) | **ADDRESSED_THIS_TASK** | 37건 REVIEW_REQUIRED 잔존 |
| 3 | KTO event date 없음 (9건) | TARGETED_RECOVERY_LATER | detailCommon2 fetch 필요 |
| 4 | 다국어 미운영 (ENG=KOR) | SAFE_AS_IS | curation 불필요, 별도 번역 과제 |
| 5 | Course stop 구조 없음 (29건) | TARGETED_RECOVERY_LATER | detail page fetch 필요 |
| 6 | Food hours/menu 없음 | SAFE_AS_IS | 별도 수집 과제 |

**BLOCKING = 0**

---

## Phase 8 — Final Integration

```
SOURCE_TOTAL                     = 428
PREVIOUS_CONFIRMED_PAIRS         = 2 (베테랑칼국수, 전라감영)
NEW_CONFIRMED_PAIRS              = 1 (자매갈비전골)
TOTAL_CONFIRMED_PAIRS            = 3
FINAL_INTEGRATED_UNIQUE_CANDIDATES = 425  (428 - 3)

AMBIGUOUS_93_DISPOSITION:
  CONFIRMED_MERGE               = 1  → 자매갈비전골 (claimed from KTO_ONLY pool)
  DISTINCT_ENTITY               = 36 → both off/kto remain independent candidates
  PARENT_CHILD_OR_AREA_POI      = 19 → both remain independent, relation annotated
  SAME_ENTITY_MEDIUM_CONFIDENCE = 1  → REVIEW_REQUIRED
  INSUFFICIENT_EVIDENCE         = 36 → REVIEW_REQUIRED

FINAL_AMBIGUOUS (REVIEW_REQUIRED) = 37
UNREVIEWED_HIGH_CONFIDENCE_DUPLICATE = 0
```

---

## Phase 9 — QA

```
SOURCE_LOSS                      = 0
OFFICIAL_PROVENANCE_LOSS         = 0
KTO_PROVENANCE_LOSS              = 0
FORCED_MERGE                     = 0
PARENT_CHILD_WRONG_MERGE         = 0
HIGH_CONFIDENCE_DUPLICATE_LEFT   = 0
UNREVIEWED_HIGH_CONFIDENCE_DUP   = 0
FAKE_COORD                       = 0
FAKE_TRANSLATION                 = 0
OTHER_CITY_DATA_CHANGED          = 0
COMMON_CHANGED                   = 0
MASTER_CHANGED                   = 0
EXISTING_UNTRACKED_FILES_TOUCHED = 0
DETERMINISTIC_QA                 = PASS
```

---

## Final Decision

```
IDENTITY_RESOLUTION          = PASS_WITH_REVIEW
FINAL_DATASET_DUPLICATE_RISK = LOW
CURATION_INPUT_READY         = YES
SAFE_TO_PROCEED_TO_JEONJU_CURATION = YES
NEXT_RECOMMENDED_TASK        = TASK-JEONJU-CURATION-V1
```

**PASS_WITH_REVIEW 사유**:
37건 REVIEW_REQUIRED 잔존 (1 MEDIUM + 36 INSUFFICIENT_EVIDENCE). 이는 HIGH_CONFIDENCE duplicate가 아니라 "불확실한 coord-only 쌍"으로, 큐레이션에서 source_url detail fetch 시 개별 결정 가능.

---

## WATCH 항목 → TASK-JEONJU-CURATION-V1 인계

```
WATCH-R1: REVIEW_REQUIRED 37건 개별 identity gate
  - 1 MEDIUM: sid=16670 '한벽굴 관련 기사' ↔ KTO '한벽굴' (source_url detail 확인)
  - 36 INSUFFICIENT: coord proximity only (source_url title 복원 후 name match 시도)
WATCH-R2: 19 PARENT_CHILD 관계 — COURSE_HAS_STOP/EDITORIAL_FEATURES_POI 활용
WATCH-R3: 자매갈비전골 coord 출처 = KTO (canonical_coord_source=kto_supplement) — NAV 시 표기
```

---

## Commit Files

```
M  data/jeonju-raw-collection-v1/jeonju-kto-crossmatch-v1.jsonl  (426 lines · 273,263 bytes)
   → 93 AMBIGUOUS에 _resolution_type/_resolution_reason/_resolution_as_of 추가
   → 1건(자매갈비전골) _match_type="CONFIRMED_MERGE" + canonical_lat/lng/addr 추가

A  data/jeonju-raw-collection-v1/jeonju-identity-resolution-v1.json (65,063 bytes)
   → 93건 전수 분류 결과 + Phase 1 재검증 + safe merge + source limitation + QA

A  docs/data-collection/jeonju/jeonju-v6-identity-resolution-state-v1.md
   → 이 문서
```
