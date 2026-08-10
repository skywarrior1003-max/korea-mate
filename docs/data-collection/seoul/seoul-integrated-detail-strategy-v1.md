# 서울 Integrated Detail Strategy v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 생성일 | 2026-08-10 |
| 전체 VisitSeoul inventory | 3,765건 |
| Detail 호출 완료 | 239건 (Nature 119 + Integrated 120) |
| 미호출 | 3,526건 (Restaurant 1,219 + Event 1,155 + 기타) |
| DB 변경 | 0 |

---

## A. 전략 원칙

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NUMERIC_PRUNING = FORBIDDEN
CATEGORY_BLANKET_EXCLUSION = FORBIDDEN
COVERAGE_GOAL = ALL_HIGH_TV_RECORDS_ACCESSIBLE
```

**VisitSeoul detail API는 필요한 만큼 호출하되, 한 번 호출로 충분한 정보를 추출한다.**
**중복 호출, 대량 재호출, 전체 bulk 호출은 금지.**

---

## B. Detail 호출 6-Tier 전략

### TIER 1 — HIGH_TRAVEL_VALUE (즉시 호출 대상)

| 대상 | 기준 |
|---|---|
| PLACE_CORE_CANDIDATE (미호출) | TV1=HIGH, TV3≥MEDIUM — AI 후보 핵심 |
| RECURRING_EVENT (ACTIVE 확인 필요) | 매년 반복하는 대형 축제/행사 — 라이프사이클 확인 |
| EXPERIENCE_CANDIDATE (전통 공예/공연/체험) | TV3=HIGH — 한국 고유 체험 |

목적: ai_eligible=YES 기반 확보

예상 건수: 약 300~500건 (PLACE_CORE 우선)

### TIER 2 — UTILITY_VALUE (배치 호출)

| 대상 | 기준 |
|---|---|
| RESTAURANT_DESTINATION | 한식 전문점, 뷰 레스토랑, 할랄/비건 특화 |
| PLACE_CONDITIONAL_REVIEW | TV Gate 통과 여부 확인 |
| SHOPPING_TOURISM_FLAGSHIP | 면세점, K-beauty flagship |

목적: intent 매칭 확대. 배치 단위 처리 (50~100건/세션)

예상 건수: 약 500~700건

### TIER 3 — INTENT_SPECIFIC (온디맨드)

| 대상 | 기준 |
|---|---|
| EVENT_ACTIVE_SPECIFIC | 특정 날짜/이벤트 확인 요청 시 |
| K-pop 관련 CID | 사용자 intent=kpop 시 우선 호출 |
| 할랄/비건 특화 restaurant | 사용자 intent=halal/vegetarian 시 |

목적: 특정 intent 대응. 필요 시 온디맨드 호출

예상 건수: 100~200건

### TIER 4 — USER_REVIEW (수동 검토)

| 대상 | 기준 |
|---|---|
| UNKNOWN SOURCE_CONTENT_TYPE | 분류 불명 CID |
| 엔터사 사옥 (YG/JYP/FNC) | 사무공간 vs 체험공간 확인 |
| Cy5h2x9 PLACE_CONDITIONAL_REVIEW | 어린이대공원 반려견놀이터, 라바타운, 키자니아 |

목적: 수동 확인 후 routing 결정

### TIER 5 — EXTERNAL_SEARCH (외부 소스 우선)

| 대상 | 기준 | 외부 소스 |
|---|---|---|
| 할랄 인증 | HALAL_CERTIFIED 확인 | 한국이슬람교 연합회 |
| 채식/비건 | VEGAN 메뉴 확인 | HappyCow |
| K-pop 공연 티켓 | TICKET 연동 | 인터파크, YES24 |
| 이미지 | 사진 URL | KTO 이미지, 공식 웹사이트 |
| 이벤트 날짜 | START/END 날짜 | 공식 사이트 |

목적: VisitSeoul 구조화 필드로 제공 불가능한 정보

### TIER 6 — LOW_TV (현재 제외, 아카이브)

| 대상 | 기준 |
|---|---|
| UTILITY_SERVICE (물품보관소 등) | 장소 entity의 편의시설로 연결 |
| ENDED_EVENT | 종료 확인. EXPLORE 숨김, AI=NO |
| ORDINARY_COMMERCIAL | 대형마트, 일반 체인 — SEARCHABLE, AI=NO |

목적: 보존은 하되 AI 추천 제외

---

## C. 호출 우선순위 Matrix

| Tier | 카테고리 | 예상 건수 | 호출 방식 | 완료 기준 |
|---|---|---|---|---|
| 1 | PLACE_CORE | 미정 | 배치 (100건/세션) | 전체 PLACE_CORE 호출 완료 |
| 1 | RECURRING_EVENT | ~50 | 단일 세션 | 대형 반복 이벤트 확인 |
| 2 | RESTAURANT (할랄/비건/destination) | ~200 | 배치 | intent 매칭 가능 레코드 |
| 2 | PLACE_CONDITIONAL | ~300 | 배치 | TV Gate 통과 여부 |
| 3 | EVENT_ACTIVE_SPECIFIC | 온디맨드 | 필요 시 | — |
| 3 | KPOP_SPECIFIC | ~50 | 단일 세션 | K-pop 체험/venue 전체 |
| 4 | USER_REVIEW | ~30 | 수동 | 검토 완료 |
| 5 | EXTERNAL_SOURCE | — | 별도 수집 | 데이터 연동 설계 필요 |
| 6 | LOW_TV | — | 호출 불필요 | 아카이브 보존 |

---

## D. 현재 완료 현황

| 배치 | 호출 건수 | 결과 |
|---|---|---|
| Nature/Trekking (Tier 1) | 119 | 완료. 문서화 완료 (9fb512c) |
| Restaurant Sample (Tier 2) | 40 | 완료. 정책 문서 완료 |
| Event Sample (Tier 2/3) | 35 | 완료. 문서화 완료 |
| Shopping Sample (Tier 2) | 18 | 완료. 문서화 완료 |
| Experience+Temple (Tier 1/3) | 12 | 완료. 문서화 완료 |
| K-pop Cross-Category (Tier 3) | 8 | 완료. 문서화 완료 |
| UNRESOLVED (Tier 4) | 7 | 완료. 라우팅 결정 완료 |
| **합계** | **239** | |

---

## E. 다음 단계 (후속 TASK)

### NEXT-TASK-1: PLACE_CORE 전체 호출
- 조건: `NEW_DETAIL_CALLS ≤ 제한 설정` (별도 task 승인 후)
- 전체 PLACE_CORE_CANDIDATE detail → ai_eligible 개별 판정
- 목표: AI 추천 기반 확보

### NEXT-TASK-2: 데이터 보강 연동
- 이벤트 날짜 추출 파이프라인 (regex + 공식 사이트 확인)
- 할랄 인증 리스트 연동
- VisitSeoul 이미지 API 연동

### NEXT-TASK-3: Restaurant 추가 샘플링
- 500건 추가 샘플 → destination vs utility 분류
- 할랄/비건/솔로 intent 매칭

---

## F. 금지 사항 (재확인)

```
RESTAURANT_1259_FULL_DETAIL = FORBIDDEN (이번 TASK)
EVENT_1190_FULL_DETAIL = FORBIDDEN (이번 TASK)
BULK_EXCLUDE = FORBIDDEN
NUMERIC_PRUNING = FORBIDDEN
NATURE_119_RECALL = 0
```
