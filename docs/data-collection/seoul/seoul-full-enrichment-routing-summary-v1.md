# 서울 Full Enrichment Routing Summary v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1 |
| START_SHA | e6ee1f1 |
| BRANCH | data/seoul-collection-v1 |
| 생성일 | 2026-08-10 |
| AS_OF | 2026-08-10 |
| 입력 | data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl |
| 출력 JSONL | data/seoul-source-audit/seoul-full-enrichment-routing-v1.jsonl |
| 출력 Manifest | data/seoul-source-audit/seoul-full-enrichment-routing-manifest-v1.jsonl |
| Script | scripts/run-seoul-full-enrichment-routing-v1.py |
| API 호출 | 0 |
| DB 변경 | 0 |

---

## A. Start State

```
INPUT_TOTAL = 3,765
UNIQUE_CID = 3,765
DUPLICATE = 0
AS_OF = 2026-08-10
POLICY_VERSION = v1.0.0
```

기존 확보 detail:
- Nature 119 (PLACE_CORE_CANDIDATE × nature category codes)
- Integrated 120 (TASK-SEOUL-TRAVEL-VALUE-INTEGRATION)
- Dryrun 16 (이미지 검증용; integrated와 1 CID 중복)
- **EXISTING_DETAIL_UNIQUE_CIDS = 254** (중복 제거, ≠ 239 call count)

---

## B. Full Routing QA

```
INPUT_TOTAL = 3765
OUTPUT_TOTAL = 3765
UNIQUE_CID = 3765
EVERY_CID_HAS_PRIMARY_ROUTING = YES
PRIMARY_ROUTING_UNKNOWN = 0
BYTE_IDENTICAL_REPRODUCIBLE = YES (2회 실행 SHA256 일치)
SOURCE_FILE_MUTATION = NO
NEW_API_CALLS = 0
```

---

## C. Primary Routing Distribution

> **ROUTING_COUNTS_ARE_NOT_RETENTION_COUNTS = YES**
> 아래 숫자는 GoKoreaMate 최종 포함/제외 결과가 아니다.
> "다음으로 필요한 것"의 분류다.

| Routing | 레이블 | 건수 | % |
|---|---|---|---|
| A | DETAIL_REQUIRED_NOW | 1,318 | 35.0% |
| B | DETAIL_ALREADY_SUFFICIENT | 254 | 6.7% |
| C | UTILITY_ENRICHMENT_REQUIRED | 921 | 24.5% |
| D | EVENT_DATE_ENRICHMENT_REQUIRED | 1,152 | 30.6% |
| E | OTHER_OFFICIAL_SOURCE_REQUIRED | 0 | 0.0% |
| F | EXTERNAL_SEARCH_LAYER_SUITABLE | 72 | 1.9% |
| G | USER_ENRICHMENT_SUITABLE | 0 | 0.0% |
| H | HOLD_USER_REVIEW_REQUIRED | 48 | 1.3% |
| **합계** | | **3,765** | **100%** |

**E=0, G=0 설명**: E와 G는 secondary routing으로 대량 부여됨.
- E secondary: 1,856건 (VisitSeoul detail 수집 후 official source 보강 필요)
- G secondary: 417건 (user enrichment layer로 보완 적합)

---

## D. Secondary Routing

| Secondary | 건수 | 의미 |
|---|---|---|
| E (official source 보강) | 1,856 | primary A/B/C 수집 후 전문 official source 추가 필요 |
| G (user enrichment) | 417 | 소형 카페, 개인 맛집, 한강 포인트 등 — My Places 보완 |
| C (utility 추가) | 278 | B primary 이지만 utility enrichment도 필요 |
| D (date 추가) | 38 | B primary 이지만 event date 재확인 필요 |
| H (review 병행) | 1 | 테마공원 일부 |

**Secondary E 1,856건**: 전국 공통 규칙 — VisitSeoul detail은 기본 정보 확보용. 전문적 여행 정보 (코스, 인증, 브랜드, 공식 일정)는 별도 source 필요.

---

## E. Source Content Types

| 유형 | 건수 | 비고 |
|---|---|---|
| PHYSICAL_PLACE | 2,474 | 레스토랑, 장소, 쇼핑 등 |
| EVENT | 1,186 | EVENT_TRACK (행사시설 4건 제외) |
| EXPERIENCE_CONTENT | 105 | 체험관광 계열 |
| ROUTE_COURSE | 0 | VisitSeoul에 독립 코스 CID 없음 |
| EDITORIAL_CONTENT | 0 | — |
| UTILITY_SERVICE | 0 | — |
| UNKNOWN | 0 | — |

**ROUTE_COURSE = 0**: 경로/코스 정보는 PHYSICAL_PLACE (자연공원, 한강공원) 내 experience로 표현됨. 독립 코스 entity를 위해서는 SEOUL_CITY 공식 source 보강 필요 (→ E secondary).

---

## F. Existing Detail Reuse

| 구분 | CID 수 | Source Task |
|---|---|---|
| Nature 119 (category code 기반) | 119 | TASK-SEOUL-VISITSEOUL-NATURE-TREKKING |
| Integrated 120 detail samples | 120 | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION |
| Dryrun 16 (−1 중복) = 15 신규 | 15 | TASK-SEOUL-VISITSEOUL-DETAIL-DRYRUN |
| **전체 unique** | **254** | |

- Nature ∩ Integrated: 0 (완전 독립)
- Dryrun ∩ Integrated: 1 (KOPnpz0q2, 카페/찻집)
- **EXISTING_DETAIL_UNIQUE_CIDS = 254** (239 call count ≠ unique)

254건 전체가 B primary routing으로 활용됨.

---

## G. Restaurant (1,259건)

| 라우팅 | 건수 | 의미 |
|---|---|---|
| B — 기존 detail 보유 | 42 | 통합 샘플 40 + dryrun 카페 2 |
| C — utility enrichment | 921 | 영업정보, 메뉴, 식이제한 확인 필요 |
| A — destination restaurant | 236 | 명물/유명 키워드 → detail로 목적지형 분류 필요 |
| F — 주점/바 | 60 | 낮은 큐레이션 가치, external search 적합 |

**합계 = 1,259** ✓

**검증**: 식당 수가 많다는 이유로 제외하거나 수를 줄이지 않음. 1,259건 전체가 최소 1개 routing 보유. C(utility)는 "식당 제외"가 아닌 "utility 정보 추가 수집" 의미.

---

## H. Event (1,190건)

| 라우팅 | 건수 | 의미 |
|---|---|---|
| B — 기존 detail 보유 | 38 | 통합 샘플 35건 + dryrun 3건 |
| D — date/status enrichment | 1,152 | 현재성 확인 없으면 AI 일정 사용 불가 |

특이 사항:
- Cp7e6o3 (행사시설, 4건): EVENT_TRACK이지만 실제 physical venue → A primary
- 이 4건은 D(1,152)에 포함되지 않고 A에 포함됨

**합계 = 1,190** ✓

Event lifecycle 목표:
- ENDED → AI 제외, EXPLORE 숨김
- RECURRING → 시즌 기반 AI 추천
- ACTIVE/UPCOMING → 날짜 기반 AI 일정 연동

---

## I. Nature / Trekking / Route

| 카테고리 | 건수 | 라우팅 | 의미 |
|---|---|---|---|
| 문화관광 > 도시공원 (한강공원 포함) | 73 | B + G·E secondary | 기존 detail 보유. user enrichment + city official 보강 |
| 자연관광 > 자연경관(산) (북한산 등) | 29 | B + E secondary | 기존 detail. 국립공원 코스 data 보강 필요 |
| 자연관광 > 자연공원 | 17 | B + E secondary | 기존 detail. 코스 detail 보강 필요 |
| 자연관광 > 자연경관(하천) (청계천 등) | 13 | A + E secondary | UNRESOLVED → detail 확인 필요 |
| 자연관광 (일반) | 9 | A + E secondary | 장소 정보 부족 |

**한강 관계 보존**:
- 한강공원(physical) → walking, cycling, picnic, night_view, hangang_experience intent
- 한강 related EVENT → D routing (날짜 별도 확인)
- 단일 title dedupe로 삭제하지 않음 — 같은 위치, 다른 travel experience

**청계천 관계**:
- UNRESOLVED(하천) → A routing → VisitSeoul detail로 entity 확정
- walking_urban, photography, night_view intent 감지됨

**북한산**:
- 기존 29건 산 detail (B) 보유
- 세부 등산코스/거리/난이도 → E secondary (국립공원 공단)

---

## J. Shopping / K-pop / Experience

| 유형 | 건수 | 라우팅 | Layer |
|---|---|---|---|
| 면세점 | 5 | A | CURATED_CANONICAL |
| 백화점 | 12 | A | CURATED_CANONICAL |
| 쇼핑몰 | 30 | A | CURATED_CANONICAL |
| K-pop/K-beauty 키워드 | 40 | A + E secondary | CURATED + OFFICIAL_BRAND |
| 전문매장/상가 | 241 | A (대부분) | CURATED or EXTERNAL_SEARCH 판정 후 |
| 대형마트 | 3 | F | EXTERNAL_SEARCH |
| 기존 detail 보유 | 21 | B | 이미 평가 가능 |

Temple Stay / 산사체험:
- TEMPLE_STAY_CANDIDATE 2건 → A (공식 등록 확인 필요)
- 체험관광 > 산사체험 2건 → A + E secondary (공식 사이트)

---

## K. Traveler Intent Coverage

45개 taxonomy 기반. LIST routing evidence level이므로 기존 confirmed coverage를 상향 조정하지 않음.

| 강도 | Intent 수 | 대표 예시 |
|---|---|---|
| STRONG (11) | korean_cuisine, shopping, cycling, walking_urban, hangang, nature, heritage, traditional_culture, festival, family_kids, night_view | 변경 없음 |
| MODERATE (19) | kpop, kbeauty, exhibition, performance, wellness 등 | 변경 없음 |
| WEAK (14) | vegetarian, halal, solo_travel, breakfast, late_night 등 | 변경 없음 |
| NOT_AVAILABLE (1) | food_delivery | 변경 없음 |

**Critical gap (WEAK intent):**

| Intent | inventory_candidate | 문제 |
|---|---|---|
| halal | 26 | 인증 미확인. 공식 리스트 필요 |
| vegetarian | 29 | 인증 미확인. HappyCow 등 필요 |
| solo_travel | 18 | 혼밥 여부 detail 확인 필요 |
| late_night | 13 | 영업시간 정보 부족 |
| breakfast | 26 | 조식 정보 부족 |

---

## L. Enrichment Source Gap

| Source | 필요 영역 | 건수 예상 |
|---|---|---|
| VISITSEOUL_DETAIL | A routing 1,318건 + C routing 921건 | 2,239 |
| OFFICIAL_EVENT / OFFICIAL_VENUE | D routing 1,152건 | 1,152 |
| PUBLIC_DATA (할랄 인증, 채식) | halal 26건 + vegetarian 29건 | 55 |
| OFFICIAL_BRAND (K-pop) | kpop 70건 + unregistered K-pop venues | 100+ |
| NATIONAL_PARK / SEOUL_CITY | 북한산/둘레길 route detail | 46건 |
| USER_CONTRIBUTION | G secondary 417건 (소형 카페, 개인 장소) | long-term |

---

## M. Next Collection Priorities

우선순위는 traveler need 기반. 건수 cap 없음.

**Priority Group 1 (AI itinerary core)**:
- PLACE_CORE VisitSeoul detail (~194건)
- EXPERIENCE_CANDIDATE detail (~108건)
- TEMPLE_STAY 공식 등록 확인

**Priority Group 2 (현재성 + utility)**:
- Event date/status pipeline (1,152건)
- Restaurant utility enrichment (921건 중 halal/vegan/solo 우선)
- PLACE_CONDITIONAL subset (공연시설, 종교성지, 레저)

**Priority Group 3 (intent gap)**:
- K-pop official source
- 할랄/채식 공식 인증 source
- Nature/Trekking route 전문 data

```
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1

WHY_THIS_NEXT:
  194건 PLACE_CORE (비보유) + 108건 EXPERIENCE 단일 배치 가능.
  ai_eligible=YES 즉시 확정 → AI itinerary 서울 서비스 시작 최소 조건.
  Restaurant 921건/Event 1,152건 대비 건당 가치 최고.
```

---

## N. User-Generated Enrichment

GoKoreaMate는 공식 데이터 외 사용자 직접 추가 장소(My Places)를 지원.

```
공식 bootstrap: BROAD_BASELINE_COVERAGE
사용자 데이터: CONTINUOUS_ENRICHMENT + LONG_TAIL_DISCOVERY
```

G secondary (417건)은 user enrichment가 가장 자연스러운 경로:
- 소형 로컬 카페 (Cx0t8m5 일부)
- 개인 한강 포인트
- 동네 산책 장소

**단**: user data가 채울 것이라는 이유로 공식 bootstrap을 의도적으로 빈약하게 구성하지 않는다.

---

## O. Multicity Handoff (전국 재사용 규칙)

서울 전수 routing 결과에서 도출한 전국 공통 규칙:

```
RULE_MH_01: SOURCE_CONTENT_TYPE 7종 분류 — 모든 source CID에 적용
RULE_MH_02: ROUTE_COURSE = 0 (VisitSeoul 공통) — 전문 source 별도 필요
RULE_MH_03: Event B+D secondary — 기존 detail 있어도 date 재확인 필요
RULE_MH_04: Restaurant C primary — 일괄 제외 금지, utility enrichment로 분류
RULE_MH_05: E secondary 1,856건 (49.3%) — 거의 절반이 official source 보강 필요
RULE_MH_06: EXISTING_DETAIL_UNIQUE_CIDS ≠ call count — 중복 CID 실제 확인 필요
RULE_MH_07: HOLD 1.3% = 교육시설 + 기타문화관광지 — 전국 공통 H 후보 pattern
```

부산/경주 frozen branch: 수정 금지. BACKFILL_RECOMMENDATION_ONLY.

---

## P. Files

| 파일 | 유형 | 설명 |
|---|---|---|
| `scripts/run-seoul-full-enrichment-routing-v1.py` | NEW | 전수 routing 스크립트 |
| `data/seoul-source-audit/seoul-full-enrichment-routing-v1.jsonl` | NEW | 3,765건 routing 결과 |
| `data/seoul-source-audit/seoul-full-enrichment-routing-manifest-v1.json` | NEW | 집계 manifest |
| `docs/data-collection/seoul/seoul-full-enrichment-routing-summary-v1.md` | NEW | 이 문서 |
| `docs/data-collection/seoul/seoul-enrichment-routing-distribution-v1.json` | NEW | 분포 상세 |
| `docs/data-collection/seoul/seoul-next-collection-priority-v1.md` | NEW | 수집 우선순위 |
| `docs/data-collection/seoul/seoul-traveler-need-routing-gap-v1.json` | NEW | 45 intent gap 분석 |
| `docs/data-collection/multicity-main-data-handoff-v1.md` | UPDATED | 핵심 결과만 추가 |

---

## Q. Safety

```
NEW_API_CALLS = 0
VISITSEOUL_API_CALLED = 0
KTO_API_CALLED = 0
EXTERNAL_BULK_COLLECTION = 0
VISITSEOUL_API_KEY_PRINTED = 0
DB_CHANGE = 0
SRC_PRODUCT_CHANGE = 0
UI_CHANGE = 0
SECRET_LEAK = 0
MASTER_PUSH = FORBIDDEN (data/seoul-collection-v1 유지)
GIT_ADD_A = FORBIDDEN (명시적 stage만)
BUSAN_GYEONGJU_BRANCH_MODIFIED = 0
```

---

## R. Git

```
START_SHA = e6ee1f1
BRANCH = data/seoul-collection-v1
NEW_FILES = 7
MODIFIED_FILES = 1
DB_CHANGE = 0
```

---

## 최종 QA 플래그

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NUMERIC_PRUNING_POLICY = FORBIDDEN
FULL_INVENTORY_ROUTED = YES
INPUT_TOTAL = 3765
OUTPUT_TOTAL = 3765
EVERY_CID_HAS_PRIMARY_ROUTING = YES
ROUTING_COUNTS_ARE_NOT_RETENTION_COUNTS = YES
EXISTING_DETAIL_REUSED = YES
EXISTING_DETAIL_UNIQUE_CIDS = 254
TRAVELER_NEED_ROUTING_READY = YES
NEXT_COLLECTION_PRIORITIES_READY = YES
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1
NEW_API_CALLS = 0
FULL_DETAIL_COLLECTION = NOT_STARTED
BYTE_IDENTICAL_REPRODUCIBLE = YES
SOURCE_FILE_MUTATION = NO
```

---

## S. 야간 품질 감사 델타 (TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1)

2026-08-10 오프라인 전수 감사 완료. 주요 발견:

```
MULTILINGUAL_STRUCTURAL_ANOMALIES = 0  (구조 이상 없음)
KO_ONLY_RECORDS                   = 110
HIGH_PRIORITY_LANGUAGE_GAP        = 258
ROUTE_COURSE_AUDITED_COUNT        = 1  (ROUTE_COURSE = 0 선언 수정 필요)
DULLEGIL_RECORD_COUNT             = 4
SCT_RECLASSIFIED_COUNT            = 16
ENTITY_RELATION_CANDIDATE_COUNT   = 306
DUPLICATE_CANDIDATE_COUNT         = 152
BAR_PUB_UPGRADE_CANDIDATE         = 28
BLANKET_RULE_DEFECT_COUNT         = 2
REVIEW_QUEUE_COUNT                = 526
ROUTING_V2_REQUIRED               = YES
```

**RULE_MH_02 수정**: "ROUTE_COURSE = 0 (VisitSeoul 공통)" → **ROUTE_COURSE ≥ 1**  
KOP015873이 감사 후 EDITORIAL_MULTI_ROUTE_CONTENT로 재분류되었으며,  
서울 둘레길 21개 코스는 개별 CID로 존재하지 않음이 확인됨.

후속 참조: `docs/data-collection/seoul/seoul-night-quality-audit-summary-v1.md`
