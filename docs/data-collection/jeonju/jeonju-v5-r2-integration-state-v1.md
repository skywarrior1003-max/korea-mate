# TASK-JEONJU-OFFICIAL-KTO-INTEGRATION-AND-CURATION-READINESS-V5-R2 State

**Status**: COMPLETE (PASS_WITH_WARN)
**Branch**: `data/jeonju-targeted-completion-v1`
**As-of**: 2026-08-18

---

## Baseline

```
REPO_ROOT              = korea-mate/
BRANCH                 = data/jeonju-targeted-completion-v1
START_HEAD             = b863442
COMMON_POLICY_COMMIT   = bc8d5d4
OFFICIAL_PRIMARY_TOTAL = 199
KTO_TOTAL              = 229
```

---

## Entity Integration (Phase 1)

```
EXACT_MATCH                = 1   ← 베테랑칼국수 (EXACT_NAME + COORD_VERY_CLOSE)
STRONG_MATCH               = 1   ← 전라감영 (PARTIAL_NAME + COORD_VERY_CLOSE)
OFFICIAL_ONLY              = 104
KTO_ONLY                   = 227
AMBIGUOUS                  = 93  ← coord-only proximity; NOT merged; isolated
DUPLICATE                  = 0
INTEGRATED_UNIQUE_CANDIDATES = 426
```

**Cross-match artifact**: `data/jeonju-raw-collection-v1/jeonju-kto-crossmatch-v1.jsonl` (426 records, 260,252 bytes)

**Key finding — Official title artifact**: 157/199 official records have `title = "통합검색"` or `"게시물 보기 페이지"` — CMS board list limitation. Actual entity names retrievable via `source_url` detail fetch. **Impact**: name-based matching limited to 42 records. Phone + coord used as primary match evidence.

---

## Domain Classification (Phase 2)

```
PLACE_CORE                  = 174  (official 108 + KTO 관광지45+문화시설22 - 1 merged)
ACTIVITY_EXPERIENCE         = 14   (플레이전주여행 12 + KTO 레포츠 2)
FOOD                        = 77   (미식여행 12 + KTO 음식점 66, 1 EXACT merged)
EVENT                       = 9    (KTO only; official CMS has no event board)
CONTEXTUAL_COURSE           = 29   (여행코스 18 + 트레킹코스 11 — affinity evidence only)
RECOMMENDATION_EDITORIAL    = 24   (이달의추천여행 12 + 지금전주는 12)
STANDARD_ACCOMMODATION      = 73   (official 13 + KTO standard 60)
HANOK_EXPERIENTIAL_REVIEW   = 20   (KTO 한옥/전통 keyword — KEEP_EXPERIENTIAL 심사 대상)
SPECIALTY_INTEREST          = 5    (K-라이프스타일 1 + KTO 쇼핑 4)
REVIEW_REQUIRED             = 93   (AMBIGUOUS cross-match)
```

---

## Relations (Phases 3–5)

```
COURSE_COUNT                    = 29  (여행코스18+트레킹코스11)
COURSE_WITH_PARSED_STOPS        = 0   (stop list not in V4 board list raw; need detail fetch)
COURSE_STOP_RELATIONS           = 0
UNMATCHED_COURSE_STOPS          = 0

MONTHLY_RECOMMENDATION_COUNT    = 33  (이달의추천여행12+지금전주는12+스토리관광9)
MONTH_SEASON_RELATIONS          = 0   (title=통합검색; entity links not parseable from raw)
RECOMMENDATION_ENTITY_RELATIONS = 0

ACCESSIBILITY_MENU_FOUND        = 0   (무장애여행 전용 메뉴 없음)
ACCESSIBILITY_RECORDS           = 0
ACCESSIBILITY_RELATIONS         = 0
UNMATCHED_ACCESSIBILITY_ENTITIES= 0
```

**Course note**: Course names ARE extractable from URL breadcrumb (e.g., `천년 전주 마실길`, `한옥마을 둘레길`). Stop data requires detail page fetch in curation.

---

## Multilingual Coverage (Phase 6)

```
KOR_ACTUAL_CONTENT     = 199
ENG_ACTUAL_CONTENT     = 199  (same KOR content via /eng/ path — NOT independently translated)
CHN_ACTUAL_CONTENT     = 0    (HTTP 200 but no Chinese content in CMS)
JPN_ACTUAL_CONTENT     = 0    (HTTP 200 but no Japanese content in CMS)
CROSS_LOCALE_EXACT     = 199  (ENG path = KOR exactly)
CROSS_LOCALE_STRONG    = 0
CROSS_LOCALE_UNMATCHED = 0
CROSS_LOCALE_AMBIGUOUS = 0
GOOGLE_TRANSLATE_USED  = 0
```

**Finding**: `tour.jeonju.go.kr` ENG/CHN/JPN paths serve same Korean CMS content. No independently maintained multilingual records. KTO EngService2 confirmed `EN=0` for Jeonju (V2 state). **MULTILINGUAL_FOUNDATION = PARTIAL** — KOR only.

---

## Food Foundation (Phase 7)

```
OFFICIAL_PRIMARY_FOOD    = 12   (미식여행 menu)
KTO_FOOD                 = 66   (음식점)
MATCHED                  = 1    (베테랑칼국수 EXACT)
OFFICIAL_ONLY            = 12
KTO_ONLY                 = 65
PHONE_COVERAGE           = Official 12/12; KTO 0/66
HOURS_COVERAGE           = 0    (not available in any source raw)
MENU_SIGNATURE_COVERAGE  = 0    (not available in any source raw)
IMAGE_CAPABILITY         = Official 12/12 has_image; KTO 44/66 firstimage
```

---

## Event Foundation (Phase 8)

```
OFFICIAL_CURRENT_FUTURE  = 0   (no event board in official CMS)
KTO_EVENT                = 9
MATCHED                  = 0
OFFICIAL_ONLY            = 0
KTO_ONLY                 = 9
PAST_EXPIRED             = 1   (2025 전주드론축구월드컵 — title=2025, collected 2026-08-18)
REVIEW_REQUIRED          = 8   (no start/end in KTO raw; need detailCommon2 targeted fetch)
DATE_READY               = 0
VENUE_READY              = 9
```

**EVENT_FRESHNESS policy**: KTO raw has `createdtime`/`modifiedtime` only — NOT event dates per bc8d5d4 rule. All 9 events flagged DATE_READY=0. KTO detailCommon2 targeted fetch required in curation for freshness gate.

---

## Navigation Readiness Snapshot (Phase 9)

```
INTEGRATED_NAV_CANDIDATES   = 426
OFFICIAL_COORD              = 171
KTO_COORD_SUPPLEMENT        = 2    (EXACT+STRONG KTO confirmed/supplemented)
VERIFIED_ADDRESS_NO_COORD   = 2    (트레킹코스 2건 with real address)
VWORLD_RECOVERY_CANDIDATES  = 2    (same 2)
ADDRESS_MISSING             = 26   (no coord, no real address)
AREA_LINE_ROUTE             = 29   (course records — need route anchor strategy)
NAV_ANCHOR_REQUIRED         = 1    (자연생태 CORE candidate dataSid=13619)
WRONG_CITY_COORD            = 0
```

**All KTO records**: 229/229 have coord (BBOX_FAIL=0 from V2 validation).

---

## Curation Readiness Input (Phase 10)

**Candidate universe** — 5-axis preliminary classification evidence ready:

```
CORE_DESTINATION_CANDIDATE         = 174
CONDITIONAL_OR_SEASONAL_CANDIDATE  = 24
ACTIVITY_EXPERIENCE_CANDIDATE      = 14
SPECIALTY_INTEREST_CANDIDATE       = 5
TRAVEL_UTILITY_CANDIDATE           = 0
FOOD_CANDIDATE                     = 77
EVENT_CANDIDATE                    = 9
STANDARD_ACCOMMODATION             = 73
HANOK_EXPERIENTIAL_REVIEW          = 20
GENERAL_SERVICE                    = 0
DUPLICATE_CANDIDATE                = 0
REVIEW_REQUIRED                    = 93
```

**Curation input artifact**: `data/jeonju-raw-collection-v1/jeonju-curation-input-v5-r2.json`

---

## QA (Phase 11)

```
OFFICIAL_SOURCE_LOSS                  = 0
KTO_SOURCE_LOSS                       = 0
AMBIGUOUS_FORCED_MERGE                = 0
ACTIVITY_BLANKET_EXCLUSION            = 0
STANDARD_ACCOMMODATION_AUTO_PROMOTION = 0
EXPIRED_EVENT_ACTIVE_PROMOTION        = 0
FAKE_COORD                            = 0
FAKE_TRANSLATION                      = 0
COMMON_POLICY_DIVERGENCE              = 0
EXISTING_UNTRACKED_FILES_TOUCHED      = 0
OTHER_CITY_DATA_CHANGED               = 0
MASTER_CHANGED                        = 0
DETERMINISTIC_QA                      = PASS
```

---

## Final Decision

```
OFFICIAL_KTO_INTEGRATION     = PASS_WITH_WARN
RELATION_FOUNDATION          = PARTIAL
MULTILINGUAL_FOUNDATION      = PARTIAL
FOOD_FOUNDATION              = PARTIAL
EVENT_FOUNDATION             = PARTIAL
NAVIGATION_FOUNDATION        = PARTIAL
CURATION_INPUT_READY         = YES
SAFE_TO_PROCEED_TO_JEONJU_CURATION = YES
NEXT_RECOMMENDED_TASK        = TASK-JEONJU-CURATION-V1
```

**PASS_WITH_WARN 사유** (gap이 아닌 source 한계, curation 단계에서 보완 가능):
1. Official title artifact: 157/199 records `title=통합검색` — CMS board list 한계. 실제 entity 이름은 `source_url` detail 페이지에서 확인 가능.
2. 93 AMBIGUOUS: coord-only proximity, identity 불확정 → 격리됨. 강제 merge 없음.
3. Event dates: KTO raw에 날짜 필드 없음 → curation 시 KTO detailCommon2 targeted fetch 필요.
4. Multilingual: 공식 CMS ENG/CHN/JPN = KOR 동일 내용. 독립 다국어 콘텐츠 없음.
5. Course stops: board view raw에 stop list 없음 → curation detail fetch 필요.
6. Food hours/menu: 어떤 source raw에도 없음.

---

## WATCH 항목 → TASK-JEONJU-CURATION-V1 인계

1. **TOURISM_RELEVANCE_GATE**: KTO 관광지(contentTypeId=12) 45건 개별 심사 (부산 FP 교훈 적용)
2. **HANOK_EXPERIENTIAL_REVIEW**: KTO 한옥/전통 숙박 20건 심사 (KEEP_EXPERIENTIAL_LODGING 기준)
3. **EVENT_FRESHNESS_GATE**: KTO 9건 → detailCommon2 targeted fetch → ONGOING/UPCOMING 판정
4. **5-axis eligibility 정식 배정**: 예비 분류 → 공식 SEARCHABLE/EXPLORE/AI_ITINERARY/USER_CAN_SELECT/USER_CAN_SAVE
5. **Phone/coord RULE-A~G**: missing semantics 세분류 (NOT_EXPECTED/NEEDS_VERIFICATION/geometry_type)
6. **Official title 복원**: source_url detail fetch로 통합검색 → 실제 entity 이름 확보
