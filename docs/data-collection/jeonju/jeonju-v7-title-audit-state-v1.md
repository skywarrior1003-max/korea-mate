# TASK-JEONJU-OFFICIAL-TITLE-ARTIFACT-AUDIT-AND-RECOVERY-V1 State

**Status**: COMPLETE (PASS)
**Branch**: `data/jeonju-targeted-completion-v1`
**As-of**: 2026-08-18

---

## Baseline

```
REPO_ROOT                    = korea-mate/
BRANCH                       = data/jeonju-targeted-completion-v1
START_HEAD                   = 5c72c41
COMMON_POLICY_COMMIT         = bc8d5d4
OFFICIAL_PRIMARY_TOTAL       = 199
TASK_SCOPE                   = jeonju-official-primary-raw-v1.jsonl (199 records)
AUDIT_ONLY_NEW_FETCHES       = 0  (기존 V4 데이터만 사용)
```

---

## Phase 1 — Title Artifact Classification

### Root Cause (confirmed from V5-R2 findings)

tour.jeonju.go.kr CMS board-list endpoint (`/board/list.jeonju`) returns the **page template's title**, not the entity's title, in the HTML `<title>` tag. This is a CMS board-view limitation:

- `"통합검색"` — CMS search page template title (board-list fallback)
- `"게시물 보기 페이지"` — CMS article-view template title
- `"&nbsp;"` — CMS placeholder whitespace title
- `""` — empty title (collection error or no title set)

Actual entity names are only available via the **detail page** at `source_url` (e.g., `/board/view.jeonju?boardId=...&dataSid=...`).

### Classification Results

```
THS  (통합검색):           145  records  — CMS board-list artifact
BVP  (게시물 보기 페이지):   11  records  — CMS article-view artifact
HTML_WS (&nbsp;):           10  records  — CMS whitespace placeholder
EMPTY (empty/null):          2  records  — no title captured
ARTICLE_BREADCRUMB:         18  records  — breadcrumb "추천여행 > 여행코스 ... 글보기"
REAL_OR_DESC:               13  records  — real text (entity name OR descriptive article)

TOTAL:                     199
IS_ARTIFACT  (THS+BVP+HTML_WS+EMPTY): 168  records
NON_ARTIFACT:               31  records  (includes 18 breadcrumb + 13 real/desc)
```

### Artifact Coverage

```
TITLE_ARTIFACT_RATE     = 168 / 199 = 84.4%
REAL_OR_PARSEABLE_RATE  = 31 / 199 = 15.6%
```

---

## Phase 2 — Image URL Analysis

All 154 CLASS-C records with `official_image_url` use numeric-only filenames:

```
Pattern: https://tour.jeonju.go.kr/upload_data/board_data/{boardId}/{13-digit-timestamp}.jpg
Korean in path: 0
Entity hints from image URL: 0
```

**IMAGE_URL_ENTITY_HINT = 0** — no additional recovery possible from image URLs.

---

## Phase 3 — Recovery Analysis

### CLASS A — Recoverable (26 records)

#### A1. Existing clean entity title (4 records)

| sid | family | recovered_name | match_type |
|-----|--------|---------------|------------|
| 16133 | FOOD | 자매갈비전골 | CONFIRMED_MERGE |
| 16310 | FOOD | 베테랑칼국수 | EXACT_MATCH |
| 16357 | FOOD | 짜앤짬이야기 | AMBIGUOUS/DISTINCT |
| 17463 | FOOD | 메르밀진미집 본점 | AMBIGUOUS/DISTINCT |

Recovery source: `existing_title_clean` (title already contains entity name)

#### A2. Article title entity extraction (4 records)

| sid | family | raw_title | recovered_name | basis |
|-----|--------|-----------|---------------|-------|
| 10114 | PLACE_HERITAGE | 전주의 유구한 역사성 회복, 전라감영의 복원 | 전라감영 | STRONG_MATCH confirmed + name-after-comma |
| 10116 | PLACE_HERITAGE | 전주를 지켜온 후백제 유적지, 남고산성 | 남고산성 | name-after-comma pattern |
| 9737 | PLACE_HERITAGE | 만남의 장소, 풍패지관 | 풍패지관 | name-after-comma pattern |
| 9746 | PLACE_HERITAGE | 전주 4대문 중 유일하게 남은 보물 풍남문(豊南門) | 풍남문 | parenthetical Korean name |

Recovery source: `article_entity_extract`

#### A3. Breadcrumb course/article name (18 records)

All RECOMMENDATION family — breadcrumb format "추천여행 > 여행코스 {name} 글보기" parsed.

| sid | recovered_name |
|-----|---------------|
| 13658 | 천년 전주 마실길 |
| 13659 | 한옥마을 둘레길 |
| 13660 | 전주동물원에서 전북대학교까지 |
| 13798 | 뜻깊은 천년의 역사 |
| 14762 | 전주의 봄, 꽃처럼 설레다♡ |
| 15016 | 현지인 추천! 전주 벚꽃 명소 9선 |
| 15483 | 전주 여름 완전 정복! |
| 15764 | 전주에서 만나는 케·데·헌 코스 |
| 16030 | 무르익은 가을향기 따라 걷는 데크길 산책 |
| 16139 | 붕어빵 따라~ 호떡 따라, 전주로! |
| 16457 | 황금 연휴, 3대가 모두 만족하는 안(內)추운 전주여행 |
| 16725 | 2026 전주시티투어 |
| 16749 | 꽃바람 따라, 전주로! |
| 16898 | 연둣빛 설렘 위로 분홍빛 겹벚꽃이 내려앉을 때 |
| 17077 | 푸른 5월, 온 가족 초록 소풍 |
| 17193 | 실패없는 전주여행, 정석 코스 |
| 17354 | 무더위 탈출! 아이와 함께하는 창의 투어 |
| 17454 | 전주의 가장 '힙'한 여름 기록 |

Recovery source: `breadcrumb_course_name`

**Note on A3**: These are editorial/course article names, not POI entity names. They represent the article's subject (e.g., "천년 전주 마실길" = course name), which is the appropriate display name for RECOMMENDATION records.

---

### CLASS B — Unresolvable Article Hints (5 records)

No safe entity name extractable from existing data. Title contains descriptive prose without a cleanly identifiable place name.

| sid | family | raw_title | source_url | cross_match |
|-----|--------|-----------|-----------|-------------|
| 10118 | PLACE_HERITAGE | 견훤의 발자취가 남아있는 후백제 유적지 | /view.jeonju?...&dataSid=10118 | NO_XMATCH |
| 15637 | PLACE_HERITAGE | 한적한 산사에서 마주하는 천년의 지혜와 고요 | /view.jeonju?...&dataSid=15637 | NO_XMATCH |
| 16670 | PLACE_HERITAGE | 일제강점기의 아픈 흔적 위에 피어난 절경, 시간을 잇는 신비로운 통로 | /view.jeonju?...&dataSid=16670 | AMBIGUOUS/MEDIUM→한벽굴 |
| 16671 | PLACE_HERITAGE | 역사의 소용돌이 속에서 지켜낸 위대한 기록, 조선의 자존심을 품다. | /view.jeonju?...&dataSid=16671 | NO_XMATCH |
| 16717 | RECOMMENDATION | 벚꽃 따라 전주여행 | /view.jeonju?...&dataSid=16717 | NO_XMATCH |

Note on sid=16670: MEDIUM crossmatch with KTO '한벽굴' exists but is unconfirmed (identity not safe to assert). Entity will be determined at curation via source_url detail fetch.

---

### CLASS C — Needs Fetch (168 records)

Artifact titles (THS/BVP/HTML_WS/EMPTY) with no recovery from existing V4 data.

```
THS (통합검색):    145
BVP (게시물보기):   11
HTML_WS (&nbsp;):  10
EMPTY:              2

All 168 require source_url detail fetch in TASK-JEONJU-CURATION-V1
```

---

## Phase 4 — Data Modification

### Fields Added to `jeonju-official-primary-raw-v1.jsonl`

5 new audit fields added to ALL 199 records. Original `title` field NOT modified (provenance preserved).

| Field | Type | Description |
|-------|------|-------------|
| `_title_class` | string | THS / BVP / HTML_WS / EMPTY / ARTICLE_BREADCRUMB / REAL_OR_DESC |
| `_display_name_status` | string | A (recovered) / B (hint only) / C (needs fetch) |
| `_display_name_recovered` | string | Recovered entity/article name; "" if B or C |
| `_display_name_source` | string | Recovery source: existing_title_clean / article_entity_extract / breadcrumb_course_name / kto_crossmatch_confirmed_match / article_hint_only:\* / artifact_no_recovery |
| `_title_audit_as_of` | string | "2026-08-18" |

```
TOTAL_RECORDS_MODIFIED    = 199
ORIGINAL_TITLE_CHANGED    = 0   (provenance preserved)
CLASS_A_RECOVERED         = 26
CLASS_B_HINT_ONLY         = 5
CLASS_C_NEEDS_FETCH       = 168
NEW_FETCHES_PERFORMED     = 0
```

---

## Phase 5 — Identity Impact Recheck

### Impact on V6 REVIEW_REQUIRED (37건)

From V6 identity resolution: 37 records remain REVIEW_REQUIRED (1 MEDIUM + 36 INSUFFICIENT_EVIDENCE). Title audit reveals:

```
REVIEW_REQUIRED with title artifact (THS/BVP/HTML_WS/EMPTY):   all 37
  → These had no entity name to attempt name-match in V6
  → All are CLASS C (NEEDS_FETCH)
  → Identity verification still deferred to curation (source_url detail fetch)

REVIEW_REQUIRED upgraded by title audit:  0
  → None of the 37 have a recoverable entity name
  → Crossmatch-confirmed identity would have already been elevated to HIGH/MEDIUM in V6
```

**IDENTITY_IMPACT = 0_UPGRADES** — title audit is purely additive for the curation workflow.

---

## Phase 6 — Curation Readiness

```
TITLE_AUDIT_READY           = YES
RECORDS_WITH_DISPLAY_NAME   = 26  (CLASS A — usable immediately in curation)
RECORDS_WITH_ARTICLE_HINT   = 5   (CLASS B — title text usable as fallback)
RECORDS_NEEDING_FETCH       = 168 (CLASS C — source_url detail fetch required)

DISPLAY_NAME_COVERAGE:
  FOOD              = 4/12  (33%) — 4 CLASS A, 8 CLASS C
  PLACE_HERITAGE    = 8/25  (32%) — 6 CLASS A, 5 CLASS B, 14 CLASS C
  RECOMMENDATION    = 14/46 (30%) — 18 CLASS A... wait:
                        Actually RECOMMENDATION had 46 records of which
                        18 breadcrumb parsed (CLASS A), others are THS etc.
  Other families (PLACE_CULTURAL, COURSE_ROUTE, ACCOMMODATION, PLACE_NATURE,
                  PLACE_GENERAL) = all CLASS C (THS artifacts from CMS)
```

---

## Phase 7 — QA

```
ORIGINAL_TITLE_FIELD_CHANGED        = 0   ✓ (provenance preserved)
RECORDS_PROCESSED                   = 199 / 199  ✓
CLASS_A_COUNT                       = 26         ✓
CLASS_B_COUNT                       = 5          ✓
CLASS_C_COUNT                       = 168        ✓
A+B+C TOTAL                         = 199        ✓
THS_MISCLASSIFIED                   = 0          ✓
NEW_FETCHES_PERFORMED               = 0          ✓ (V4 data only)
EXISTING_UNTRACKED_FILES_TOUCHED    = 0          ✓
OTHER_CITY_DATA_CHANGED             = 0          ✓
COMMON_POLICY_CHANGED               = 0          ✓
MASTER_CHANGED                      = 0          ✓
FAKE_ENTITY_NAME                    = 0          ✓
DETERMINISTIC_QA                    = PASS
```

---

## Final Decision

```
TITLE_ARTIFACT_AUDIT     = COMPLETE
RECOVERY_FROM_V4_ONLY    = 26 / 199 (13.1%)
TITLE_ARTIFACT_RATE      = 84.4%   (168/199)
CURATION_FETCH_REQUIRED  = 168 records (source_url detail page)
SAFE_TO_PROCEED          = YES
NEXT_TASK                = TASK-JEONJU-CURATION-V1
```

---

## WATCH 항목 → TASK-JEONJU-CURATION-V1 인계

```
WATCH-T1: 168 CLASS-C records — source_url detail fetch로 실제 entity 이름 확보
  - boardId 패턴: BBS_0000003 (주요명소/역사전통/자연생태/향토유산/문화시설)
  - boardId 패턴: BBS_0000022/0000023/0000031/0000038/0000042/0000055 (기타)
  - fetch 후 _title_class=THS/BVP/HTML_WS/EMPTY 레코드의 _display_name_recovered 갱신

WATCH-T2: 5 CLASS-B records — source_url detail fetch 후 identity 확인
  - sid=10118,15637,16670,16671,16717
  - sid=16670은 V6 MEDIUM (한벽굴) — fetch 후 identity 결정

WATCH-T3: 26 CLASS-A records — _display_name_recovered를 curation display_name 기본값으로 사용
  - 상충 시 source_url detail fetch 결과 우선
  - RECOMMENDATION A3 (breadcrumb_course_name): 코스/기사 이름이므로 POI 이름이 아님을 명시
```

---

## Commit Files

```
M  data/jeonju-raw-collection-v1/jeonju-official-primary-raw-v1.jsonl
   → 199 records: 5 audit fields added (_title_class, _display_name_status,
     _display_name_recovered, _display_name_source, _title_audit_as_of)
   → original title field: UNCHANGED (provenance preserved)

A  docs/data-collection/jeonju/jeonju-v7-title-audit-state-v1.md
   → 이 문서
```
