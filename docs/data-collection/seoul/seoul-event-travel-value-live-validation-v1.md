# 서울 Event Travel Value Live Validation v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 실행일 | 2026-08-10 |
| DETAIL_CALLS | 35건 (EVENT_TRACK 샘플) |
| 전체 EVENT_TRACK | 1,190건 |
| DB 변경 | 0 |

---

## A. 정책 원칙

> **EVENT_IS_CORE_TIME_SENSITIVE_TRAVEL_DOMAIN = YES**

Event는 별도 track이지만 중요도 낮음이 아니다.

- 특정 날짜에 서울을 방문하는 여행자에게 이벤트가 여행 목적 자체가 될 수 있음
- K-pop 콘서트, 문화 축제, 전통 행사가 목적지 선택의 주요 동인
- 이벤트는 ACTIVE/UPCOMING 상태에서 AI CONDITIONAL 후보 최상위 가능

---

## B. 샘플 구성 (35건)

| 유형 | 대표 예시 |
|---|---|
| K-pop/공연 | S-TCEP 서울시향 콘서트 시리즈 (미하일 플레트뇨프, 지안왕, 얍판츠베덴) |
| 전통/문화 | 정조대왕 능행차 재현, 연등회, 고궁음악회(경복궁·창경궁) |
| 전시 | 서울일러스트레이션페어, 2021 CRE8TIVE REPORT, 맥·혼과물질 |
| 축제 | 2025 영등포 여의도 봄꽃축제, 서울디저트페어, 2023 물총축제 |
| 야외/계절 | 창덕궁 달빛 기행 2021, 서울야외도서관 |
| 공연장 | 라움, 용산아트홀, 세종대 컨벤션센터 (행사 venue) |
| 가족/어린이 | 나무인형의비밀(체코마리오네트), 두산아트랩 |
| 자전거 | 2025 천호자전거거리 가을바람 라이딩 챌린지 |
| 종교/전통 | 2019년·2021년 서울국제불교박람회 |
| 음식 | 서울디저트페어 초코&딸기 |

---

## C. Event Type 신호 탐지

| Signal | 탐지 건수 | 비율 |
|---|---|---|
| `exhibition` (전시) | 21 / 35 | 60.0% |
| `kpop_concert` (공연/콘서트 키워드) | 18 / 35 | 51.4% |
| `performance` (공연) | 18 / 35 | 51.4% |
| `festival` (축제) | 10 / 35 | 28.6% |
| `seasonal` (계절성) | 7 / 35 | 20.0% |
| `traditional` (전통) | 7 / 35 | 20.0% |
| `family_kids` (가족/어린이) | 4 / 35 | 11.4% |
| `food_event` (음식 이벤트) | 3 / 35 | 8.6% |
| `night_event` (야간) | 2 / 35 | 5.7% |
| `active` (신체 활동) | 1 / 35 | 2.9% |
| `booking` (예약/티켓) | 1 / 35 | 2.9% |

---

## D. Event Lifecycle 분석

| 라이프사이클 상태 | 건수 | 비율 |
|---|---|---|
| UPCOMING_OR_ACTIVE | 11 | 31.4% |
| UNKNOWN | 24 | 68.6% |

### 핵심 gap: 날짜 구조화 필드 없음

VisitSeoul event 레코드에서:
- **시작일/종료일 structured 필드 없음** — 날짜 정보는 title이나 post_desc HTML 텍스트에만 존재
- 과거 이벤트(2017~2023년 이벤트)가 동일 inventory에 포함 → current/ended 판별 어려움
- Event lifecycle 자동 판별을 위해서는 날짜 추출 + 현재 날짜 비교 필요

**Field 가용성:**

| 이벤트 정보 | VS 구조화 필드 | VS 텍스트 추출 | 외부 소스 |
|---|---|---|---|
| 시작일 | ❌ | ⚠️ title/desc에 일부 | 공식 사이트 |
| 종료일 | ❌ | ⚠️ desc에 일부 | 공식 사이트 |
| 장소 | ⚠️ traffic.adres | ✅ 보통 | — |
| 좌표 | ✅ traffic.map_position_x/y | — | — |
| 티켓/예매 | ❌ | ⚠️ 드물게 | 인터파크, 예스24 |
| 가격 | ❌ | ⚠️ 드물게 | 공식 사이트 |
| 반복성 | ❌ | ⚠️ 드물게 (annual 등) | — |
| 공식 링크 | ✅ extra.cmmn_hmpg_url | — | — |
| 현재 상태 | ❌ | ⚠️ 부분적 | 공식 사이트 |
| 대상 관객 | ❌ | ⚠️ 설명문 | — |

---

## E. 이벤트-장소 관계 실증

### Event → Place 패턴 (VisitSeoul에서 관찰)

| 이벤트 CID | 이벤트명 | 연결 장소 | 장소 CID |
|---|---|---|---|
| KOP037592 | 2021 창덕궁 달빛 기행 | 창덕궁 | PLACE entity (SSOT) |
| KOP021770 | 고궁음악회 | 경복궁·창경궁 | PLACE entities |
| KOPi94zwj | 2025 영등포 여의도 봄꽃축제 | 여의도 한강공원 | KOP012993 |
| KOPg50ipl | 서울시향 콘서트 | 공연장 | KOP023571 계열 |
| KOPpw022t | 천호자전거거리 라이딩 챌린지 | 천호, 자전거 코스 | 복수 장소 |

**결론**: 이벤트 ↔ 장소 관계는 다대다(M:N) 가능 — 단일 hosting_place_id로 확정 금지.

---

## F. Event Travel Value 분류

### CURRENT_HIGH_VALUE_EVENT

- status=ACTIVE/UPCOMING
- K-pop 콘서트, 대형 문화 축제, 국제 전시
- AI: `CONDITIONAL` (여행 날짜 + traveler intent 매칭)
- intent: `festival`, `kpop`, `performance`, `seasonal_event`

### RECURRING_ANNUAL_EVENT

- 매년 반복하는 전통 행사
- 창덕궁 달빛기행, 고궁음악회, 연등회 등
- 현재 특정 회차 종료여도 다음 회차 안내 가능
- AI: `CONDITIONAL` (해당 시즌에)

### HERITAGE_CULTURAL_EVENT

- 국가 문화/전통 행사
- 정조대왕 능행차, 고궁음악회
- EXPLORE: YES (교육/문화 intent)
- AI: `CONDITIONAL` (history, culture intent)

### EXPIRED_EVENT

- 명확히 종료된 과거 이벤트 (2017~2023)
- EXPLORE: NO (기본 숨김)
- AI: NO
- 삭제 금지 — 아카이브 보존 (repeat 이벤트의 history 참조용)

---

## G. K-pop/Hallyu 이벤트 발견

샘플 35건 중 공연/콘서트 keyword 탐지: 18건 (51.4%)

실제 K-pop 직접 관련:
- S-TCEP 서울시향 시리즈 = classical concert (K-pop 아님, 공연 전반)
- 종로랑 페스티벌 = 지역 행사
- 2021 두산아트랩 = 실험 예술

**발견**: VisitSeoul EVENT_TRACK에서 순수 K-pop 콘서트는 적음.
K-pop 이벤트 coverage는 WEAK — 별도 K-pop 특화 source 필요 (하이브, SM, JYP 공식, 티켓 플랫폼).

---

## H. Event-Place 관계 모델 요구사항

```
RULE EVP-1: 이벤트와 장소는 별도 entity — 합치지 않음.
RULE EVP-2: 이벤트는 hosting_place 참조 (다대다 가능).
RULE EVP-3: 이벤트 start_date/end_date 필수 — 없으면 CURRENT_STATUS=UNKNOWN.
RULE EVP-4: ENDED 이벤트 → EXPLORE 기본 숨김, AI=NO, 삭제 금지.
RULE EVP-5: ACTIVE/UPCOMING 이벤트 → 여행 날짜 + intent 매칭 시 AI CONDITIONAL 최우선.
RULE EVP-6: 반복성(annual/recurring) 이벤트는 is_recurring 플래그 또는 태그 필요.
```

---

## I. QA 플래그

| 플래그 | 값 |
|---|---|
| EVENT_IS_CORE_TIME_SENSITIVE_DOMAIN | YES |
| EVENT_DETAIL_SAMPLE | 35건 |
| EVENT_SUCCESS_RATE | 35/35 (100%) |
| START_DATE_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| END_DATE_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| LIFECYCLE_UPSTREAM_STRUCTURED | NOT_AVAILABLE_IN_VISITSEOUL |
| KPOP_CONCERT_NATIVE_IN_VS | WEAK |
| EVENT_PLACE_RELATION_REQUIRED | YES |
| SINGLE_HOSTING_PLACE_FINALIZED | NO |
| COUNT_TARGET | NOT_DEFINED_BY_DESIGN |
