# TASK-JEONJU-GEONJISAN-NAV-FINAL-CLOSE-V1 State

**Status**: COMPLETE (PASS)
**Branch**: `data/jeonju-targeted-completion-v1`
**As-of**: 2026-08-18
**Prev HEAD**: `053ea85` (TASK-JEONJU-TARGETED-FINAL-ENRICHMENT-QA-AND-CLOSE-V1)

---

## Baseline

```
REPO_ROOT            = korea-mate/
BRANCH               = data/jeonju-targeted-completion-v1
START_HEAD           = 053ea85
FINAL_HEAD           = (이 커밋)
COMMON_POLICY_COMMIT = bc8d5d4
FINAL_UNIQUE         = 423
ACTIVE_SERVICE       = 236
EVENT_EXPIRED        = 9
EXCLUDED             = 96
RELATION_CONTEXT     = 82
```

---

## 건지산 NAV Resolution

### Before

```
candidate_id     = OFF-13619
display_name     = 건지산
source           = OFFICIAL
sid              = 13619
domain           = PLACE_NATURE
match_type       = OFFICIAL_ONLY
has_coord        = False
lat              = (없음)
lng              = (없음)
info_gate        = LOCATION_INSUFFICIENT
elig_explore     = False
elig_ai_itinerary= True   ← COORD_MISSING_AI_ITINERARY_ENABLED=1 (불일치)
elig_user_select = False
elig_user_save   = False
gaps             = [NAV_GAP]
```

### Resolution Process

1. **source_url fetch**: tour.jeonju.go.kr dataSid=13619
   - 페이지 내 좌표 없음 확인
   - 공식 주소 확인: "전주시 덕진구 송천동1가 산1-1"
   - (기존 official raw의 "완산구 노송광장로 10"은 관리청 주소로 확인됨)

2. **VWorld API**: 지번 geocoding
   - 쿼리: `전주시 덕진구 송천동1가 산1-1`
   - 응답 주소(refined): 전북특별자치도 전주시 덕진구 송천동1가 산 1-1
   - 응답 좌표: x=127.1319756787604, y=35.858634813523175
   - Status: OK

3. **CASE 판정**: **CASE A — VERIFIED_NAV_ANCHOR**
   - 근거: 공식 지번 주소(`송천동1가 산1-1`)에 대한 VWorld 공식 지번 geocoding
   - "임의 centroid" 아님 — 공공 지적 참조점(공식 지번의 지적 기준점)
   - "정확한 공식 주소 기반 검증 좌표" 요건 충족

### After

```
has_coord             = True
lat                   = 35.858634813523175
lng                   = 127.1319756787604
coord_source          = vworld_jibun_geocoding
coord_provenance      = VWorld Address API / 전북특별자치도 전주시 덕진구 송천동1가 산1-1 / 공식 지적 참조점
official_address_confirmed = 전북특별자치도 전주시 덕진구 송천동1가 산1-1
info_gate             = NAV_READY
elig_explore          = True
elig_ai_itinerary     = True
elig_user_select      = True
elig_user_save        = True
gaps                  = []
```

---

## Product Eligibility (ACTIVE SERVICE 236건)

```
SEARCHABLE       = 236/236  ✓
EXPLORE          = 236/236  ✓  (건지산 NAV 해소 — 이전 235/236)
AI_ITINERARY     = 236/236  ✓
USER_CAN_SELECT  = 236/236  ✓  (건지산 포함 — 이전 235/236)
USER_CAN_SAVE    = 236/236  ✓  (건지산 포함 — 이전 235/236)

AI_MODE:
  AI_AUTO       = 159
  AI_CONDITIONAL =  77
  AI_NOT_AUTO   =   0

COORD_MISSING_AI_ITINERARY_ENABLED = 0  ✓
```

---

## Gap Finalization (ACTIVE SERVICE 236건)

```
┌───────────────────────────┬──────┬──────────────────────────────────────┐
│ Gap                       │ 건수 │ Priority                             │
├───────────────────────────┼──────┼──────────────────────────────────────┤
│ NAV_GAP                   │    0 │ RESOLVED (건지산 CASE A 적용)        │
├───────────────────────────┼──────┼──────────────────────────────────────┤
│ EVENT_DATE_GAP            │    0 │ RESOLVED (9건 모두 EXPIRED)           │
├───────────────────────────┼──────┼──────────────────────────────────────┤
│ IMAGE_GAP                 │   30 │ NICE_TO_HAVE                         │
│ PHONE_GAP (Food/Activity) │   70 │ NICE_TO_HAVE                         │
└───────────────────────────┴──────┴──────────────────────────────────────┘

PUBLIC_BLOCKER_COUNT    = 0
AI_UNSAFE_UNGATED_COUNT = 0
```

---

## Final QA

```
FINAL_UNIQUE                          = 423  ✓  (428 source − 5 merge)
ACTIVE_SERVICE + EXPIRED + EXCL + REL = 236+9+96+82 = 423  ✓
COORD_MISSING_AI_ITINERARY_ENABLED    = 0    ✓
KNOWN_WRONG_COORD_ACTIVE              = 0    ✓
FAKE_COORD                            = 0    ✓
FORCED_MERGE                          = 0    ✓
HIGH_CONFIDENCE_DUPLICATE_LEFT        = 0    ✓
EXPIRED_EVENT_ACTIVE_PROMOTION        = 0    ✓
STANDARD_ACCOMMODATION_AUTO_PROMOTION = 0    ✓
COMMON_POLICY_DIVERGENCE              = 0    ✓
OTHER_CITY_DATA_CHANGED               = 0    ✓
COMMON_CHANGED                        = 0    ✓
MASTER_CHANGED                        = 0    ✓
EXISTING_UNTRACKED_FILES_TOUCHED      = 0    ✓
DETERMINISTIC_QA                      = PASS ✓
```

---

## Commit Files

```
M  data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json
   → 건지산 NAV anchor 추가 (VWorld jibun geocoding)
   → eligibility EXPLORE/SELECT/SAVE 235→236/236
   → gap_analysis: NAV_GAP=0, PUBLIC_BLOCKER_COUNT=0

M  docs/data-collection/jeonju/jeonju-final-close-state-v1.md
   → 이 문서 (TASK-JEONJU-GEONJISAN-NAV-FINAL-CLOSE-V1)
```

---

## Final Decision

```
JEONJU_DATA_COLLECTION    = COMPLETE
JEONJU_CURATION           = COMPLETE
JEONJU_NAVIGATION         = COMPLETE
JEONJU_AI_ELIGIBILITY     = COMPLETE
PUBLIC_BLOCKER_COUNT       = 0
AI_UNSAFE_UNGATED_COUNT    = 0
JEONJU_FINAL_STATUS        = COMPLETE
SAFE_FOR_FINAL_HANDOFF     = YES
BROAD_JEONJU_RECOVERY_NEEDED = NO
NEXT_RECOMMENDED_TASK      = TASK-MULTICITY-DATA-FINAL-HANDOFF-V1
```
