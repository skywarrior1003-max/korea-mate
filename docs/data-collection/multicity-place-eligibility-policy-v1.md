# GoKoreaMate Multicity Place Eligibility Policy v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 생성일 | 2026-08-10 |
| 근거 TASK | TASK-MULTICITY-PLACE-ELIGIBILITY-POLICY-AND-BACKFILL-V1 |
| branch | data/seoul-collection-v1 |
| 기존 guardrail | docs/data-collection/multicity-data-quality-guardrail-v1.md (확장, 폐기 아님) |
| 적용 대상 | 부산·경주·서울·제주·전주·이후 전국 모든 도시 |
| DB 변경 | 0 (정책·schema proposal만) |

---

## 도입 — 왜 이 정책이 필요한가

GoKoreaMate의 기존 데이터 파이프라인은 장소를:

- "READY인가 / 아닌가"
- "관광지인가 / 아닌가"

하나의 축으로 판단했다.

이 단일 축 모델은 다음 **위험(risk)**을 초래한다:

1. **AI가 쇼핑몰·식당·숙박업소를 여행 명소처럼 자동 추천**할 수 있다.
2. **관광객이 실제로 찾는 장소가 SEARCHABLE에서 제외**될 수 있다.
3. **`READY=true` 하나만으로 AI 일정 후보가 결정**되어 quality gate가 없을 수 있다.
4. **Explore·Search·AI·사용자 직접 선택 각각에 맞는 품질 기준이 없다**.

> **CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK**
> 위 3번 항목은 MAIN 코드에서 직접 확인한 사실이 아니라 단일 축 모델의 **구조적 위험** 설명이다.
> AI candidate filtering 실제 구현은 MAIN 코드 검토 후 확인 필요.

이 정책은 장소를 **5개 독립 eligibility 축**으로 분리하여 관리한다.

---

## PART 1 — 핵심 4대 원칙

### RULE 1 — DATA PRESENCE ≠ AI RECOMMENDATION ELIGIBILITY

```
장소가 city_spots에 존재한다
≠
AI 일정이 자동 추천해도 된다
```

READY 상태, KTO 등재, VisitSeoul 공식 콘텐츠 여부 단독으로
AI 자동 추천 자격을 부여하지 않는다.

---

### RULE 2 — SEARCH VALUE ≠ ITINERARY VALUE

```
사용자가 여행 중 검색할 가치 있는 장소
≠
AI가 한정된 일정에 자동 삽입할 가치 있는 장소
```

검색 가치(SEARCHABLE)와 AI 일정 가치(AI_ITINERARY_ELIGIBLE)는
동일하지 않으며 독립적으로 판단한다.

---

### RULE 3 — SEARCHABLE PLACE를 과도하게 삭제하지 않는다

여행자가 실제로 찾을 가능성이 있는 다음 유형은
AI 자동 추천 대상이 아니더라도 검색/저장/사용자 직접 선택 가치가 있다:

- 쇼핑(K-beauty, K-fashion, 유명 카페, 브랜드 플래그십)
- 전통시장
- K-pop/Hallyu 관련 공간
- 관광객이 실제 목적지로 사용하는 상점
- 특색 있는 상업시설

`COMMERCIAL = 자동 SEARCHABLE 제외` 금지.

---

### RULE 4 — 일반 상업시설을 AI 일정에 자동 포함하지 않는다

일반 브랜드 매장·음식점·상업시설은 AI 기본 제외.

단 다음 조건 중 하나 이상이면 **조건부 AI 후보** 가능:

- 그 장소 자체가 여행 경험의 목적이 되는 경우
- K-beauty flagship (명동/성수 올리브영 대표점 등)
- K-pop 공식 체험 공간
- 유명 전통시장 (자갈치·광장·통인 등)
- 관광객 대상 체험형 매장
- 관광 공식 source가 독립 관광 콘텐츠로 다루며 실제 visitor intent가 있는 곳
- 서울/한국에서만 경험할 수 있는 대표 retail destination

---

## PART 2 — 5개 Eligibility 축 정의

> **중요**: 실제 DB column 생성은 이번 TASK 범위 밖.
> 정책·향후 schema proposal로만 기록.

---

### AXIS 1 — SEARCHABLE

| 값 | 의미 |
|---|---|
| YES | GoKoreaMate 내부 검색 결과로 사용자가 발견할 가치 있는 장소 |
| NO | 검색 결과 노출 부적합 |

YES이면: 검색 결과 노출 가능 + 장소 상세 접근 가능 + Save 후보 + Selected 후보.

AI 자동추천 여부와 **독립**.

> **중요 — SEARCHABLE 구현 방식 구분:**
>
> SEARCHABLE=YES가 "canonical city_spots DB에 해당 장소를 반드시 bulk 저장한다"를 의미하지 않는다.
>
> SEARCHABLE=YES는 **product surface capability** 정의다. 실현 방식은:
> - (A) curated canonical record (canonical city_spots에 있는 장소)
> - (B) external place search result (외부 지도/검색 연동)
> - (C) My Places / user-added (사용자가 직접 추가)
>
> 대표 flagship은 (A) 가능. 일반 chain 지점 수백 개는 **(A)로 전체 구축 금지** — (B) 또는 (C)로 처리.
>
> **CANONICAL USER_CAN_SELECT**: canonical city_spots에 있는 장소를 Selected에 추가.
>
> **EXTERNAL_SEARCH USER_ADD_ALLOWED**: canonical에 없어도 외부 장소 검색으로 사용자가 직접 추가 가능.
>
> `canonical SEARCHABLE=NO`여도 사용자는 외부 장소 검색으로 직접 추가할 수 있음. 이 두 개념을 혼동하지 않는다.

---

### AXIS 2 — EXPLORE_ELIGIBLE

| 값 | 의미 |
|---|---|
| YES | Explore에서 일반 여행자에게 적극 노출할 가치 있음 |
| CONDITIONAL | 특정 theme/category/query에서만 가치 있음 |
| NO | 검색해서 찾을 수는 있지만 Explore 기본 노출 불필요 |

CONDITIONAL 조건 예:

- `theme: K-beauty`, `theme: Shopping`, `theme: K-pop`
- `theme: Cafe`, `theme: Souvenir`, `category: Market`
- `district: Seongsu`, `district: Myeongdong`

---

### AXIS 3 — AI_ITINERARY_ELIGIBLE

| 값 | 의미 |
|---|---|
| YES | 일반 여행 일정에서도 AI 자동 추천 후보 가능 |
| CONDITIONAL | 사용자의 명시적 여행 의도/선호가 있을 때만 후보 |
| NO | AI 자동 일정에 넣지 않음 |

CONDITIONAL 조건 예 (traveler intent):

- `K-beauty 관심`, `shopping 목적`, `K-pop fan`
- `cafe hopping`, `fashion 관심`, `souvenir shopping`
- `trendy Seoul`, `Seongsu`, `Myeongdong`

NO이더라도 사용자가 직접 Selected에 추가하면 AI 일정 포함 가능.

**USER PICKED PLACE > AI AUTO RECOMMENDATION FILTER** 원칙 유지.

---

### AXIS 4 — USER_CAN_SELECT

| 값 | 의미 |
|---|---|
| YES | 사용자가 직접 Selected에 추가 가능 |
| NO | 시스템 정책상 Selected 불가 |

SEARCHABLE=YES인 장소 대부분은 USER_CAN_SELECT=YES.

---

### AXIS 5 — USER_CAN_SAVE

| 값 | 의미 |
|---|---|
| YES | 사용자가 개인 저장(Save) 가능 |
| NO | Save 기능 미지원 |

SEARCHABLE=YES인 장소 대부분은 USER_CAN_SAVE=YES.

---

## PART 3 — Place Class 공통 정의

> DB enum 구현 대상 아님. 논리적 분류 개념.

### CLASS A — CORE_TRAVEL_PLACE

여행자가 찾아가는 핵심 관광·문화 장소.

**해당 유형:**

- 궁궐·왕릉·고분군
- 유네스코 세계유산·국가유산·사적
- 국립/공립 박물관·미술관
- 주요 공원·대표 자연명소
- 유명 전통시장
- 주요 체험·문화시설
- 대표 현대 관광시설·테마파크
- K-pop 공식 팬덤 체험 공간
- 사찰(사원)·서원
- 관광 공식 코스의 핵심 stop

**기본 Eligibility:**

```
SEARCHABLE          = YES
EXPLORE_ELIGIBLE    = YES
AI_ITINERARY        = YES
USER_CAN_SELECT     = YES
USER_CAN_SAVE       = YES
```

---

### CLASS B — TRAVEL_USEFUL_PLACE

여행자가 검색할 가치는 있지만
일반 일정에서 AI가 자동 추천할 정도는 아닌 장소.

**해당 유형:**

- 유명 쇼핑 매장 (일반 지점)
- 일부 카페·음식점 (관광 맥락 없는)
- 상업시설·브랜드 매장
- 지역 일반 시장 (관광 특화 아닌)
- 여행자가 특정 필요 때문에 찾는 곳

**기본 Eligibility:**

```
SEARCHABLE          = YES
EXPLORE_ELIGIBLE    = CONDITIONAL (theme/query 조건 필요)
AI_ITINERARY        = NO 또는 CONDITIONAL (intent 필요)
USER_CAN_SELECT     = YES
USER_CAN_SAVE       = YES
```

---

### CLASS C — EXTERNAL_OR_USER_PLACE

GoKoreaMate canonical DB에 반드시 구축할 필요는 없는 장소.
사용자가 외부 검색 또는 My Places로 추가하는 방식으로 처리.

**해당 유형:**

- 일반 편의점 지점
- 일반 약국·의원
- 주민 생활시설
- 개인 숙소

**기본 Eligibility:**

```
SEARCHABLE (canonical) = 별도 정책 (기본 NO 또는 EXTERNAL_SEARCH)
EXPLORE_ELIGIBLE       = NO
AI_ITINERARY           = NO
USER_CAN_SELECT        = YES (외부 place search 경유)
USER_CAN_SAVE          = YES (My Places)
```

---

## PART 4 — 예시별 Eligibility Matrix

### 경복궁

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | CORE_TRAVEL_PLACE | 유네스코 세계유산 인접, 조선 정궁 |
| SEARCHABLE | YES | |
| EXPLORE_ELIGIBLE | YES | |
| AI_ITINERARY | YES | |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

---

### 일반 Olive Young 지점 (수백 개 중 하나)

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | TRAVEL_USEFUL (후보) | |
| SEARCHABLE | YES | 여행자가 실제 찾음 |
| EXPLORE_ELIGIBLE | CONDITIONAL 또는 NO | K-beauty theme에서만 |
| AI_ITINERARY | NO | 일반 지점 → 자동 일정 삽입 금지 |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

**원칙**: 일반 Olive Young 지점 수백 개를 curated city_spots로 전체 구축하지 않는다.
flagship/관광형 대표점만 curated. 일반 지점은 향후 external search.

---

### Olive Young 명동 Flagship 또는 N서울타워 지점 등 관광형 대표점

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | TRAVEL_USEFUL (→AI CONDITIONAL) | |
| SEARCHABLE | YES | |
| EXPLORE_ELIGIBLE | YES (또는 CONDITIONAL) | K-beauty / Myeongdong theme |
| AI_ITINERARY | CONDITIONAL | K-beauty 여행자, shopping 관심, Myeongdong 방문 |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

AI 조건 예: `intent.k_beauty=true`, `intent.shopping=true`, `district=Myeongdong` 중 하나.

**USER_REVIEW_REQUIRED**: 관광형 flagship 선정 기준 — MAIN이 최종 확정.

---

### 뉴뉴하우스 성수 (일반 상업 공간, 외국인 관광 목적성 미확정)

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | TRAVEL_USEFUL | |
| SEARCHABLE | YES | |
| EXPLORE_ELIGIBLE | CONDITIONAL | Seongsu theme, trendy Seoul |
| AI_ITINERARY | NO (기본) | 외국인 관광 목적성 실측 evidence 미확보 |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

향후 외국인 관광 목적성이 충분히 높다는 실측 evidence 있으면
AI=CONDITIONAL로 승격 가능. MAIN 결정 필요.

---

### K-pop 공식 체험 공간 (예: 하이브 인사이트, SM 아티움 등)

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | CORE_TRAVEL_PLACE | 공식 관광 source, 관광객 primary destination |
| SEARCHABLE | YES | |
| EXPLORE_ELIGIBLE | YES | |
| AI_ITINERARY | YES (또는 CONDITIONAL) | K-pop 팬 → YES. 비관심 여행자 → CONDITIONAL |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

---

### Temple Stay / 한옥스테이 문화 체험

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | CORE_TRAVEL_PLACE (체험/문화) | 숙박이 아닌 문화 체험 목적 |
| SEARCHABLE | YES | |
| EXPLORE_ELIGIBLE | YES | |
| AI_ITINERARY | **CONDITIONAL** | 일정 구조·예약 제약 큼. traveler intent 필요. |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

> **AI CONDITIONAL 이유**: Temple Stay는 관광/문화 가치가 높지만, 예약 필요·숙박 포함·시간 제약이 크다.
> AI 자동 일정에 무조건 삽입하면 예약 불가능하거나 일정 구조와 충돌할 수 있다.
> traveler intent 매칭 시에만 AI 후보 포함.
>
> AI CONDITIONAL 조건 예: `temple_stay`, `traditional_culture`, `wellness`, `meditation`, `slow_travel`, `overnight_cultural_experience`
>
> 사용자가 직접 Selected에 추가한 경우 USER PICKED 우선 — AI filter 무관하게 일정 포함 허용.

**주의**: 일반 한옥 숙박은 accommodation 정책 적용. Temple Stay / 문화 체험 프로그램은 예외(culture/experience 분류).

---

### 일반 생활시설 (동사무소, 주민센터, 생활체육관 등)

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | EXTERNAL_OR_USER_PLACE | |
| SEARCHABLE (canonical) | NO | 관광 맥락 없음 |
| EXPLORE_ELIGIBLE | NO | |
| AI_ITINERARY | NO | |
| USER_CAN_SELECT | YES (My Places/외부) | |
| USER_CAN_SAVE | YES (My Places) | |

**부산 regression 교훈**: 주식회사감천아울·주식회사뷰티홀릭 등 감천마을 인근 법인이
KTO에 attraction으로 등재됨 → tourism relevance gate 없이 READY 처리됨.
이런 케이스는 EXTERNAL_OR_USER_PLACE에도 못 미침 (TOURISM_RELEVANCE_REJECTED).

---

### 전통시장 (자갈치·광장·통인 등 관광 특화)

| Axis | 값 | 근거 |
|---|---|---|
| Place Class | CORE_TRAVEL_PLACE | 관광 공식 source 등재, 외국인 관광객 primary destination |
| SEARCHABLE | YES | |
| EXPLORE_ELIGIBLE | YES | |
| AI_ITINERARY | YES 또는 CONDITIONAL | 음식/쇼핑 관심 여행자 → YES |
| USER_CAN_SELECT | YES | |
| USER_CAN_SAVE | YES | |

지역 일반 시장(관광 특화 아닌)은 TRAVEL_USEFUL 또는 USER_REVIEW_REQUIRED.

---

## PART 5 — AI Itinerary 후보 필터링 요구사항

> **MAIN CRITICAL**: AI itinerary generator에서 반드시 구현해야 할 필터링.

> **CURRENT_MAIN_AI_FILTER = NOT_VERIFIED_IN_THIS_TASK**
> 현재 MAIN 코드에서 AI 후보 필터링이 어떻게 구현되어 있는지 이 TASK에서 직접 확인하지 않았다.
> MAIN은 실제 AI candidate selection 코드를 검토한 뒤, `READY=true` 또는 data presence만으로 AI 후보가 되지 않도록
> `AI_ITINERARY_ELIGIBLE` 축을 명시적으로 적용해야 한다.

AI candidate 선정 시 `city_spots에 존재` 또는 `READY=true` 단독으로는 충분하지 않다.

최소 다음 조건 **전부** 통과 시에만 AI 일정 후보:

1. `AI_ITINERARY_ELIGIBLE` = YES 또는 CONDITIONAL (→ intent 매칭 필요)
2. verified coordinates (source 확인 좌표)
3. `tourism_relevance` = CONFIRMED
4. identity verified
5. category validity (tourism-relevant category)
6. current/open/usable 상태 (폐업·임시휴장 제외)
7. 사용자 관심사·여행 목적과의 매칭
8. 사용자가 Selected로 명시적으로 추가했는지

**CONDITIONAL 처리 규칙:**

```
AI_ITINERARY = CONDITIONAL 이면:
  if traveler_intent.matches(eligibility_conditions) → AI 후보 포함
  else → 제외

예:
K-beauty 여행자 + Olive Young flagship → 포함 가능
역사 중심 여행자 + Olive Young → 포함 금지
쇼핑 관심 없음 + 상업시설 → 포함 금지
```

**USER SELECTED 우선 원칙:**

```
사용자가 직접 Selected에 추가한 장소
→ AI_ITINERARY_ELIGIBLE 값과 무관하게 일정 포함 허용
→ USER PICKED > AI AUTO FILTER
```

---

## PART 6 — Search / Explore / My Places 역할 분리

GoKoreaMate의 목표는 **모든 POI를 자체 DB에 저장하는 것이 아니다**.

목표는 사용자가 필요한 여행 장소를 GoKoreaMate 안에서 **발견하거나 추가**할 수 있게 하는 것.

```
CANONICAL CURATED DATA       (핵심 관광지, 전문 데이터 구축)
+
EXTERNAL PLACE SEARCH        (일반 상업시설, 외부 지도 연동)
+
MY PLACES                    (사용자 직접 추가)
```

**적용 예:**

- 일반 Olive Young 지점 수백 개 → curated city_spots에 전체 구축 불필요
- 대표/관광형 flagship → curated data
- 일반 지점 → 향후 external search
- 사용자가 원하는 특정 장소 → My Places / Selected에 추가

---

## PART 7 — 음식 (Restaurant) 정책

음식점이 SEARCHABLE하다고 모든 음식점을 AI 일정에 자동 추천하지 않는다.

AI 일정 후보 판정 기준 (향후 정책):

- 관광 대표 음식점 (공식 관광 source 등재)
- 현지 대표 식당 (여행 가이드 수록)
- 유명 시장 food (전통시장 내)
- 여행자 특화 (외국인 관광객 1차 목적지)
- 식사 유형별 filter (아침식사, vegetarian, family, solo)
- dietary/availability
- district fit (day itinerary 동선 내)

이번 TASK에서 음식점 전체 재분류는 하지 않는다. **정책만 기록.**

---

## PART 8 — 숙박 정책

일반 숙박시설(호텔·펜션·카라반 등):

```
SEARCHABLE          = 별도 검토 (affiliate 경유)
EXPLORE_ELIGIBLE    = NO (기본)
AI_ITINERARY        = NO (자동 추천 금지)
USER_CAN_SELECT     = YES
USER_CAN_SAVE       = YES
```

**예외**: Temple Stay · 한옥 문화 체험 → CORE_TRAVEL_PLACE 취급.

---

## PART 9 — VisitSeoul API 적용 원칙

VisitSeoul API 카테고리(19,838건)를 그대로 GoKoreaMate AI candidate로 사용 금지.

```
VisitSeoul SOURCE CATEGORY
→ GoKoreaMate eligibility gate (tourism relevance)
→ Search / Explore / AI 별도 판정
순서.
```

VisitSeoul 공식 콘텐츠라는 이유만으로 AI 자동 후보 금지.

특히 다음 VisitSeoul 카테고리는 별도 판정 필요:

| 카테고리 | 건수 | Eligibility 주의점 |
|---|---|---|
| 음식 (Cuisine) | 6,561 | 전체 음식점 자동 AI 금지. 관광 대표만 후보 |
| 쇼핑 (Shopping) | 1,656 | 관광형 flagship만 CORE/AI_CONDITIONAL |
| 체험관광 | 632 | 대부분 CORE 또는 CONDITIONAL 후보 |
| 숙박 | 91 | affiliate 경유, AI 자동 제외 |
| 축제·행사 | 5,762 | 날짜 검증 필수, 현재·예정만 |

동시에:
```
Shopping/Cafe/Commercial 이라는 이유만으로
SEARCHABLE에서 자동 삭제도 금지.
```

---

## PART 10 — Schema Proposal (MAIN 결정 대상)

> 실제 DB migration은 하지 않는다. MAIN 검토용 제안.

### Option A — BOOLEAN 3개 추가

```sql
-- city_spots 테이블에 추가 (MAIN 결정 필요)
searchable              BOOLEAN DEFAULT true,
explore_eligible        BOOLEAN DEFAULT true,
ai_itinerary_eligible   BOOLEAN DEFAULT false
```

단순하지만 CONDITIONAL 표현 불가.

### Option B — TEXT enum + JSON conditions

```sql
-- city_spots 테이블에 추가 (MAIN 결정 필요)
searchable              BOOLEAN DEFAULT true,
explore_eligible        TEXT CHECK (explore_eligible IN ('YES','CONDITIONAL','NO')) DEFAULT 'YES',
ai_itinerary_eligible   TEXT CHECK (ai_itinerary_eligible IN ('YES','CONDITIONAL','NO')) DEFAULT 'NO',
eligibility_conditions  JSONB DEFAULT '{}'::jsonb,
user_can_select         BOOLEAN DEFAULT true,
user_can_save           BOOLEAN DEFAULT true
```

eligibility_conditions 예:

```json
{
  "ai_intents": ["k_beauty", "shopping", "myeongdong"],
  "explore_themes": ["K-beauty", "Shopping"],
  "notes": "Tourism-oriented flagship only"
}
```

### 권장

Option B. YES/CONDITIONAL/NO 3단계 + conditions JSON이
실제 product logic에 더 정확하게 대응.

**MAIN_SCHEMA_CHANGE_REQUIRED = PROPOSAL_ONLY**
**최종 schema 결정 = MAIN**

---

## PART 11 — 기존 Guardrail과의 관계

이 문서는 `multicity-data-quality-guardrail-v1.md`를 **확장**한다.
기존 13개 PRINCIPLE은 유지된다.

| 기존 규칙 | 이 문서에서 확장되는 방향 |
|---|---|
| PRINCIPLE 1: SOURCE PRESENCE ≠ TOURISM RELEVANCE | RULE 1: DATA PRESENCE ≠ AI ELIGIBILITY 로 강화 |
| PRINCIPLE 5: TOURISM RELEVANCE GATE | 5개 eligibility 축으로 세분화 |
| PRINCIPLE 13: AI ITINERARY READY 조건 | AI 필터링 요구사항 7개 조건으로 명시화 |

---

## PART 12 — USER_REVIEW_REQUIRED 항목

Claude가 임의로 확정하면 안 되는 구조적 판단:

| 항목 | 내용 |
|---|---|
| 관광형 flagship 기준 | Olive Young/이니스프리 등 대표점 선정 기준 |
| chain store 대표점 수 | 도시별 몇 개까지 curated data로 구축할지 |
| 유명 카페의 AI 자격 | 블루보틀·스타벅스 리저브 등 |
| shopping district vs individual shop | 명동/홍대 일대 vs 개별 매장 |
| commercial venue tourism threshold | 외국인 visitor intent 임계값 |
| ZH canonical | zh-CN vs zh-TW 선택 (서울 VisitSeoul API) |

---

## QA 체크리스트

- [x] SEARCHABLE와 AI 자격 분리됨
- [x] Explore 자격 별도 정의됨
- [x] 사용자 직접 선택권 별도 정의됨
- [x] nationwide 적용 명시 (부산·경주·서울·제주·전주·전국)
- [x] AI itinerary 영향 MAIN 인수인계 내용 포함
- [x] external search/My Places 역할 명시
- [x] VisitSeoul category 그대로 AI-ready 처리 금지
- [x] 일반 상업시설 일괄 searchable 제외 금지
- [x] 일반 숙박 제외 정책 유지
- [x] Temple Stay/한옥 체험 예외 명시
- [x] USER PICKED > AI AUTO FILTER 원칙 명시
- [x] source/provenance 규칙과 충돌 없음 (기존 guardrail 확장)
- [x] DB/schema/UI/src/functions 변경 = 0
- [x] Schema = PROPOSAL_ONLY, MAIN 결정 대상

---

## 관련 문서

- `docs/data-collection/multicity-data-quality-guardrail-v1.md` — 기존 13원칙 (이 문서가 확장)
- `docs/data-collection/multicity-regression-fixtures-v1.json` — 기존 부산/경주 regression (busan-gyeongju branch)
- `docs/data-collection/multicity-eligibility-regression-fixtures-v1.json` — 신규 eligibility regression (이 branch)
- `docs/data-collection/multicity-place-eligibility-backfill-audit-v1.json` — 부산/경주 backfill audit 결과
- `docs/data-collection/seoul/seoul-source-cascade-proposal-v1.json` — 서울 source cascade
- `docs/data-collection/gyeongju-main-clean-import-manifest-v1.md` — MAIN CRITICAL 섹션 참조
