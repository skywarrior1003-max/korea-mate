# GoKoreaMate — Multicity Data Quality Guardrail v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 생성일 | 2026-08-09 |
| 근거 | TASK-MULTICITY-TOURISM-DATA-QUALITY-GUARDRAIL-V2 |
| 근거 SHA | 8c6f327 (V2 RESCUE 완료 시점) |
| 적용 대상 | 서울·제주 및 이후 모든 신규 도시 |
| 서울 시작 전 필독 | YES |

---

## 부산·경주 핵심 교훈 요약

### 부산 14건 False-Positive 원인

**실제 provenance:** 14건 전건 = KTO TourAPI (KorService2)

| 후보 | candidate_id | KTO contentId | 정규화 category | FP 원인 |
|---|---|---|---|---|
| 25의용단 | busan-K-00005 | 126814 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_NO_TOURISM_RELEVANCE_GATE |
| 사상문화원 | busan-K-00035 | 130382 | attraction | FP_SOURCE_SCOPE_TOO_BROAD, FP_NO_TOURISM_RELEVANCE_GATE |
| 함지골청소년수련관 | busan-K-00052 | 131452 | attraction | FP_SOURCE_SCOPE_TOO_BROAD, FP_NO_TOURISM_RELEVANCE_GATE |
| 영도관광실탄사격장 | busan-K-00053 | 131943 | attraction | FP_NO_TOURISM_RELEVANCE_GATE |
| 임랑카라반파크 | busan-K-00321 | 2741535 | nature | FP_NO_TOURISM_RELEVANCE_GATE |
| 명지시장 | busan-K-00322 | 2742601 | attraction | FP_NO_TOURISM_RELEVANCE_GATE |
| UN조각공원 | busan-K-00678 | 2945389 | attraction | FP_PARENT_CHILD_CONFUSION, FP_NO_TOURISM_RELEVANCE_GATE |
| 플루니티 | busan-K-00685 | 2999905 | attraction | FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE, FP_NO_TOURISM_RELEVANCE_GATE |
| 고래서이뻐 | busan-K-00720 | 3336600 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_NORMALIZATION_OVERPROMOTION |
| 주식회사감천아울 | busan-K-00752 | 3510987 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE |
| 주식회사아래모래 | busan-K-00753 | 3511011 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE |
| 주식회사어반힐링 | busan-K-00754 | 3511018 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE |
| 주식회사뷰티홀릭 | busan-K-00755 | 3511057 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE |
| 주식회사피알아이피 | busan-K-00756 | 3511071 | attraction | FP_ENTITY_TYPE_MISMATCH, FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE |

**Source 분포:**
- KTO (kto_tourapi): **14건** (100%)
- VisitBusan: 0건
- 부산 공공 API: 0건
- Other: 0건

**주의:** `busan-image-gap-128-v4r3.jsonl`의 `known_source=VisitBusan`은 이미지 해소 대상 소스를 의미하며, 원본 데이터 출처가 아님. 원본 출처는 `busan-final-place-event-release-manifest.json`의 `provenance_summary.primary_source`로 확인.

**FP 근본 원인 (부산):**
1. KTO contentTypeId=12 (관광지)는 범위가 광범위 — 문화기관·청소년시설·회사·복지시설 포함
2. 정규화 단계에서 tourism relevance gate 없음 — KTO 등재 = 관광지로 처리
3. 일부 기업명(`주식회사*`)이 관광 명소 내부/인접 운영체로 KTO에 등재됨 (감천마을 인근 등)

**부산 candidate_id prefix 규칙:**
- `busan-K-XXXXX` = KTO TourAPI 출처 (K = KorService2)
- `busan-F-XXXXX` = 음식점 (food) 계열

### 경주 200건 False-Negative 원인 및 해소

| 단계 | 상태 | 건수 | 원인/방법 |
|---|---|---|---|
| 초기 description gap | HOLD_SOURCE_ACCESS | 200 | JS-rendered listing, GJ01↔con_uid crosswalk 미구축 |
| V1 rescue (gyeongju.go.kr) | MATCH_VERIFIED | 139 | area_uid 상세 페이지 HTTP direct접근 (listing과 분리) |
| V2 rescue (KTO targeted) | RESCUED_KTO | 59 | KTO12 contentId 직접 targeted fetch |
| USER_EXCLUDED | — | 2 | no=81(생활체육공원), no=190(축구공원) |
| 최종 미해결 | 0 | 0 | 전건 판정 완료 |

**경주 FN 근본 원인:**
1. gyeongju.go.kr 권역별 관광지 listing = JS-rendered → HTTP only 접근 시 shell 반환
2. listing 실패 = detail 부재로 잘못 해석 → HOLD_SOURCE_ACCESS 과다 적용
3. KTO12 contentId를 보유한 59건에 대해 targeted detail fetch를 시도하지 않음
4. "listing에서 발견 못 함" = "관광지 아님"으로 잘못 결론

**경주 성공 열쇠:**
- LISTING ≠ DETAIL (detail endpoint가 server-rendered일 수 있음)
- 알려진 identifier (KTO contentId) → targeted detail fetch 우선
- gyeongju.go.kr detail page (area_uid, cmd=2) = HTTP accessible → listing 실패 무관하게 접근 가능

---

## PRINCIPLE 1 — SOURCE PRESENCE ≠ TOURISM RELEVANCE

공식/공공 데이터에 등재되어 있다는 이유만으로 서비스 관광지 READY 금지.

필수 판단: **TOURISM_RELEVANCE**

| 상태 | 의미 |
|---|---|
| TOURISM_RELEVANCE_CONFIRMED | 방문 이유 명확, 관광 맥락 확인 |
| TOURISM_RELEVANCE_REJECTED | 일반 행정/복지/상업/기업 시설, 관광 근거 없음 |
| TOURISM_RELEVANCE_USER_REVIEW_REQUIRED | 판단 애매, 사용자 확인 필요 |

```
공식 API 등재
≠
GoKoreaMate 관광지로 적합
```

적용: KTO contentTypeId=12 (관광지)를 포함한 모든 source category에서 관광 적합성을 별도 검증.

---

## PRINCIPLE 2 — SOURCE ABSENCE ≠ NON-TOURISM

특정 API에 없거나, 특정 listing에 실패했다고 자동 EXCLUDE/NON-TOURISM 처리 금지.

다음 유형은 primary source 누락 시 반드시 alternative source까지 확인:

- 국가유산 / 세계유산 / 문화재
- 왕릉 / 고분 / 사지 / 마애불 / 석탑
- 사찰 / 서원
- 박물관 / 미술관
- 공원 / 대표 자연명소 / 전망시설
- 시장 / 음식거리
- 문화시설 / 체험시설
- 현대 관광시설 / 테마파크
- 지역 대표 관광단지
- 공식 여행코스의 중요 stop
- K-pop / Hallyu 관련 장소

```
primary source listing 실패
→ source_absence_noted
→ alternative source 확인
→ identifier-based targeted fetch
→ USER_REVIEW_REQUIRED (마지막 수단)
≠
자동 EXCLUDE
```

---

## PRINCIPLE 3 — KNOWN SOURCE ID → TARGETED DETAIL FIRST

candidate가 기존 source identifier를 가지고 있으면 새 검색보다 targeted detail API 우선.

**우선순위:**
```
KNOWN KTO contentId → KTO detailCommon2 targeted fetch
KNOWN local official ID → local official detail endpoint
KNOWN heritage ID → heritage official detail
새 이름 검색 → 그 다음
USER_REVIEW_REQUIRED → 최후 수단
```

```
KTO targeted detail fetch 파라미터:
- serviceKey, MobileOS=ETC, MobileApp=GoKoreaMate, _type=json, contentId
- YN 파라미터 사용 금지 (deprecated)
- imageYN=Y 는 detailImage2에서만 사용 (subImageYN 금지)
```

---

## PRINCIPLE 4 — SOURCE CASCADE

도시마다 단일 source 의존 금지. 사전 source cascade 정의 필수.

**기본 cascade 순서:**

| 순위 | 소스 유형 |
|---|---|
| 1 | 지역 공식 관광사이트/API |
| 2 | 기존 candidate의 official source ID targeted detail API |
| 3 | KTO TourAPI (detailCommon2 + detailIntro2 + detailImage2) |
| 4 | 국가유산/전문 공공기관 source |
| 5 | 지자체 공공데이터 |
| 6 | 시설 공식 홈페이지 |
| 7 | USER_REVIEW_REQUIRED |

**도시별 예:**
- 부산: VisitBusan + KTO + 부산 공공데이터
- 경주: 경주시 문화관광(gyeongju.go.kr/tour area_uid) + KTO targeted + 국가유산 API
- 서울·제주: source coverage audit 후 cascade 확정

---

## PRINCIPLE 5 — TOURISM RELEVANCE GATE

신규 candidate는 READY 전에 다음 질문을 통과해야 한다:

1. 여행자가 실제 방문할 이유가 있는가?
2. 관광/문화/음식/자연/체험 가치가 명확한가?
3. 공식 관광 맥락이 있는가? (관광청 등재, 여행 가이드 언급, 공식 투어 프로그램 등)
4. 일반 회사/기관/생활시설은 아닌가?
5. 일반 시설이라도 특별 관광 스토리가 있는가? (K-pop 관련, 역사적 맥락, 유명 촬영지 등)
6. 다른 관광지의 단순 운영기관/회사명은 아닌가?
7. 상위 장소와 중복된 행정/시설 entity는 아닌가?

**결과:**
- PASS → 다음 단계 진행
- FAIL → TOURISM_RELEVANCE_REJECTED
- 애매 → USER_REVIEW_REQUIRED

**중요:** 회사/기관이라도 실제 방문 이유(유명 브랜드 견학, K-pop 관련, 역사 스토리, 공식 관광프로그램)가 있으면 KEEP 후보. 단순 이름만으로 자동 제외 금지.

---

## PRINCIPLE 6 — USER_REVIEW_REQUIRED 강제 규칙

다음 상황에서는 Claude가 최종 결론을 내리지 않는다:

**그룹 1 — 관광성 애매:**
- 회사, 기관, 교육시설, 산업시설, 종교시설, 공공시설, 체육시설, 일반 상업시설
- 관광 가능성이 조금이라도 있는 경우

**그룹 2 — 핵심 관광자원 누락:**
- 유명 국가유산, 박물관, 공원, 대표 관광지, 시장, 유명 자연명소인데
- primary API에서 미발견

**그룹 3 — entity 관계 애매:**
- 공원 vs 산책길, 관광단지 vs 개별시설, 시장 vs 먹거리거리
- 상위 유적지 vs 개별 문화재

**그룹 4 — source 간 충돌:**
- 한 source는 관광지, 다른 source는 일반시설

**USER_REVIEW 제공 내용:**

```
번호 | 장소명 | source | source original category | proposed category
관광지일 가능성 | 제외 가능성 | 추천 | 선택지(KEEP/EXCLUDE/MERGE/RECLASSIFY/MORE_RESEARCH)
```

사용자 답변 전 READY/EXCLUDE 확정 금지.

---

## PRINCIPLE 7 — USER ESCALATION TRIGGERS

다음 상황에서는 데이터 작업을 멈추고 사용자에게 확인 요청:

| Trigger | 상황 |
|---|---|
| TRIGGER_1 | 일반 회사/기관/산업시설이 attraction/nature에 반복 출현 |
| TRIGGER_2 | 도시의 유명 국가유산/박물관/대표 관광지가 primary API에서 미발견 |
| TRIGGER_3 | candidate의 10% 이상이 SOURCE_NOT_FOUND / CROSSWALK_FAILED / SOURCE_ACCESS 상태 |
| TRIGGER_4 | HTTP 200인데 실제 target 결과 없는 JS shell/AJAX interface |
| TRIGGER_5 | 하나의 source category에서 관광 무관 장소 반복 발견 |
| TRIGGER_6 | 이미 official source ID가 있는데 detail 조회 실패 후 다른 source 탐색으로 넘어가려는 경우 |
| TRIGGER_7 | 유명 장소인데 자동 규칙상 EXCLUDE될 가능성 발생 |

에스컬레이션 상태: `USER_DATA_POLICY_CONFIRMATION_REQUIRED`

---

## PRINCIPLE 8 — SILENT FAILURE GUARD

```
HTTP 200 ≠ 검색 성공
```

각 source attempt에 최소 기록:

| 필드 | 설명 |
|---|---|
| request_method | 요청 방식 (HTTP, API, targeted_fetch 등) |
| request_target | URL 또는 contentId |
| expected_signal | 기대한 응답 유형 |
| actual_signal | 실제 응답 내용 |
| usable_result | true/false |
| failure_type | 아래 목록 중 하나 |

**failure_type 목록:**
- `REAL_RESULT` — 실제 데이터 반환
- `EMPTY_RESULT` — 형식은 맞으나 결과 없음
- `JS_SHELL` — JS 렌더링 필요, HTTP only 시 shell 반환
- `AJAX_INTERFACE_ONLY` — AJAX 기반 검색, 서버사이드 결과 없음
- `ERROR_PAGE_IN_200` — HTTP 200이지만 에러 페이지
- `ACCESS_DENIED` — 접근 거부
- `WRONG_ID` — 요청 ID와 응답 ID 불일치
- `WRONG_ENTITY` — 다른 장소 반환
- `INVALID_PARAMETER` — 파라미터 오류
- `REDIRECT` — 다른 URL로 리다이렉트
- `SOURCE_CHANGED` — 소스 구조/URL 변경

`usable_result=true`는 실제 target data 반환 시에만.

---

## PRINCIPLE 9 — LISTING / DETAIL 분리

공식 사이트가 LISTING과 DETAIL 두 구조인 경우:
- listing 실패 ≠ detail 부재
- known detail ID가 있으면 detail 직접 접근
- listing이 JS-rendered여도 detail endpoint가 server-rendered일 수 있음

**경주 실증 케이스 (regression):**
- gyeongju.go.kr 권역별 관광지 listing (mnu_uid=2291~2296) = JS-rendered
- 그러나 detail (area_uid, cmd=2) = HTTP accessible
- 139건이 listing을 통하지 않고 direct detail access로 content 확보

---

## PRINCIPLE 10 — MULTI-FIELD ENRICHMENT

identity가 MATCH_VERIFIED이면 description만 가져오고 종료하지 않는다.

**가능한 모든 traveler-useful missing field 동시 수집:**

description, image, address, coordinates, phone, opening_hours, closed_day, admission, parking, reservation, official_url, category/subcategory evidence, heritage designation, menu/representative food, event facts, course/experience relation

기존 좋은 값은 덮어쓰지 않음. provenance/as_of 유지.

---

## PRINCIPLE 11 — SOURCE SCOPE AUDIT (신규 도시 수집 전)

source별로 어떤 관광자원이 포함/누락되는지 사전 확인.

**audit 항목:**
- attraction, nature, restaurant, heritage, museum, culture, market, trail, park, modern tourism, accommodation, experience, event

**핵심 질문:**
- 이 API에 도시의 대표 관광지가 실제로 들어 있는가?
- 관광 무관 시설(회사/기관/복지 등)이 섞여 있는가?
- 대표 관광자원이 누락된 source를 city SSOT처럼 사용하지 않는다

---

## PRINCIPLE 12 — SOURCE PROVENANCE 필수 필드

가능한 한 normalized record에 다음 provenance 개념 유지:

```json
{
  "source_type": "kto_tourapi | visitbusan | gyeongju_official | ...",
  "source_record_id": "KorService2:XXXXXX:ko",
  "source_category_original": "KTO contentTypeId 또는 source taxonomy label",
  "source_content_type": "json | html | api",
  "source_url": "...",
  "source_fetched_at": "2026-08-09",
  "normalized_category": "attraction | nature | ...",
  "tourism_relevance_status": "CONFIRMED | REJECTED | USER_REVIEW_REQUIRED",
  "tourism_relevance_evidence": "...",
  "identity_status": "MATCH_VERIFIED | AMBIGUOUS | NOT_FOUND",
  "service_readiness_status": "READY | HOLD | EXCLUDED",
  "hold_reason": "..."
}
```

원천 분류와 GoKoreaMate 분류를 혼용하지 않는다.

**중요**: image gap 파일의 `known_source`는 이미지 해소 대상 source를 의미할 수 있으며, 원본 데이터 출처와 다를 수 있음. 원본 출처는 `provenance_summary.primary_source`로 확인.

---

## PRINCIPLE 13 — AI ITINERARY READY 조건

어떤 source에서 왔든 AI itinerary candidate는 다음 조건 전부 충족 시에만 READY:

1. verified coordinates (source 확인 좌표)
2. tourism_relevance = CONFIRMED
3. identity verified
4. service-useful category
5. minimum content readiness (description 또는 공식 URL)

---

## 다음 도시 시작 전 PRE-FLIGHT (STEP 1~10)

서울·제주 및 이후 모든 도시에서 다음 절차 필수:

| STEP | 내용 | 비고 |
|---|---|---|
| 1 | 공식/공공 source inventory | 도시별 공식 관광사이트, API, 공공데이터 목록화 |
| 2 | source별 category/coverage sample | 대표 관광자원 10~20건 sample fetch |
| 3 | 도시 대표 관광자원 benchmark list vs source 비교 | 유명 명소가 실제로 있는지 확인 |
| 4 | false-positive 의심 sample 생성 | 회사/기관/시설 유형 확인 |
| 5 | false-negative 의심 sample 생성 | 누락된 유명 명소 확인 |
| 6 | **USER REVIEW** (GROUP A/B/C) | 사용자 승인 필수 |
| 7 | 사용자 승인 후 bulk collection | STEP 6 미완료 시 진행 금지 |
| 8 | targeted detail/enrichment | known ID → targeted fetch 우선 |
| 9 | service readiness QA | tourism_relevance gate 통과 여부 확인 |
| 10 | final handoff | |

**USER REVIEW 대상 (STEP 6):**
- GROUP A: 관광성 의심 candidate 10~30건
- GROUP B: primary source 누락된 핵심 관광자원 10~30건
- GROUP C: category/entity type 애매한 candidate 10~30건

명확하게 관광성이 확인된 일반 record는 사용자 확인 없이 정상 수집 가능.

---

## False-Positive 분류 코드

| 코드 | 설명 |
|---|---|
| FP_SOURCE_SCOPE_TOO_BROAD | source category가 관광 외 시설을 포함 |
| FP_SOURCE_CATEGORY_MISINTERPRETED | source의 원본 category가 잘못 해석됨 |
| FP_NORMALIZATION_OVERPROMOTION | 정규화 과정에서 attraction으로 과승격 |
| FP_NO_TOURISM_RELEVANCE_GATE | 관광 적합성 검증 gate 없이 READY 처리 |
| FP_ENTITY_TYPE_MISMATCH | 관광지가 아닌 entity (기업, 기관, 시설) |
| FP_PARENT_CHILD_CONFUSION | 상위 관광지의 운영 entity/하위 시설 |
| FP_COMMERCIAL_OR_ORGANIZATION_FALSE_POSITIVE | 일반 기업/법인 명칭으로 등재 |
| FP_OTHER | 기타 |

---

## Regression Fixtures — 기대 동작

### BUSAN FALSE-POSITIVE TEST

**fixture**: busan-user-excluded-14-v1.jsonl 14건 (전건 KTO 출처)

**기대:**
- tourism_relevance gate 없이 자동 READY = 0건
- 주식회사* entity type → USER_REVIEW_REQUIRED 또는 TOURISM_RELEVANCE_REJECTED
- KTO contentTypeId=12 등재만으로 READY = 허용하지 않음

### GYEONGJU FALSE-NEGATIVE TEST

**fixture**: gyeongju-description-gap-200-v4r3.jsonl 기준

**대표 케이스:**
- 경주 석빙고 (KTO contentId=126204) — listing 실패 시 targeted fetch로 구제
- 경주 포석정지 (KTO contentId=126208) — listing 실패 시 targeted fetch로 구제
- 경주역사유적지구 (KTO contentId=971032) — primary source 누락 시 SOURCE_ABSENCE ≠ EXCLUDE

**기대:**
- primary source listing 실패만으로 자동 EXCLUDE = 0건
- known KTO contentId 보유 record → targeted detail fetch 단계 도달 필수
- OFFICIAL_DETAIL_NOT_FOUND는 모든 cascade 시도 후에만 적용

### SILENT FAILURE TEST

**fixture**: gyeongju.go.kr mnu=2292 srchKwd 파라미터 사용 테스트

**기대:**
- `srchKwd` 파라미터 사용 시 area_uid 0건 반환 → `EMPTY_RESULT` 기록
- `usable_result=true` 처리 금지
- `actual_signal = EMPTY_RESULT` 명시

### TARGETED FETCH RULE TEST

**fixture**: 59건 KTO12 contentId 보유 record

**기대:**
- 전건 detailCommon2 targeted fetch 시도 → 59/59 KTO_DETAIL_FULL
- 전체 TourAPI 재수집 없이 정확히 59개 detail fetch
- `SEARCH_SUCCESS=true`는 rc=0000 + items 존재 + contentId 일치 시에만

---

## QA 체크리스트 (공통)

### BUSAN 검증
- [ ] excluded14 provenance resolved = 14/14
- [ ] source 분포 합계 = 14
- [ ] tourism relevance gate 없이 READY된 사례 = 0
- [ ] source_category_original 추적 (KTO contentTypeId)

### GYEONGJU 검증
- [ ] initial gap = 200
- [ ] user_excluded = 2
- [ ] gyeongju official rescue = 139
- [ ] KTO targeted rescue = 59
- [ ] unresolved = 0
- [ ] known KTO contentId 활용 규칙 반영 = YES
- [ ] SOURCE ABSENCE ≠ EXCLUSION 규칙 반영 = YES

### 공통 규칙
- [ ] HTTP200 silent failure guard 반영
- [ ] listing/detail 분리 반영
- [ ] targeted fetch priority 반영
- [ ] tourism relevance gate 반영
- [ ] user review escalation triggers 반영
- [ ] source scope audit 반영
- [ ] false-positive regression 반영
- [ ] false-negative regression 반영
- [ ] AI itinerary coordinate rule 유지
- [ ] existing good fields overwrite 금지 유지

### PHONE / GEOMETRY SEMANTICS (PRINCIPLE 14~17)
- [ ] phone_source_state 4종 분류 적용 (PRESENT/SOURCE_EMPTY/SOURCE_PLACEHOLDER/SOURCE_MALFORMED)
- [ ] phone_semantic_status 4종 분류 적용 (DIRECT_PHONE_PRESENT/NOT_EXPECTED/NEEDS_VERIFICATION/UNKNOWN)
- [ ] phone 부재 → SEARCHABLE/SELECT/SAVE 자동 패널티 = 0
- [ ] geometry_type 7종 분류 적용 (coord missing entity)
- [ ] 좌표 자체 생성/추정 = 0 (SOURCE ANCHOR ONLY)
- [ ] coord missing → AI=REVIEW_REQUIRED (영구 NO 없음)
- [ ] NEEDS_VERIFICATION (phone) = targeted 대상만 (전체 no-value 아님)

### SAFETY
- [ ] master change = 0
- [ ] Production change = 0
- [ ] DB/migration = 0
- [ ] src/functions/UI = 0
- [ ] secret = 0

---

---

## PRINCIPLE 14 — PHONE SOURCE STATE 2-LAYER SEMANTICS

> **상세 정의:** `docs/data-collection/multicity-phone-semantics-and-geometry-policy-v1.md` RULE-A~C

전화번호 missing을 단일 boolean으로 처리하지 않는다.
두 레이어를 분리한다:

- `phone_source_state`: raw source fact
  - `PRESENT` — 실제 전화번호 (숫자 포함)
  - `SOURCE_EMPTY` — null 또는 빈 문자열
  - `SOURCE_PLACEHOLDER` — 알려진 비-값 placeholder (`"--"`, `"-"`, `"N/A"`, `"없음"` 등)
  - `SOURCE_MALFORMED` — 문자는 있으나 숫자 없음 (`"."` 등)

- `phone_semantic_status`: entity 성격 기반 의미
  - `DIRECT_PHONE_PRESENT` — phone 있음
  - `NOT_EXPECTED` — 루트/자연지형 등 직통 번호 없음이 정상
  - `NEEDS_VERIFICATION` — 박물관/체험관 등 번호 존재 가능성 높음
  - `UNKNOWN` — title 기준으로 판단 불가

**전화번호 부재는 SEARCHABLE / EXPLORE_ELIGIBLE / AI_ITINERARY / USER_CAN_SELECT / USER_CAN_SAVE에 자동 패널티 없음.**

Jeju 실증: c1 1,341건 중 phone no-value 348건, SEARCHABLE 제한 0건.

---

## PRINCIPLE 15 — GEOMETRY TAXONOMY (좌표 missing entity)

> **상세 정의:** `docs/data-collection/multicity-phone-semantics-and-geometry-policy-v1.md` RULE-D~F

좌표가 없거나 무효(`0.0/0.0` API placeholder 포함)인 entity의 공간 유형을 분류한다.

**geometry_type 7종:** `POINT` / `AREA` / `LINEAR_ROUTE` / `ROUTE_SEGMENT` / `ROUTE_COLLECTION` / `MULTI_SITE` / `UNKNOWN`

**navigation_status 4종:**
- `READY` — 유효 source 좌표 존재
- `NEEDS_SOURCE_ANCHOR` — AREA/LINEAR_ROUTE의 공식 대표 anchor 필요
- `NEEDS_SOURCE_SEGMENTATION` — ROUTE 구간 구조 공식 소스 확인 필요
- `NEEDS_SOURCE_VERIFICATION` — POINT/UNKNOWN의 정확한 좌표 공식 소스 확인 필요

**navigation 불가 ≠ 관광 가치 손실 ≠ SEARCHABLE 제한**

Jeju 실증: coord missing 32건 전체 SEARCHABLE=YES.

---

## PRINCIPLE 16 — SOURCE ANCHOR ONLY

> **상세 정의:** `docs/data-collection/multicity-phone-semantics-and-geometry-policy-v1.md` RULE-E

GoKoreaMate (포함 Claude)는 좌표를 자체 생성하거나 추정하지 않는다.

**금지:** 임의 대표 좌표 지정, 주소 중심 추정, 인근 시설 좌표 대체, AI 지식으로 생성, 지도 화면 scraping canonical 사용

**허용:** 공식 API, 공공데이터, 약관이 허용하는 licensed geocoding API가 직접 제공한 값

---

## PRINCIPLE 17 — AI_ITINERARY READINESS ≠ AI=NO PERMANENT

> **상세 정의:** `docs/data-collection/multicity-phone-semantics-and-geometry-policy-v1.md` RULE-G

navigation 불가 또는 좌표 missing entity에 대해 `AI_ITINERARY=NO`로 영구 배제하지 않는다.

`AI_ITINERARY=REVIEW_REQUIRED` 또는 `CONDITIONAL`로 유지하여 source anchor 보완 후 재평가 가능하도록 한다.

```
USER_PICK_ABILITY ≥ AI_AUTO_SCHEDULING_ABILITY
```

---

## 관련 문서

- `docs/automation/data-source-priority.md` — source 우선순위 상세
- `docs/automation/image-curation-rules.md` — 이미지 선정 규칙
- `docs/data-collection/multicity-regression-fixtures-v1.json` — 회귀 테스트 fixture 데이터
- `docs/data-collection/multicity-eligibility-regression-fixtures-v1.json` — eligibility + PSG fixture (PSG_001~PSG_008)
- `docs/data-collection/multicity-phone-semantics-and-geometry-policy-v1.md` — 전화번호/좌표 semantics 전체 정의 (RULE-A~G)
- `docs/data-collection/busan-gyeongju-gap-fill-main-handoff-final.md` — 부산·경주 최종 결과

서울·제주 및 이후 모든 도시 데이터 수집 시작 전 이 문서를 반드시 읽는다.
