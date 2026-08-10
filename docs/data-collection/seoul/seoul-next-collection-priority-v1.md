# 서울 Next Collection Priority v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1 |
| 생성일 | 2026-08-10 |
| 근거 | 3,765건 전수 enrichment routing 결과 |
| COUNT_CAP | 금지 — 우선순위는 traveler need 기반 |

---

## 원칙

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NUMERIC_CAP = FORBIDDEN
PRIORITY_BASIS = traveler_need + data_freshness + ai_value + source_reliability
```

숫자 상한 없이 아래 기준으로 순서를 정한다:

1. traveler need 중요도
2. 현재 coverage weakness
3. data freshness 필요성
4. AI itinerary 활용 가치
5. traveler utility 가치
6. source reliability
7. 단일 수집으로 얻을 수 있는 정보량
8. 호출 효율
9. stale risk
10. user-generated layer로 대체하기 어려운 정도

---

## Priority Group 1 — AI Itinerary Core 준비

### 1-A. PLACE_CORE VisitSeoul Detail 수집

**대상**: PLACE_CORE_CANDIDATE 중 기존 detail 미보유 (약 194건)

| 세부 카테고리 | 예상 건수 | 여행가치 |
|---|---|---|
| 문화관광 > 랜드마크관광 | ~40 | HIGH |
| 문화관광 > 전시시설 > 박물관 | ~51 | HIGH |
| 역사관광 > 역사유적지 계열 | ~42 | HIGH |
| 쇼핑 > 시장 | ~32 | HIGH |

이유:
- 경복궁, 남산, 명동, 홍대 등 핵심 랜드마크 AI 일정 후보
- detail로 TV gate 개별 판정 후 ai_eligible=YES 확정 가능
- 한 번의 배치 호출로 TV1~TV7 전체 평가 가능
- 기존 정책에서 PLACE_CORE_CANDIDATE가 가장 높은 ai_eligible 잠재성 확인됨

사용할 source: **VisitSeoul contents/info**

---

### 1-B. EXPERIENCE_CANDIDATE VisitSeoul Detail 수집

**대상**: EXPERIENCE_CANDIDATE 중 기존 detail 미보유 (약 108건)

| 세부 카테고리 | 예상 건수 | 의도 |
|---|---|---|
| 체험관광 > 전통체험 | ~21 | traditional_culture |
| 체험관광 > 공예체험 | ~20 | traditional_culture |
| 체험관광 > 기타체험 | ~33 | various |
| 체험관광 > 웰니스관광 | ~17 | wellness |
| 체험관광 > 산업관광 | ~18 | hallyu/industry |
| 체험관광 > 산사체험 | ~2 | temple_stay |

이유:
- 한국 고유 체험 = 여행 목적 자체 (TV3=HIGH 잠재성)
- 템플스테이 2건: 즉시 ai_eligible=YES 후보
- detail 없이는 EXPERIENCE_CONTENT vs PHYSICAL_PLACE 구분 불가

---

### 1-C. TEMPLE_STAY 공식 등록 확인

**대상**: TEMPLE_STAY_CANDIDATE 2건 + 전통체험 중 사찰 관련

이유: 템플스테이 공식 등록 여부 확인 → ai_eligible=YES 즉시 확정 가능.

---

## Priority Group 2 — 여행자 Utility + 현재성

### 2-A. Event Date/Status Pipeline

**대상**: D 라우팅 1,152건 (기존 detail 미보유)

전략:
- VisitSeoul description → regex 날짜 추출
- 추출 실패 → official site URL 사용
- ACTIVE/ENDED/RECURRING/UNKNOWN lifecycle 할당
- 대형 반복 축제 (서울 빛초롱, 한강 페스티벌 등) 우선

이유:
- ENDED Event → AI 일정 제외
- RECURRING → 시즌 AI 추천 가능
- ACTIVE → 날짜 기반 여행 일정 연동 가능
- **날짜 없이는 1,152건 AI 사용 불가**

---

### 2-B. Restaurant Utility Enrichment

**대상**: C 라우팅 921건

우선순위 내:
1. 할랄 가능 restaurant (현재 감지: 26건) — 공식 인증 확인
2. 채식/비건 가능 (29건) — HappyCow / 공식 정보
3. 솔로 다이닝 가능 (18건) — description 분석
4. 한식 대표 restaurant — 한국 cuisine intent 연결

이유:
- vegetarian, halal, solo_travel intent = CRITICAL GAP
- VISITSEOUL_DETAIL에서 일부 확인 가능
- 공식 인증은 외부 source 필요 (별도 pipeline)

---

### 2-C. PLACE_CONDITIONAL_REVIEW 우선 대상 선별

**대상**: A 라우팅 내 PLACE_CONDITIONAL_REVIEW (516건)

우선 sub-group:
- 문화관광 > 공연시설 (22건): 공연 AI 추천용
- 역사관광 > 종교성지 (21건): temple_stay/heritage 연결
- 문화관광 > 레저스포츠시설 (27건): 가족/액티비티 intent
- 문화관광 > 전시시설 (340건): 미술관/갤러리 우선 30건

---

## Priority Group 3 — Intent Gap 보강

### 3-A. K-pop / Hallyu Official Source

**대상**: K-pop intent 감지 70건 + VisitSeoul 미등록 핵심 K-pop 시설

이유: VisitSeoul만으로 K-pop 체험 공간 부족. HYBE INSIGHT, SM TOWN, K-pop 팝업 등 공식 source 직접 확인 필요.

source: OFFICIAL_BRAND (하이브, SM, YG, JYP 공식 사이트)

---

### 3-B. 할랄 인증 공식 리스트

source: 한국이슬람교 연합회 공식 인증 리스트

현재 VisitSeoul 감지: 26건. 실제 인증 레스토랑은 더 많을 가능성.

---

### 3-C. Nature/Trekking 전문 source 보강

대상: 서울둘레길 코스별 상세 / 북한산 등산로 거리·난이도

source: 국립공원 공단 + 서울시 공식 사이트

이유: 119건 Nature detail 보유하나 코스별 거리/난이도/접근성 부족.

---

## 다음 단계 추천

```
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1

WHY_THIS_NEXT =
  - 194건 PLACE_CORE 비보유 detail → 단일 배치 호출로 완료 가능
  - ai_eligible=YES 후보 즉시 확정 → AI itinerary 사용 시작 가능
  - 108건 EXPERIENCE_CANDIDATE와 함께 묶으면 최대 302건 단일 배치
  - 1건 호출 = TV gate 7축 전체 평가 가능
  - Restaurant 921건 / Event 1,152건보다 개별 가치가 높음
  - 서울 AI 일정 추천 실제 시작을 위한 최소 필수 조건
```

---

## 금지 재확인

```
NUMERIC_CAP = FORBIDDEN
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
BULK_DETAIL_ALL_3765 = FORBIDDEN
EVENT_BULK_EXCLUDE = FORBIDDEN
RESTAURANT_BULK_EXCLUDE = FORBIDDEN
NATURE_119_RECALL = FORBIDDEN (이미 완료)
```

---

## QA 플래그

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NEXT_DETAIL_COLLECTION_STRATEGY_READY = YES
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1
PRIORITY_GROUP_1 = PLACE_CORE_DETAIL + EXPERIENCE_DETAIL + TEMPLE_STAY
PRIORITY_GROUP_2 = EVENT_DATE_PIPELINE + RESTAURANT_UTILITY + CONDITIONAL_REVIEW_SUBSET
PRIORITY_GROUP_3 = KPOP_OFFICIAL + HALAL_OFFICIAL + NATURE_ROUTE_ENRICHMENT
```
