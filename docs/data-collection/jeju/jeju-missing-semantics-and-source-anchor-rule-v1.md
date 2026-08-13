# Jeju Place Missing Semantics & Source Anchor Rule v1

**Task**: TASK-JEJU-MISSING-SEMANTICS-AND-SOURCE-ANCHOR-RULE-FINALIZE-V1  
**Branch**: data/jeju-collection-v2  
**HEAD**: ce042bd4c5520355e40bb9ad831466d407cef8e9  
**Common Policy Commit**: dc6f9be563983d369f400e4e8b0eea139f82da7c  
**Generated**: 2026-08-13  
**Status**: PASS_WITH_WARN (see jeju-missing-semantics-qa-v1.json)

---

## §1. 목적

제주 VisitJeju c1 관광지 1,341건에 대해 실제 데이터에서 검증된
전화번호·좌표 missing 의미론 규칙과 Source Anchor 원칙을 확정한다.

이 문서는 향후 multicity common policy 승격 후보 규칙의 근거가 된다.

---

## §2. 핵심 수치 (실제 파일 재계산값)

| 항목 | 수치 | 비고 |
|---|---|---|
| c1 canonical total | **1,341** | |
| PHONE PRESENT | 993 (74.1%) | |
| PHONE SOURCE_EMPTY | 145 (10.8%) | phoneno null 또는 "" |
| PHONE SOURCE_PLACEHOLDER | 202 (15.1%) | phoneno = "--" (VisitJeju 관행) |
| PHONE SOURCE_MALFORMED | 1 (0.1%) | phoneno = "." (평화통일 불사리탑) — 신규 발견 |
| **Phone no-value total** | **348** | (이전 보고 347 → +1 SOURCE_MALFORMED) |
| COORD VALID | 1,309 (97.6%) | |
| COORD SOURCE_EMPTY | 30 (2.2%) | lat/lon null |
| COORD INVALID_SOURCE_ZERO | 2 (0.1%) | lat=0.0/lon=0.0 (API placeholder) |
| **Coord missing/invalid total** | **32** | |
| Both phone+coord missing | 12 | |
| Either gap | 368 | |

---

## §3. Phone 분류 체계

### 3.1 Source 상태 (phone_source_state)

원본 데이터에서 실제로 무엇을 제공했는지만 결정론적으로 분류한다.

| 값 | 정의 | 예시 |
|---|---|---|
| `PRESENT` | 실제 전화번호 (최소 1개의 숫자 포함) | "064-793-6006" |
| `SOURCE_EMPTY` | phoneno null 또는 빈 문자열 | null, "" |
| `SOURCE_PLACEHOLDER` | 알려진 비-값 플레이스홀더 | "--", "-", "N/A", "없음" |
| `SOURCE_MALFORMED` | 문자는 있으나 숫자 없음 | "." |

**중요**: Raw 원본 값은 절대 수정하지 않는다. semantic layer에서만 의미를 부여한다.

### 3.2 Semantic 상태 (phone_semantic_status)

no-value 엔티티의 entity 성격에 따른 전화번호 의미 분류.

| 값 | 정의 | 예시 entity 타입 |
|---|---|---|
| `DIRECT_PHONE_PRESENT` | phone_source_state = PRESENT (직통 번호 있음) | — |
| `NOT_EXPECTED` | 해당 entity 유형에서 직통 번호 없음이 정상 | 오름, 해변, 올레길, 산책로, 해안도로 |
| `NEEDS_VERIFICATION` | 직통 번호가 있을 가능성이 높은 entity | 박물관, 미술관, 체험관, 농장 |
| `UNKNOWN` | 현재 저장된 데이터만으로 판단 불가 | 이름만으로 유형 불명확한 entity |

#### NOT_EXPECTED 판단 기준 (결정론적 키워드)

title에 다음 중 하나 포함 시 NOT_EXPECTED:
- **루트/경로**: 올레, 둘레길, 자전거길, 탐방로, 탐방길, 해안도로, 숲길, 갈맷길, 트레일, 환상자전거, 환상순환, 산책로
- **자연지형**: 오름, 해변, 해수욕장, 곶자왈, 폭포, 현무암, 용암, 하천, 계곡, 지형, 지대, 암석, 암반, 연안, 갯벌, 봉우리

또는 alltag에 다음 포함 시: 올레, 산책로, 자전거, 둘레길, 탐방로, 숲길, 갈맷길

#### NEEDS_VERIFICATION 판단 기준 (결정론적 키워드)

title에 다음 중 하나 포함 시 NEEDS_VERIFICATION:
박물관, 미술관, 아쿠아리움, 수족관, 전시관, 기념관, 체험관, 과학관, 역사관, 자연사관, 전시장, 민속관, 생태체험관, 식물원, 동물원, 수목원, 아쿠아플라넷, 농장, 목장, 낚시터, 승마장, 다이빙, 스쿠버, 서핑, 테마파크, 리조트, 골프, 경마

### 3.3 Phone Semantic 분포 (no-value 348건)

| 그룹 | TOTAL | NOT_EXPECTED | UNKNOWN | NEEDS_VERIFICATION |
|---|---|---|---|---|
| 자연지형/오름/해변 | 71 | 64 | 7 | 0 |
| 마을/거리/코스/집합체 | 67 | 24 | 42 | 1 |
| 박물관/시설/업체 | 4 | 0 | 0 | 4 |
| 기타/불명확 | 206 | 16 | 189 | 1 |
| **합계** | **348** | **104** | **238** | **6** |

**Phone verification target = 6건** (NEEDS_VERIFICATION만, 전체 348건 중 소수)

---

## §4. Coordinate 분류 체계

### 4.1 Source 상태 (coordinate_source_state)

| 값 | 정의 |
|---|---|
| `VALID_SOURCE_COORDINATE` | lat/lon이 제주 유효 범위 내 [33.0–34.5N, 126.0–127.0E] |
| `SOURCE_EMPTY` | lat 또는 lon이 null/missing |
| `INVALID_SOURCE_ZERO` | lat=0.0 and lon=0.0 (VisitJeju API의 null 플레이스홀더) |
| `INVALID_COORDINATE` | 값은 있으나 유효 범위 외 |

**중요**: `INVALID_SOURCE_ZERO`는 실제 위치 0.0/0.0이 아니다. VisitJeju API가 좌표 미제공 시 반환하는 플레이스홀더다.

### 4.2 Geometry 유형 (geometry_type)

| 값 | 정의 | 판단 키워드/규칙 |
|---|---|---|
| `POINT` | 특정 지점 entity (시설, 박물관, 자연 지점) | 박물관, 미술관, 오름, 폭포, 굴, 동굴, 노천탕, 탑, 전시관 등 + phone PRESENT fallback |
| `AREA` | 면적형 관광 destination | 거리, 시장, 마을, 공원, 해변, 파크, 포레스트, 숲, 가든, 라바, 일대, 지대 등 |
| `LINEAR_ROUTE` | 선형 관광지 | 올레, 둘레길, 자전거길, 탐방로, 해안도로, 산책로, 또는 title이 "길"로 종결 |
| `ROUTE_SEGMENT` | 특정 코스/구간 | "X코스", "X구간" 패턴 |
| `ROUTE_COLLECTION` | 복수 구간 상위 entity | 환상자전거길, 환상순환길 |
| `MULTI_SITE` | 복수 물리 지점 포함 entity | (본 데이터셋에서 관찰되지 않음) |
| `UNKNOWN` | 사용 가능한 데이터로 분류 불가 | 영아리, 안덕면사무소 수국길 |

### 4.3 Navigation 상태 (navigation_status)

| 값 | 의미 | 해당 geometry |
|---|---|---|
| `READY` | 유효한 source 좌표 존재 → AI 라우팅 가능 | 모든 유형 (coord valid 시) |
| `NEEDS_SOURCE_ANCHOR` | AREA/LINEAR_ROUTE에 공식 대표 anchor 좌표 필요 | AREA, LINEAR_ROUTE, MULTI_SITE |
| `NEEDS_SOURCE_SEGMENTATION` | 루트 구간 구조 및 anchor를 공식 소스에서 확인 필요 | ROUTE_SEGMENT, ROUTE_COLLECTION |
| `NEEDS_SOURCE_VERIFICATION` | POINT/UNKNOWN entity의 정확한 좌표를 공식 소스에서 확인 필요 | POINT, UNKNOWN |

### 4.4 Coordinate 32건 분류 결과

| geometry_type | 건수 | navigation_status | 건수 |
|---|---|---|---|
| POINT | 17 | NEEDS_SOURCE_VERIFICATION | 19 |
| AREA | 7 | NEEDS_SOURCE_ANCHOR | 12 |
| LINEAR_ROUTE | 5 | NEEDS_SOURCE_SEGMENTATION | 1 |
| ROUTE_COLLECTION | 1 | | |
| UNKNOWN | 2 | | |
| **합계** | **32** | **합계** | **32** |

### 4.5 Coord 32건 전수 목록

| # | title | geometry | nav_status | coord_src | phone_src | SRCH | EXPL | AI |
|---|---|---|---|---|---|---|---|---|
| 1 | 제주 카약올레 | LINEAR_ROUTE | NEEDS_SOURCE_ANCHOR | INVALID_SOURCE_ZERO | PRESENT | YES | CONDITIONAL | CONDITIONAL |
| 2 | 병악현무암지대 | POINT | NEEDS_SOURCE_VERIFICATION | INVALID_SOURCE_ZERO | SOURCE_PLACEHOLDER | YES | CONDITIONAL | REVIEW_REQUIRED |
| 3 | 신산신양해안도로 | LINEAR_ROUTE | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 4 | 제주환상자전거길 | ROUTE_COLLECTION | NEEDS_SOURCE_SEGMENTATION | SOURCE_EMPTY | SOURCE_EMPTY | YES | REVIEW_REQUIRED | REVIEW_REQUIRED |
| 5 | 제주친구 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 6 | 케이제주해양사업단 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 7 | 신흥리 동백 & 향나무길 | LINEAR_ROUTE | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 8 | 영등할망신화공원 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 9 | 헌마공신김만일기념관 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 10 | 영아리 | UNKNOWN | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | SOURCE_EMPTY | YES | REVIEW_REQUIRED | REVIEW_REQUIRED |
| 11 | 진지동굴 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | SOURCE_EMPTY | YES | REVIEW_REQUIRED | REVIEW_REQUIRED |
| 12 | 종달고망난돌쉼터 | LINEAR_ROUTE | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 13 | 성안올레 | LINEAR_ROUTE | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | SOURCE_EMPTY | YES | REVIEW_REQUIRED | REVIEW_REQUIRED |
| 14 | 아이바가든 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 15 | 김정문알로에 알로에숲 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 16 | 오투힐 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 17 | 그림휴가 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 18 | 영천동 해바라기축제 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 19 | 국수문화거리 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 20 | 중앙로 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 21 | 쏙인제주 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 22 | 자연인제주족욕 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 23 | 마리에 인 제주 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 24 | 파호이호이 라바필드 파크 제주 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 25 | 안덕면사무소 수국길 | UNKNOWN | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 26 | 곽지 과물노천탕 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | SOURCE_EMPTY | YES | CONDITIONAL | REVIEW_REQUIRED |
| 27 | 색달포레스트 | AREA | NEEDS_SOURCE_ANCHOR | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 28 | 노틸러스다이브제주 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | CONDITIONAL |
| 29 | 피크닉인제주 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 30 | 스카이 다이어리 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 31 | 드르쿰다 in 성산 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | CONDITIONAL | REVIEW_REQUIRED |
| 32 | 애월 몽달 | POINT | NEEDS_SOURCE_VERIFICATION | SOURCE_EMPTY | PRESENT | YES | REVIEW_REQUIRED | REVIEW_REQUIRED |

---

## §5. Source Anchor 최상위 규칙

### RULE-E: Source-Provided Anchor Only

GoKoreaMate (포함 Claude)가 좌표를 자체 생성하거나 추정하는 것을 금지한다.

**금지 행위:**
- 임의 대표 좌표 지정
- 주소 중심 추정
- 인근 시설 좌표 대체
- route 시작점 임의 선택
- AI 지식으로 좌표 생성
- 지도 웹 화면 scraping 후 canonical 사용

**허용 source:**
1. 지역 공식 관광 API / 공공데이터 (VisitJeju API, KTO API)
2. 지자체 / 관광공사 / 공식 운영기관 제공 데이터
3. 저장·재사용 권리가 확인된 공공 API
4. 정식 지도/geocoding API (약관 준수 필수)
5. 공식 route/course 데이터의 start/end/segment/representative point

**적용 예:**
- 제주환상자전거길 (ROUTE_COLLECTION): KTO API 또는 제주도 공식 자전거 route 데이터에서 segment 구조 확인
- 병악현무암지대 (POINT + 0.0/0.0): KTO detailCommon2 또는 VisitJeju 공식 페이지에서 실제 좌표 확인
- 국수문화거리 (AREA): 제주관광공사/VisitJeju 공식 source에서 anchor 확인

---

## §6. Eligibility 독립성 검증 결과

| 항목 | 결과 | 건수 |
|---|---|---|
| Phone NOT_EXPECTED/UNKNOWN → SEARCHABLE 제한 | **없음** | 0 |
| Phone NOT_EXPECTED/UNKNOWN → USER_CAN_SELECT 제한 | **없음** | 0 |
| Coord AREA/ROUTE → SEARCHABLE 손실 | **없음** | 0 |
| AI_ITINERARY=NO (영구 제외) | **없음** | 0 |

**32건 전체 SEARCHABLE=YES ✓**

phone/coord missing이 SEARCHABLE에 영향 주지 않음. 현행 eligibility 정상.

### 4대 독립 원칙 (실제 데이터에서 확인)

```
TOURISM_VALUE ≠ DATA_COMPLETENESS
DATA_COMPLETENESS ≠ NAVIGATION_READINESS  
NAVIGATION_READINESS ≠ AI_AUTO_SCHEDULING_READINESS
USER_PICK_ABILITY ≥ AI_AUTO_SCHEDULING_ABILITY
```

coord missing → EXPLORE=CONDITIONAL (지도 표시 제한, 정상)
coord missing → AI=REVIEW_REQUIRED (AI 일정 자동 추가 보수적, 정상)
coord missing ≠ SEARCHABLE=NO (검색/저장 가능성 유지, 정상)

---

## §7. Rule 판정 및 Common Policy 승격 후보

| Rule | 제목 | 현행 정책 | 판정 | Common 승격 후보 |
|---|---|---|---|---|
| RULE-A | Placeholder normalization | 암묵적 | NEW_COMMON_RULE_CANDIDATE | ✅ |
| RULE-B | Missing semantics 2-layer | 미정의 | NEW_COMMON_RULE_CANDIDATE | ✅ |
| RULE-C | Phone independence | 암묵적 (보장됨) | ALREADY_COVERED + 명문화 필요 | ✅ |
| RULE-D | Geometry separation | 미정의 | NEW_COMMON_RULE_CANDIDATE | ✅ |
| RULE-E | Source-provided anchor only | 암묵적 | NEW_COMMON_RULE_CANDIDATE | ✅ |
| RULE-F | Navigation readiness independence | EXPLORE=CONDITIONAL 암묵적 | ALREADY_COVERED + 명문화 필요 | ✅ |
| RULE-G | AI readiness independence | AI=REVIEW_REQUIRED 암묵적 | ALREADY_COVERED + 명문화 필요 | ✅ |

**COMMON_POLICY_IMPROVEMENT_CANDIDATE = YES**

### Common 승격 시 제안 규칙 문구

**RULE-A (Placeholder normalization):**
> `phone_source_state`에서 `"--"`, `"-"`, `"N/A"`, `"없음"`, 단일 구두점 등을 `SOURCE_PLACEHOLDER` 또는 `SOURCE_MALFORMED`로 분류하며, 이를 PRESENT 또는 EMPTY와 구분한다. Raw 원본 값은 수정하지 않는다.

**RULE-B (Missing semantics 2-layer):**
> Phone missing은 `phone_source_state` (source fact)와 `phone_semantic_status` (entity 성격 기반 의미)를 별도 필드로 분리한다. `NOT_EXPECTED`/`UNKNOWN`/`NEEDS_VERIFICATION` 구분은 entity 유형 키워드 기준으로 결정론적으로 적용한다.

**RULE-C (Phone independence):**
> 전화번호 부재 (`SOURCE_EMPTY`, `SOURCE_PLACEHOLDER`, `SOURCE_MALFORMED`)는 SEARCHABLE, EXPLORE_ELIGIBLE, USER_CAN_SELECT, USER_CAN_SAVE에 자동 패널티를 부여하지 않는다.

**RULE-D (Geometry separation):**
> 관광 entity의 공간 유형을 POINT / AREA / LINEAR_ROUTE / ROUTE_SEGMENT / ROUTE_COLLECTION / MULTI_SITE / UNKNOWN으로 분류한다. 이 분류는 navigation anchor 전략과 source verification 우선순위 결정에 사용된다.

**RULE-E (Source-provided anchor only):**
> GoKoreaMate는 좌표를 자체 생성하거나 추정하지 않는다. 좌표/anchor는 공식 API, 공공데이터, 또는 약관이 허용하는 licensed geocoding API가 직접 제공한 값만 사용한다. 지도 웹 화면 scraping 값을 canonical source로 사용하지 않는다.

**RULE-F (Navigation readiness independence):**
> navigation 불가(`NEEDS_SOURCE_ANCHOR`, `NEEDS_SOURCE_SEGMENTATION`, `NEEDS_SOURCE_VERIFICATION`) 상태는 관광 가치와 SEARCHABLE/SELECT/SAVE 가능성에 영향을 주지 않는다. source anchor 보완 후 재평가 가능하도록 상태를 REVIEW_REQUIRED로 유지하며 AI=NO로 영구 배제하지 않는다.

**RULE-G (AI readiness independence):**
> AI_ITINERARY_ELIGIBLE=REVIEW_REQUIRED 또는 CONDITIONAL은 USER_CAN_SELECT, USER_CAN_SAVE와 독립이다. User Pick 능력은 AI 자동 일정 가능성보다 크거나 같다 (User Pick ≥ AI Auto).

---

## §8. 외부 Source Verification 대상

### Phone verification targets: 6건

NEEDS_VERIFICATION으로 분류된 entity만 대상. 347/348건 전체를 KTO 보강 target으로 만들지 않는다.

대표 우선순위:
- KTO API (areaCode=39, contentTypeId=12 or 14)
- 제주관광공사 공식 페이지
- VisitJeju 공식 상세 페이지

### Coord verification targets: 32건 (ALL)

nav_status에 따라 검증 방식이 다름:
- NEEDS_SOURCE_VERIFICATION (19건): KTO detailCommon2 또는 licensed geocoding API
- NEEDS_SOURCE_ANCHOR (12건): VisitJeju 공식 또는 제주관광공사 area anchor
- NEEDS_SOURCE_SEGMENTATION (1건): 공식 route operator source (제주환상자전거길)

---

## §9. QA 요약

| 항목 | 값 |
|---|---|
| DETERMINISM_STATUS | CONFIRMED_RUN1_EQ_RUN2 |
| QA_RESULT | PASS_WITH_WARN |
| RAW_CHANGES | 0 |
| SOURCE_FACT_CHANGES | 0 |
| API_CALLS | 0 |
| WEB_COLLECTION | 0 |
| KTO_CALLS | 0 |
| MAP_API_CALLS | 0 |
| SECRET_LEAK | 0 |

### Warnings

**WARN-001**: phone_no_value = 348 (이전 347). +1 SOURCE_MALFORMED — 평화통일 불사리탑(phoneno="."). 회귀 아님, 신규 발견.

**WARN-002**: geometry UNKNOWN = 2건 (영아리, 안덕면사무소 수국길). title+tags 근거 부족. UNKNOWN이 적절한 분류.

**WARN-003**: phone_semantic UNKNOWN = 238건 (68.4%). VisitJeju c1 데이터의 다양한 entity 유형에서 발생하는 정상적 불확실성. 규칙 오류 아님.

---

## §10. 다음 Task 권고

| 우선순위 | Task | 내용 |
|---|---|---|
| 1 | TASK-JEJU-PLACE-SOURCE-VERIFICATION-TARGETED-V1 (신규) | coord 32건 nav_status별 분리 처리. NEEDS_SOURCE_VERIFICATION(19건, KTO targeted) 우선. phone NEEDS_VERIFICATION(6건) 병행. |
| 2 | TASK-COMMON-POLICY-PHONE-SEMANTICS-AND-GEOMETRY-V1 (신규) | RULE-A~G를 data/multicity-common policy 문서에 추가. 경주 coord backfill 전에 정책 확정 권장. |
| 3 | TASK-JEJU-PLACE-FINAL-QA-V1 | Source verification 결과 반영 후 final eligibility QA. |
| 4 | TASK-JEJU-FOOD-COLLECTION-V1 | VisitJeju c4 음식점 1,870건 수집. |

**주의**: KTO 전체 gap-fill (347건 phone + 32건 coord 일괄) 방식은 권고하지 않는다. phone NEEDS_VERIFICATION(6건)과 coord NEEDS_SOURCE_VERIFICATION(19건)만 KTO 타겟으로 우선 처리한다.
