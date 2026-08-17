# TASK-SEOUL-ALL-DATA-TARGETED-COMPLETION-V1 완료보고서

> Branch: `data/seoul-targeted-completion-v1`
> Base: `origin/data/seoul-collection-v1` HEAD `7a71304`
> Common Policy: `data/multicity-common` HEAD `f9e3543`
> 작성일: 2026-08-17

---

## Common

| 항목 | 값 |
|---|---|
| COMMON_POLICY_COMMIT | `f9e3543` (data/multicity-common) |
| EXISTING_SEOUL_BASE_COMMIT | `7a71304` (data/seoul-collection-v1 TASK-SEOUL-FINAL-HANDOFF-V1) |
| WORK_BRANCH | `data/seoul-targeted-completion-v1` |
| SOURCE_DATA | non-food 573 (seoul-nonfood-batch2-detail-normalized-v1.jsonl) + food 1,259 (seoul-food-discovery-candidates-r1.jsonl) |

---

## 1. 최종 서울 데이터 지표 (FINAL — TV Gate + Event 4건 추가 후)

| 항목 | 값 | 비고 |
|---|---|---|
| TOTAL_RECORDS | **1,838** | canonical 총 레코드 |
| SERVICE_UNIVERSE | **1,837** | attraction=526, restaurant=1,259, shopping=30, nature=22 |
| EXCLUDED | **1** | EXCLUDED_MULTI_LOCATION_NON_PLACE=1 |
| NAV_READY | **1,837/1,837 = 100%** | |
| IMAGE | **1,836/1,837 = 99.95%** | |
| IMAGE_DISPLAY | **1,836/1,837 = 99.95%** | |
| AI_AUTO_DEFAULT | **771/1,837 = 42.0%** | DESTINATION_RESTAURANT 223건 + non-rest eligible 548건 |
| AI_CONDITIONAL | **199/1,837** | SPECIALTY_INTEREST_RESTAURANT (할랄·비건 등) |
| AI_NOT_AUTO_RECOMMENDED | **837/1,837** | UTILITY_RESTAURANT (SEARCHABLE=YES) |
| AI_HARD_BLOCKED | **30/1,837** | non-rest 27건 + INCHEON 3건 |
| PHONE | 1,768/1,837 = 96.2% | |
| FINAL_QA | **PASS** | 25개 체크 전체 통과 (TV Gate 7개 + Event 4개 포함) |
| SAFE_TO_CLOSE | **YES** | |
| NEXT_CITY | JEJU | |

> ⚠️ **V1→V3 AI_AUTO 변경**: V1(TARGETED-COMPLETION, commit 0fcbcc5)에서 1,803/1,833(98.4%)이었던 AI_AUTO가 TV Gate 적용(V3) 후 767/1,833(41.8%)으로 조정됨. DESTINATION_RESTAURANT(미쉐린·오래가게·백년가게 등 공식 큐레이션 보유) 223건만 ai_auto=True. SPECIALTY(199) + UTILITY(837) = 1,036건 ai_auto=False. 이는 restaurant 전건을 AI_AUTO=True로 설정했던 V1 canonical의 수정이며, multicity eligibility 정책 준수 결과임.
>
> ⚠️ **V4 보정**: SPECIALTY 199건은 AI_BLOCKED(하드차단) 아님 — AI_CONDITIONAL(조건부). AI_ITINERARY_ELIGIBLE=CONDITIONAL, ai_blocked_reason=SPECIALTY_INTENT_REQUIRED. 사용자 맥락(할랄/비건 요청 등) 확인 시 AI 이티너리 포함 가능. V4 이벤트 4건 canonical 추가 → SERVICE_UNIVERSE 1,833→1,837, AI_AUTO_DEFAULT 767→771.

---

## 2. Curation 결정

### 2.1 제외 (EXCLUDED)

| candidate_id | 이름 | exclusion_reason |
|---|---|---|
| seoul-KOPc3g5o6 | 서울, 세계와 노래하다 | EXCLUDED_MULTI_LOCATION_NON_PLACE |

KOPc3g5o6: 3개 장소 복수 주소(남산공원팔각광장/여의도한강공원이벤트광장/청계천광장) — 단일 Place 생성 불가. 기존 handoff의 `MULTI_LOCATION_NON_PLACE` 분류 확정.

### 2.2 KEEP — 특수 처리

| candidate_id | 이름 | 처리 |
|---|---|---|
| seoul-KOP011863 | 인천국제공항 T1 서울관광정보센터 (동편) | SEARCHABLE=YES 유지, AI_ITINERARY=NO (override 적용) |
| seoul-KOP024807 | 인천공항 T2 관광정보센터 | SEARCHABLE=YES 유지, AI_ITINERARY=NO (override 적용) |
| seoul-KOP042078 | 인천국제공항 T1 서울관광정보센터 (서편) | SEARCHABLE=YES 유지, AI_ITINERARY=NO (override 적용) |
| seoul-KOPgdf9ry | 파인캐릭터 2026 (FineCharacter 2026) | ACTIVE, IMAGE_MISSING (진정한 예외) |

인천공항 3건: 기존 QA R1 review_note에서 AI_ITINERARY=NO 정정 권장 → 이번 task에서 적용 완료. 좌표·주소·SEARCHABLE 불변.

KOPgdf9ry: special2 레코드로 PLACE_AI_OR_EXPLORE_ELIGIBLE 분류. 이미지 미확보(IMAGE_SOURCE_PENDING). 좌표 정상(lat=37.568). 시간적 상태(행사 종료 여부) 미확인 — 다음 주기에서 재확인 권장.

### 2.3 AI 분류 ACTIVE 1,837건 (V4 taxonomy — TV Gate 적용 후)

| 분류 | 건수 | 카테고리 | 설명 |
|---|---|---|---|
| AI_AUTO_DEFAULT | 771 | DESTINATION_RESTAURANT(223) + non-rest(548) | ai_auto=True, AI 이티너리 기본 포함 |
| AI_CONDITIONAL | 199 | SPECIALTY_INTEREST_RESTAURANT | ai_auto=False, 조건부(사용자 식이 맥락 확인 시 가능) |
| AI_NOT_AUTO_RECOMMENDED | 837 | UTILITY_RESTAURANT | ai_auto=False, SEARCHABLE=YES, AI 기본 추천 제외 |
| AI_HARD_BLOCKED | 30 | non-restaurant + INCHEON | ai_auto=False, AI 이티너리 차단 |
| **합계** | **1,837** | | |

**AI_HARD_BLOCKED 세부 (30건)**:
- NOT_AI_ITINERARY_ELIGIBLE (non-restaurant): 27건 — 쇼핑몰, 백화점, 면세점, 특정 자연·문화시설
- INCHEON_AIRPORT_INFORMATION_CENTER: 3건 — AI_ITINERARY=NO override, SEARCHABLE=YES 유지

**SPECIALTY 분류 상세**:
- SPECIALTY 199건은 "하드차단"이 아닌 **AI_CONDITIONAL** (조건부)
- AI_ITINERARY_ELIGIBLE=CONDITIONAL, ai_blocked_reason=SPECIALTY_INTENT_REQUIRED
- 사용자가 할랄·비건·살람서울 등 전문 식이 수요를 명시한 맥락에서는 AI 이티너리 포함 가능

```
SPECIALTY_COUNTED_AS_HARD_BLOCKED = 0  ← V4 보정
RESTAURANT_AI_RECOMMENDABLE_TOTAL = 422 (DESTINATION 223 + SPECIALTY 199)
```

---

## 3. Phase별 작업 요약

### Phase 0: Preflight

- `git fetch origin` 완료
- Seoul source branch: `origin/data/seoul-collection-v1` HEAD `7a71304`
- Common policy: `f9e3543` (최신 확인)
- 기존 Seoul QA PASS (a070926) 확인

| 기존 서울 데이터 | 상태 |
|---|---|
| non-food 573건 (normalized JSONL) | coords 573/573, img 573/573, QA PASS |
| food 1,259건 (food-discovery-r1) | lat/lng 1259/1259, img 1259/1259, phone 1222/1259 |
| GENERAL_ACCOMMODATION_EXCLUDE 17건 | routing에서 이미 제외 |

### Phase 1-2: Service Universe + Curation

**포함 기준**: VisitSeoul 공식 소스에서 QA PASS된 573 non-food + 1,259 food + special2 2건

**제외**:
- 일반 숙박: 기존 routing에서 이미 GENERAL_ACCOMMODATION_EXCLUDE(17건) 처리됨. canonical에 포함 없음.
- KOPc3g5o6: MULTI_LOCATION → EXCLUDED

**EVENT_TRACK 4건 (KOPd5mmfg, KOP47mbp7, KOPw5jg9e, KOPvro3vg):**
- 기존 `existing_detail_available=False` (VisitSeoul detail 미수집)
- coords 없음, image 없음
- 해당 행사 장소(남산골한옥마을, 서울숲, DDP 등)는 non-food 573에 이미 포함됨
- → EVENT_TRACK_DETAIL_PENDING: 7일 주기 event refresh cycle에서 처리 권장

### Phase 3: Coordinate NAV Audit

**비식품 573건**:
- 전건 `has_coords=True`, coords.lat/lng 정상
- 서울 bbox(37.4–37.8 / 126.7–127.2) 외: 인천공항 3건만 존재
  - 인천공항: OUTSIDE_SEOUL_ADMIN_INCHEON_AIRPORT_LEGITIMATE_TOURIST_FACILITY 사유 기록

**식품 1,259건**:
- 전건 facts.lat/lng 존재
- Seoul bbox 내: 1,259/1,259

**최종 NAV_READY: 1,833/1,833 = 100%**

*VWorld 추가 geocoding 불필요 — 기존 수집 데이터 전건 좌표 완비*

### Phase 4: Image Audit

**비식품 573건**: main_img 전건 HTTP URL 보유 (VISITSEOUL_OFFICIAL)

**식품 1,259건**: facts.image_main_url 전건 HTTP URL 보유 (VISITSEOUL_OFFICIAL)

**IMAGE_MISSING**: KOPgdf9ry 1건 (진정한 예외)

**최종 IMAGE: 1,832/1,833 = 99.95%**

### Phase 5: Food 파이프라인

| 항목 | 값 |
|---|---|
| restaurant 총수 | 1,259 |
| NAV_READY | 1,259/1,259 |
| IMAGE | 1,259/1,259 |
| PHONE | 1,222/1,259 (97.1%) |
| 영업시간 raw text | 1,243/1,259 (98.7%) |
| 주소 | 1,258/1,259 (99.9%) |

1건 ADDRESS_MISSING: source review_flag에서 알려진 예외. NAV (lat/lng) 보유로 NAV_READY 유지.

### Phase 6: AI Eligibility (TV Gate + V4 Event 추가 후)

| 구분 | V3 | V4 | 비고 |
|---|---|---|---|
| AI_AUTO=True (DESTINATION_RESTAURANT) | 223 | 223 | 동일 |
| AI_AUTO=True (non-restaurant eligible) | 544 | 548 | +4 이벤트 |
| **AI_AUTO_DEFAULT 합계** | **767** | **771** | |
| AI_CONDITIONAL (SPECIALTY_INTEREST_RESTAURANT) | 199 | 199 | 조건부 (하드차단 아님) |
| AI_NOT_AUTO_RECOMMENDED (UTILITY_RESTAURANT) | 837 | 837 | SEARCHABLE=YES |
| AI_HARD_BLOCKED (non-restaurant NOT_ELIGIBLE) | 27 | 27 | |
| AI_HARD_BLOCKED (INCHEON_AIRPORT) | 3 | 3 | |
| **ACTIVE 전체** | **1,833** | **1,837** | |

*이미지 부재(KOPgdf9ry)는 AI_AUTO 차단 사유 아님. 태스크 정책 준수.*
*SPECIALTY ai_auto=False이나 AI_ITINERARY_ELIGIBLE=CONDITIONAL — AI_HARD_BLOCKED로 집계하지 않음.*

### Phase 6-TV: Travel Value Gate (TV Gate v1.0)

**정책 근거**: `seoul-restaurant-travel-value-live-validation-v1.md` + `seoul-integrated-travel-value-policy-v1.md` (commit 7f9fae5)

**신호 체계 (결정론적, AI 추론 금지)**:
- DESTINATION: `source_tags.tags`에 미쉐린가이드/수요미식회/오래가게/백년가게/블루리본서베이/3대천왕/무한도전/맛있는녀석들/식신로드 중 1개 이상
- SPECIALTY: `facts.halal_evidence` / `salam_evidence` / `dietary_evidence` / `muslim_evidence` True, 또는 태그에 살람서울/할랄/비건/채식/베지테리안/vegetarian/vegan/무슬림/salam 포함
- UTILITY: 위 두 조건 없음 (default)

| TV Class | 건수 | AI_ITINERARY_ELIGIBLE | ai_auto |
|---|---|---|---|
| DESTINATION_RESTAURANT | 223 | YES | True |
| SPECIALTY_INTEREST_RESTAURANT | 199 | CONDITIONAL | False |
| UTILITY_RESTAURANT | 837 | NO | False |
| **합계** | **1,259** | | |

```
COUNT_TARGET             = NOT_DEFINED_BY_DESIGN
NUMERIC_PRUNING_POLICY   = FORBIDDEN
TV_GATE_UNRESOLVED       = 0
NUMERIC_TARGET_FORCED    = NO
```

### Phase 7: Final QA (25개 체크 — V4 확장)

| 체크 | 결과 |
|---|---|
| QA-01 SERVICE_UNIVERSE_FINAL(1838/1837/1) | PASS |
| QA-02 EVENT_ADDED=4 | PASS |
| QA-03 STANDARD_ACCOMMODATION=0 | PASS |
| QA-04 UNRESOLVED_CURATION=0 | PASS |
| QA-05 NAV_MISSING=0 | PASS |
| QA-06 INVENTED_COORD=0 | PASS |
| QA-07 COORD_IN_KOREA | PASS |
| QA-08 AI_DECISION_UNKNOWN=0 | PASS |
| QA-09 DUPLICATE_CID=0 | PASS |
| QA-10 SECRET_LEAK=0 | PASS |
| QA-11 SCHEMA_VERSION_CONSISTENT | PASS |
| QA-12 IMAGE_RIGHTS_VALID | PASS |
| QA-13 INCHEON_AIRPORT_AI_BLOCKED | PASS |
| QA-14 MULTI_LOCATION_EXCLUDED | PASS |
| QA-15 GYEONGJU_NOT_MODIFIED | PASS |
| QA-16 TV_GATE_COVERAGE=1259 | PASS (D=223 SP=199 U=837) |
| QA-17 SPECIALTY_COUNTED_AS_HARD_BLOCKED=0 | PASS |
| QA-18 RESTAURANT_AI_RECOMMENDABLE_TOTAL=422 | PASS (223+199) |
| QA-19 EVENT_REVIEWED=4_AND_IN_CANONICAL | PASS |
| QA-20 EVENT_EXCLUDED_BY_API_404_ONLY=0 | PASS |
| QA-21 EVENT_TRACK_DETAIL_PENDING=0 | PASS |
| QA-22 NEW_EVENT_NAV_READY | PASS (4/4) |
| QA-23 NEW_EVENT_IMAGE_READY | PASS (4/4) |
| QA-24 INCHEON_AIRPORT_UTILITY_ROLE_CONFIRMED=3 | PASS |
| QA-25 OTHER_CITY_DATA_UNCHANGED | PASS |

---

## 4. Canonical 파일 정보

| 항목 | 값 |
|---|---|
| 파일 | `data/seoul-final-release/seoul-canonical-places-v1.jsonl` |
| 총 레코드 수 | **1,838** (ACTIVE=1,837, EXCLUDED=1) |
| SHA256 (V4 — FINAL) | `cba0a3599d76379b82a09298c2c61f5d7adc41afcb0aca4ed20e8b83b60704cd` |
| SHA256 (V3 — TV Gate 후) | `981fc9b68ffa60c41425bb316746f1cd65caeed2c97e32c8e709ee67315b15ed` |
| SHA256 (V1 — TV Gate 전) | `f4072d6fdf85820f6f86788b33b64d6314806ebd16905b9ac5779107b03e4ff8` |
| schema_version | `seoul-canonical-places-v1` |
| branch | `data/seoul-targeted-completion-v1` |

---

## 5. 이미지 출처 요약 (ACTIVE 1,837건 기준)

| 출처 | 건수 | 권리 유형 |
|---|---|---|
| VISITSEOUL_OFFICIAL (non-food) | 573 | VisitSeoul 공식 API 이미지 |
| VISITSEOUL_OFFICIAL (food) | 1,259 | VisitSeoul 공식 API 이미지 |
| VISITSEOUL_OFFICIAL (event, V4 추가) | 4 | VisitSeoul 공식 API 이미지 (parentSn 기반) |
| IMAGE_MISSING | 1 | KOPgdf9ry (진정한 예외) |
| **합계** | **1,837** | |

---

## 6. EVENT_TRACK 4건 처리 기록 (V4 FINAL — CANONICAL_ADDED)

### 6.1 V4 보정 배경

V3에서 VisitSeoul API(api-call.visitseoul.net) HTTP 404 반환을 근거로 4건을 EXCLUDE_INVALID로 처리했으나, **API 404 ≠ 행사 자체 무효**. VisitSeoul API와 VisitSeoul 웹(english.visitseoul.net)은 서로 다른 레이어이며, 4건 모두 공식 영문 사이트에서 진행 중임이 확인됨.

### 6.2 공식 웹 재검증 결과 (검증일: 2026-08-17)

| CID | 제목 | 공식 URL | 기간 | 상태 | 최종 결정 |
|---|---|---|---|---|---|
| KOPd5mmfg | 2026 서울시 태권도 공연 | [english.visitseoul.net/…/ENPd5mmfg](https://english.visitseoul.net/events/2026SeoulCityTaekwondo/ENPd5mmfg) | 2026-05-09~10-18 | 진행 중 | KEEP_CURRENT |
| KOP47mbp7 | 2026 서울국제정원박람회 | [english.visitseoul.net/…/ENP47mbp7](https://english.visitseoul.net/events/2026Seoul-International-Garden-Show/ENP47mbp7) | 2026-05-01~10-27 | 진행 중 | KEEP_CURRENT |
| KOPw5jg9e | 2026 남산골 전통체험: 장인의 시간 | [english.visitseoul.net/…/ENPw5jg9e](https://english.visitseoul.net/events/2026Hands-On-Experience-rograms/ENPw5jg9e) | 2026-04-03~10-25 | 7~8월 운영 중단, 9월~ 재개 예정 | KEEP_FUTURE |
| KOPvro3vg | 2026 서울야외도서관 | [english.visitseoul.net/…/ENPvro3vg](https://english.visitseoul.net/events/2026SeoulOutdoorLibrary/ENPvro3vg) | 2026-04-23~11-01 | 진행 중 (서울광장·광화문광장·청계천) | KEEP_CURRENT |

### 6.3 Canonical 추가 상세

| CID | category | lat | lng | coord_source | image_parentSn |
|---|---|---|---|---|---|
| seoul-KOPd5mmfg | attraction | 37.5595422700067 | 126.994738735334 | CANONICAL_VENUE_MATCH (남산골한옥마을) | 79650 |
| seoul-KOP47mbp7 | attraction | 37.54306914850906 | 127.04179894329786 | VWORLD_GEOCODE (서울숲, 뚝섬로 273) | 79322 |
| seoul-KOPw5jg9e | attraction | 37.5595422700067 | 126.994738735334 | CANONICAL_VENUE_MATCH (남산골한옥마을) | 79245 |
| seoul-KOPvro3vg | attraction | 37.5688262269382 | 126.978223249695 | CANONICAL_VENUE_MATCH (서울광장, KOP57x3om) | 79252 |

```
EVENT_API_ENDPOINT:           https://api-call.visitseoul.net/api/v1/contents/detail
EVENT_API_RESULT:             HTTP 404 for all 4 CIDs
EVENT_WEB_VERIFIED:           YES (english.visitseoul.net, 2026-08-17)
EVENT_API_STATUS:             HTTP_404_WEB_CONFIRMED (API 레이어 이슈, 행사 자체 유효)
EVENT_EXCLUDED_BY_API_404:    0  ← V4 보정
EVENT_ADDED:                  4
EVENT_EXCLUDED:               0
EVENT_TRACK_DETAIL_PENDING:   0
CANONICAL_ADDED:              YES (4건 모두 ACTIVE attraction 레코드로 추가)
```

**KOPvro3vg (서울야외도서관) 멀티장소 처리**: 서울광장·광화문광장·청계천 3개 장소이나, **이벤트**이므로 MULTI_LOCATION_NON_PLACE 제외 정책 적용 대상 아님. 서울광장을 주 nav 포인트로 설정.
**KOPw5jg9e (남산골 전통체험)**: 7~8월 운영 중단 중이나, 9~10월 회차 예정 → KEEP_FUTURE. Canonical에 ACTIVE로 포함 (event_final_decision=KEEP_FUTURE 기록).

---

## 7. 공통 정책 연결

| 정책 | 파일 | 적용 내용 |
|---|---|---|
| 좌표/nav 정책 | `multicity-phone-semantics-and-geometry-policy-v1.md` RULE-H~M | bbox 검증, area/line anchor |
| Accommodation 정책 | `multicity-place-accommodation-policy-v1.md` | STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT |
| Eligibility 정책 | `multicity-place-eligibility-policy-v1.md` | 5축 판단, AI_ITINERARY vs SEARCHABLE 분리 |
| Food 수집 정책 | `multicity-food-discovery-collection-policy-v1.md` | Phone Gate V2 |
| TV Gate (서울 식당) | `seoul-restaurant-travel-value-live-validation-v1.md` + `seoul-integrated-travel-value-policy-v1.md` | DESTINATION/SPECIALTY/UTILITY 분류 |

COMMON_POLICY_COMMIT = `f9e3543`

---

## 8. SEOUL_DATA_STATUS (FINAL — TV Gate + Event 4건 추가 후)

```
SEOUL_DATA_STATUS = {
    "TOTAL_RECORDS": 1838,
    "SERVICE_UNIVERSE": 1837,
    "category": {
        "restaurant": 1259,
        "attraction": 526,
        "shopping": 30,
        "nature": 22
    },
    "EXCLUDED": 1,
    "NAV_READY": "1837/1837 = 100%",
    "IMAGE": "1836/1837 = 99.95%",
    "IMAGE_DISPLAY": "1836/1837 = 99.95%",
    "AI_TAXONOMY": {
        "AI_AUTO_DEFAULT": 771,
        "AI_CONDITIONAL": 199,
        "AI_NOT_AUTO_RECOMMENDED": 837,
        "AI_HARD_BLOCKED": 30,
        "AI_DECISION_UNKNOWN": 0
    },
    "AI_AUTO_DEFAULT_NOTE": "DESTINATION_RESTAURANT(223) + non-rest eligible(548)",
    "AI_CONDITIONAL_NOTE": "SPECIALTY_INTEREST_RESTAURANT(199) — 조건부, 하드차단 아님",
    "AI_HARD_BLOCKED_NOTE": "NOT_AI_ITINERARY_ELIGIBLE(27) + INCHEON_AIRPORT(3)",
    "RESTAURANT_AI_RECOMMENDABLE_TOTAL": 422,
    "SPECIALTY_COUNTED_AS_HARD_BLOCKED": 0,
    "TV_GATE": {
        "DESTINATION_RESTAURANT": 223,
        "SPECIALTY_INTEREST_RESTAURANT": 199,
        "UTILITY_RESTAURANT": 837,
        "TV_GATE_VERSION": "v1.0",
        "TV_GATE_AS_OF": "2026-08-17"
    },
    "EVENT_TRACK": {
        "EVENT_REVIEWED": 4,
        "EVENT_ADDED": 4,
        "EVENT_EXCLUDED": 0,
        "EVENT_TRACK_DETAIL_PENDING": 0,
        "EVENT_EXCLUDED_BY_API_404_ONLY": 0,
        "EVENT_WEB_VERIFIED": "YES (english.visitseoul.net, 2026-08-17)"
    },
    "PHONE": "1768/1837 = 96.2%",
    "FINAL_QA": "PASS (25 checks)",
    "SAFE_TO_CLOSE": "YES",
    "CANONICAL_SHA256": "cba0a3599d76379b82a09298c2c61f5d7adc41afcb0aca4ed20e8b83b60704cd",
    "CANONICAL_SHA256_V3": "981fc9b68ffa60c41425bb316746f1cd65caeed2c97e32c8e709ee67315b15ed",
    "BRANCH": "data/seoul-targeted-completion-v1",
    "COMMON_POLICY_COMMIT": "f9e3543"
}
```

---

## 9. Final Decision

```
SEOUL_FINAL_QA                         = PASS (25 checks)
SEOUL_DATA_STATUS                      = COMPLETE_WITH_IMAGE_EXCEPTIONS
SEOUL_NAVIGATION_COMPLETE              = YES (1837/1837)
SEOUL_IMAGE_TRACK_COMPLETE             = YES (1건 진정한 예외 — KOPgdf9ry)
SEOUL_AI_DECISION_COMPLETE             = YES (AI_DECISION_UNKNOWN=0)
SEOUL_TV_GATE_COMPLETE                 = YES (1259/1259 TV_GATE_CLASSIFIED)
SEOUL_EVENT_TRACK_PENDING              = 0 (4건 공식 웹 재검증 후 CANONICAL_ADDED)
EVENT_EXCLUDED_BY_API_404_ONLY         = 0 (V4 보정 완료)
SPECIALTY_COUNTED_AS_HARD_BLOCKED      = 0 (V4 보정 완료)
SAFE_TO_CLOSE_SEOUL_DATA               = YES
FURTHER_SEOUL_BROAD_RECOVERY_REQUIRED  = NO
NEXT_CITY                              = JEJU
```

---

## 10. 다음 단계

**NEXT_CITY = JEJU**

제주 데이터는 `data/jeju-collection-v1` branch에서 수집 완료 (제주 현황: project_jeju_pipeline_status.md 참조).
PLACE_FINAL_QA_V1 PASS(752a7a2). CORE=657, AI_AUTO=647.
NEXT=Naver전화6건+FOOD.

**서울 DB 주의사항**:
- canonical import 여부는 Main 팀 결정 (SECTION 11 기존 handoff 참조)
- PLACE_SEARCHABLE_USER_PICK 14건: SEARCHABLE=YES, EXPLORE·AI=NO 유지
- 인천공항 3건: AI_ITINERARY=NO 반영됨
- EVENT_TRACK 4건: 공식 웹(english.visitseoul.net) 재검증 후 전건 CANONICAL_ADDED (V4 보정)
- TV Gate: ai_auto=True는 DESTINATION_RESTAURANT(공식 큐레이션 보유) 223건 + non-rest 548건 = 771건. SPECIALTY 199건은 AI_CONDITIONAL, UTILITY 837건은 AI_NOT_AUTO_RECOMMENDED.
- SPECIALTY 199건: AI_HARD_BLOCKED 아님 — AI_CONDITIONAL (사용자 식이 맥락 확인 시 AI 이티너리 포함 가능)

---

## 11. 작업 이력

| 태스크 | 커밋 | 내용 |
|---|---|---|
| TASK-SEOUL-ALL-DATA-TARGETED-COMPLETION-V1 | `0fcbcc5` | 최초 canonical 빌드 (1834건, AI_AUTO=1803) |
| TASK-SEOUL-FOOD-TV-GATE-AND-EVENT-FINAL-CLOSE-V3 | `7b85524` | TV Gate 적용 (1259건 분류), Event 4건 EXCLUDE_INVALID, AI_AUTO=767 |
| TASK-SEOUL-EVENT-4-FINAL-CORRECTION-AND-CLOSE-V4 | 이번 커밋 | Event 4건 공식 웹 재검증+canonical 추가, SPECIALTY AI_CONDITIONAL 보정, 25개 QA PASS |

TASK-SEOUL-ALL-DATA-TARGETED-COMPLETION-V1 완료보고서
작업을 완료했습니다.
