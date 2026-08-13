# GoKoreaMate — Multicity Phone Semantics & Geometry Policy v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 생성일 | 2026-08-13 |
| 근거 TASK | TASK-COMMON-POLICY-PHONE-SEMANTICS-AND-GEOMETRY-V1 |
| 증거 기반 | TASK-JEJU-MISSING-SEMANTICS-AND-SOURCE-ANCHOR-RULE-FINALIZE-V1 (commit 854740d, data/jeju-collection-v2) |
| 적용 대상 | 부산·경주·서울·제주·이후 전국 모든 도시 |
| 정책 SSOT | data/multicity-common (이 파일) |
| DB 변경 | 0 |

---

## 도입 — 왜 이 정책이 필요한가

제주 VisitJeju c1 관광지 1,341건의 전화번호·좌표 missing 데이터를 전수 분류한 결과,
다음의 공통 규칙이 실증적으로 확인되었다:

1. **Placeholder ≠ Empty ≠ Malformed** — 소스 값이 다르더라도 단순 "없음"으로 뭉뚱그리면 소스 품질 정보가 사라진다.
2. **Source fact와 semantic 의미는 별도 레이어** — "소스가 뭘 줬는가"와 "그게 무슨 의미인가"는 독립 필드로 기록해야 한다.
3. **좌표 없음 ≠ 관광 가치 손실** — AREA·ROUTE 등은 단일 좌표로 표현할 수 없는 장소이며, 이는 데이터 문제가 아니라 entity 성격이다.
4. **AI=NO ≠ 영구 제외** — source anchor 확보 후 재평가 가능하도록 상태를 유지해야 한다.

이 정책은 RULE-A~G 7개 규칙을 multicity common SSOT로 공식화한다.

---

## PART 1 — 전화번호 Source 상태 분류 (RULE-A + RULE-B)

### RULE-A: Placeholder Normalization

`phone_source_state`에서 비-값 플레이스홀더를 `PRESENT` 및 `SOURCE_EMPTY`와 명확히 구분한다.
Raw 원본 값은 절대 수정하지 않는다. semantic layer에서만 의미를 부여한다.

#### phone_source_state 값 정의

| 값 | 정의 | 예시 |
|---|---|---|
| `PRESENT` | 실제 전화번호 (최소 1개의 숫자 포함) | "064-793-6006", "02-1234-5678" |
| `SOURCE_EMPTY` | phoneno null 또는 빈 문자열 ("") | null, "" |
| `SOURCE_PLACEHOLDER` | 알려진 비-값 플레이스홀더 | "--", "—", "–", "-", "N/A", "n/a", "없음", "미등록", "null", "(없음)" |
| `SOURCE_MALFORMED` | 문자는 있으나 숫자가 하나도 없는 값 | ".", "*", "문의", "상기 참조" |

**SOURCE_PLACEHOLDER 인식 집합 (예시, 도시·API별 확장 가능):**
```
"--", "—", "–", "-", "N/A", "n/a", "없음", "미등록",
"N/a", "NA", "na", "null", "NULL", "(없음)",
"* 화번호", "* 화"
```

**VisitJeju 관행 (확인됨):** `phoneno = "--"` = 202건 = `SOURCE_PLACEHOLDER`
(단순 null이 아닌 API의 명시적 비-값 전달 방식임)

**판단 흐름:**
```
phoneno == null or "" → SOURCE_EMPTY
phoneno in PLACEHOLDER_SET → SOURCE_PLACEHOLDER
phoneno에 숫자가 없음 → SOURCE_MALFORMED
그 외 → PRESENT
```

---

### RULE-B: Missing Semantics 2-Layer Separation

Phone missing은 두 필드를 별도로 기록한다.

#### phone_semantic_status 값 정의

no-value 엔티티(`SOURCE_EMPTY` / `SOURCE_PLACEHOLDER` / `SOURCE_MALFORMED`)에 대해
entity 성격을 기준으로 결정론적으로 분류한다.

| 값 | 정의 | 대상 entity 타입 예시 |
|---|---|---|
| `DIRECT_PHONE_PRESENT` | phone_source_state = PRESENT (직통 번호 있음) | — (no-value 아님) |
| `NOT_EXPECTED` | 해당 entity 유형에서 직통 번호 없음이 정상 | 오름, 해변, 올레길, 산책로, 해안도로, 자연지형 |
| `NEEDS_VERIFICATION` | 직통 번호가 있을 가능성이 높은 entity | 박물관, 미술관, 체험관, 농장, 다이빙샵 |
| `UNKNOWN` | 현재 저장된 데이터만으로 판단 불가 | 이름만으로 유형 불명확한 entity |

#### NOT_EXPECTED 판단 기준 (결정론적 키워드)

title에 다음 중 하나가 포함되면 `NOT_EXPECTED`:

**루트/경로 키워드:**
올레, 둘레길, 자전거길, 탐방로, 탐방길, 해안도로, 숲길, 갈맷길, 트레일,
환상자전거, 환상순환, 산책로

**자연지형 키워드:**
오름, 해변, 해수욕장, 곶자왈, 폭포, 현무암, 용암, 하천, 계곡,
지형, 지대, 암석, 암반, 연안, 갯벌, 봉우리

또는 `alltag` 필드에 다음이 포함되면 `NOT_EXPECTED`:
올레, 산책로, 자전거, 둘레길, 탐방로, 숲길, 갈맷길

#### NEEDS_VERIFICATION 판단 기준 (결정론적 키워드)

title에 다음 중 하나가 포함되면 `NEEDS_VERIFICATION`:

박물관, 미술관, 아쿠아리움, 수족관, 전시관, 기념관, 체험관, 과학관, 역사관,
자연사관, 전시장, 민속관, 생태체험관, 식물원, 동물원, 수목원, 아쿠아플라넷,
농장, 목장, 낚시터, 승마장, 다이빙, 스쿠버, 서핑, 테마파크, 리조트, 골프, 경마

> **주의:** NEEDS_VERIFICATION은 KTO targeted 보강 대상을 의미하며, 전체 phone no-value entity를 KTO에 일괄 조회하라는 뜻이 아니다. 제주 실증 데이터에서 348건 중 6건만 NEEDS_VERIFICATION이었다.

---

## PART 2 — 전화번호 독립성 원칙 (RULE-C)

### RULE-C: Phone Independence

전화번호 부재는 다음 eligibility 축에 **자동 패널티를 부여하지 않는다**:

```
phone_source_state = SOURCE_EMPTY / SOURCE_PLACEHOLDER / SOURCE_MALFORMED
→ SEARCHABLE 제한 없음
→ EXPLORE_ELIGIBLE 제한 없음
→ AI_ITINERARY_ELIGIBLE 제한 없음
→ USER_CAN_SELECT 제한 없음
→ USER_CAN_SAVE 제한 없음
```

**실증 근거 (제주 c1 1,341건):**
- Phone no-value 348건 전체 SEARCHABLE = YES (제한 0건)
- Phone no-value 348건 전체 USER_CAN_SELECT = YES (제한 0건)

전화번호는 편의 정보이며 관광 가치와 독립이다.
정보 수집 대상으로만 관리한다 (NEEDS_VERIFICATION 6건 → KTO targeted).

---

## PART 3 — Geometry 분류 체계 (RULE-D)

### RULE-D: Geometry Taxonomy

좌표가 없거나 무효(0.0/0.0 API placeholder 포함)인 entity의 공간 유형을 7종으로 분류한다.
이 분류는 navigation anchor 전략과 source verification 우선순위 결정에 사용된다.

#### geometry_type 값 정의

| 값 | 정의 | 판단 기준 |
|---|---|---|
| `POINT` | 특정 지점 entity (시설, 박물관, 자연 지점) | 박물관, 미술관, 오름, 폭포, 굴, 동굴, 탑, 전시관, 기념관 등 title 키워드; 또는 phone=PRESENT fallback |
| `AREA` | 면적형 관광 destination | 거리, 시장, 마을, 공원, 해변, 해수욕장, 파크, 포레스트, 숲, 가든, 라바, 일대, 지대, 단지, 타운, 권역 등 |
| `LINEAR_ROUTE` | 선형 관광지 | 올레, 둘레길, 자전거길, 탐방로, 해안도로, 산책로 등; 또는 title이 "길"로 종결 (단, 사무소·센터·점·숍·마트·빌딩·학교·병원 등 예외) |
| `ROUTE_SEGMENT` | 특정 코스·구간 | "X코스", "X구간", "[A-Z]코스", "제 N 코스" 패턴 |
| `ROUTE_COLLECTION` | 복수 구간의 상위 entity | 환상자전거길, 환상순환길 등 전체 노선을 지칭 |
| `MULTI_SITE` | 복수 물리 지점을 포함하는 entity | 역사유적지구(복수 유적 묶음) 등 |
| `UNKNOWN` | 사용 가능한 데이터로 분류 불가 | title+tags 모두 위 기준에 해당하지 않는 entity |

#### coordinate_source_state 값 정의

| 값 | 정의 |
|---|---|
| `VALID_SOURCE_COORDINATE` | lat/lon이 해당 도시 유효 범위 내 |
| `SOURCE_EMPTY` | lat 또는 lon이 null/missing |
| `INVALID_SOURCE_ZERO` | lat=0.0 and lon=0.0 (API null placeholder) |
| `INVALID_COORDINATE` | 값은 있으나 유효 범위 외 |

**`INVALID_SOURCE_ZERO` 주의:** 실제 위치 0.0/0.0이 아니다. VisitJeju API가 좌표 미제공 시 반환하는 플레이스홀더로, 제주 실증에서 2건 확인됨.

---

## PART 4 — Source Anchor 원칙 (RULE-E)

### RULE-E: Source-Provided Anchor Only

GoKoreaMate (포함 Claude)는 좌표를 자체 생성하거나 추정하지 않는다.

#### 금지 행위 (FORBIDDEN)

- 임의 대표 좌표 지정
- 주소 문자열로부터 중심점 추정
- 인근 시설의 좌표 대체 사용
- route/trail 시작점 임의 선택
- AI 학습 지식으로 좌표 생성
- 지도 웹 화면 scraping 값을 canonical source로 사용

#### 허용 source (ALLOWED)

1. 지역 공식 관광 API / 공공데이터 (VisitJeju API, KTO API 등)
2. 지자체·관광공사·공식 운영기관이 직접 제공한 좌표
3. 저장·재사용 권리가 확인된 공공 API
4. 약관이 허용하는 정식 geocoding/지도 API (약관 준수 필수)
5. 공식 route/course 데이터의 start/end/segment/representative point

#### 적용 예

- ROUTE_COLLECTION (제주환상자전거길): KTO API 또는 제주도 공식 자전거 route 데이터에서 segment 구조 확인
- POINT + INVALID_SOURCE_ZERO (병악현무암지대): KTO detailCommon2 또는 VisitJeju 공식 페이지에서 실제 좌표 확인
- AREA (해수욕장): VisitJeju 공식 또는 관광공사 anchor 좌표 확인

---

## PART 5 — Navigation 독립성 원칙 (RULE-F)

### RULE-F: Navigation Readiness Independence

#### navigation_status 값 정의

| 값 | 의미 | 해당 geometry |
|---|---|---|
| `READY` | 유효한 source 좌표 존재 → AI 라우팅 가능 | 모든 유형 (coord valid 시) |
| `NEEDS_SOURCE_ANCHOR` | AREA/LINEAR_ROUTE에 공식 대표 anchor 좌표 필요 | AREA, LINEAR_ROUTE, MULTI_SITE |
| `NEEDS_SOURCE_SEGMENTATION` | 루트 구간 구조 및 anchor를 공식 소스에서 확인 필요 | ROUTE_SEGMENT, ROUTE_COLLECTION |
| `NEEDS_SOURCE_VERIFICATION` | POINT/UNKNOWN entity의 정확한 좌표를 공식 소스에서 확인 필요 | POINT, UNKNOWN |

#### 독립성 원칙

```
navigation_status = NEEDS_SOURCE_ANCHOR
                  / NEEDS_SOURCE_SEGMENTATION
                  / NEEDS_SOURCE_VERIFICATION
→ SEARCHABLE 제한 없음
→ USER_CAN_SELECT 제한 없음
→ USER_CAN_SAVE 제한 없음
→ 관광 가치 손실 없음
→ 단, EXPLORE_ELIGIBLE = CONDITIONAL (지도 표시 제한 — 정상)
→ 단, AI_ITINERARY = REVIEW_REQUIRED (보수적, 정상 — AI=NO 영구 제외 아님)
```

**실증 근거 (제주 c1 coord missing 32건):**
- 32건 전체 SEARCHABLE = YES (제한 0건)
- 32건 전체 AI_ITINERARY = REVIEW_REQUIRED (AI=NO 영구 제외 0건)

AREA·ROUTE 등은 단일 좌표로 표현할 수 없는 entity 성격이다. 이는 데이터 품질 문제가 아니다.

---

## PART 6 — AI 자동 일정 독립성 원칙 (RULE-G)

### RULE-G: AI Auto-Scheduling Independence

#### 4대 독립 원칙 (실증 확인)

```
TOURISM_VALUE ≠ DATA_COMPLETENESS
DATA_COMPLETENESS ≠ NAVIGATION_READINESS
NAVIGATION_READINESS ≠ AI_AUTO_SCHEDULING_READINESS
USER_PICK_ABILITY ≥ AI_AUTO_SCHEDULING_ABILITY
```

#### 적용 규칙

1. **AI=REVIEW_REQUIRED ≠ AI=NO**: 좌표 missing 또는 navigation 불가 entity를 AI_ITINERARY=NO로 영구 배제하지 않는다. source anchor 확보 후 재평가 가능하도록 REVIEW_REQUIRED로 유지한다.

2. **User Pick 우선**: 사용자가 Selected에 직접 추가한 장소는 AI_ITINERARY 값과 무관하게 일정 포함 허용 (multicity-place-eligibility-policy-v1.md RULE 4 연장 적용).

3. **CONDITIONAL 유지 가능**: coord missing이더라도 entity 가치가 충분하면 AI=CONDITIONAL 유지 가능. 단, AI가 자동으로 일정에 추가할 때는 source anchor 확보 후 실행해야 한다.

---

## PART 7 — Source Verification 대상 우선순위 원칙

### 대상 범위 결정 규칙

전화번호 no-value 전체 또는 좌표 missing 전체를 일괄 KTO 보강 대상으로 처리하지 않는다.

| 대상 | 범위 | 이유 |
|---|---|---|
| Phone verification | `NEEDS_VERIFICATION`만 | NOT_EXPECTED/UNKNOWN은 KTO 조회 필요 없음 |
| Coord verification | `NEEDS_SOURCE_VERIFICATION` (POINT/UNKNOWN) 우선 | AREA/ROUTE는 anchor 방식이 다름 |
| Coord AREA anchor | `NEEDS_SOURCE_ANCHOR` | VisitJeju/관광공사 공식 anchor 필요 |
| Coord ROUTE structure | `NEEDS_SOURCE_SEGMENTATION` | 공식 route operator source 필요 |

**제주 실증:**
- Phone: 348건 no-value → 6건만 NEEDS_VERIFICATION (KTO 대상)
- Coord: 32건 missing → 19건 NEEDS_SOURCE_VERIFICATION 우선 (KTO targeted)

---

## PART 8 — 공통 Anti-Patterns

| Pattern | 잘못된 처리 | 올바른 처리 | 위반 Rule |
|---|---|---|---|
| AP_PSG_01 | `phoneno == "--"` → `SOURCE_EMPTY` | `phoneno == "--"` → `SOURCE_PLACEHOLDER` | RULE-A |
| AP_PSG_02 | phone no-value → SEARCHABLE=NO | phone no-value → SEARCHABLE 영향 없음 | RULE-C |
| AP_PSG_03 | 좌표 없음 → `geometry_type` 판단 생략 | 좌표 없음에도 geometry_type 분류 | RULE-D |
| AP_PSG_04 | 좌표 없음 → 추정 좌표 생성 | SOURCE_EMPTY/INVALID 상태 유지, anchor source 확인 대기 | RULE-E |
| AP_PSG_05 | AREA entity → NEEDS_SOURCE_VERIFICATION | AREA entity → NEEDS_SOURCE_ANCHOR | RULE-D + F |
| AP_PSG_06 | coord missing → AI=NO (영구 제외) | coord missing → AI=REVIEW_REQUIRED | RULE-G |
| AP_PSG_07 | phone no-value 전체 → KTO 일괄 보강 | NEEDS_VERIFICATION만 KTO 대상 | RULE-B |
| AP_PSG_08 | SOURCE_MALFORMED → SOURCE_EMPTY 처리 | SOURCE_MALFORMED → 별도 분류, PRESENT는 아님 | RULE-A |

---

## PART 9 — 도시별 API 관행 기록 (확인된 것만)

| 도시 | API | 관행 | 분류 |
|---|---|---|---|
| 제주 | VisitJeju c1 | `phoneno = "--"` = 좌표 미제공 시 placeholder | SOURCE_PLACEHOLDER (202건) |
| 제주 | VisitJeju c1 | `lat=0.0 / lon=0.0` = 좌표 미제공 placeholder | INVALID_SOURCE_ZERO (2건) |

> 신규 도시 수집 시 해당 API의 placeholder 관행을 확인하여 이 표를 보완한다.

---

## PART 10 — 관련 문서

- `docs/data-collection/multicity-data-quality-guardrail-v1.md` — PRINCIPLE 14~17 (이 문서 요약 포인터)
- `docs/data-collection/multicity-place-eligibility-policy-v1.md` — 5개 eligibility 축 정의 (RULE-C/F/G와 연동)
- `docs/data-collection/multicity-eligibility-regression-fixtures-v1.json` — PSG_001~PSG_008 fixture
- `data/visitjeju/reports/jeju/jeju-place-phone-semantics-v1.json` (data/jeju-collection-v2) — 제주 phone 분류 전수 결과
- `data/visitjeju/reports/jeju/jeju-place-coordinate-geometry-v1.json` (data/jeju-collection-v2) — 제주 coord geometry 전수 결과
- `docs/data-collection/jeju/jeju-missing-semantics-and-source-anchor-rule-v1.md` (data/jeju-collection-v2) — 증거 기반 규칙 원문

---

## QA 체크리스트

- [x] RULE-A: SOURCE_PLACEHOLDER / SOURCE_MALFORMED / PRESENT / SOURCE_EMPTY 4종 분류 정의됨
- [x] RULE-B: phone_source_state + phone_semantic_status 2-layer 분리 정의됨
- [x] RULE-C: phone 부재 → eligibility 자동 패널티 없음 명문화
- [x] RULE-D: geometry_type 7종 + navigation_status 4종 정의됨
- [x] RULE-E: 좌표 자체 생성/추정 금지 + 허용 source 목록 명시
- [x] RULE-F: navigation 불가 → 관광 가치/SEARCHABLE 독립 명문화
- [x] RULE-G: AI=REVIEW_REQUIRED ≠ AI=NO 영구, User Pick ≥ AI Auto 명문화
- [x] Anti-patterns 8종 정의됨
- [x] 제주 실증 근거 모든 규칙에 연결됨
- [x] 도시별 API 관행 테이블 포함
- [x] DB/schema/src/functions 변경 = 0
- [x] master/city branch 변경 = 0
- [x] API/Web/KTO/Map 호출 = 0
