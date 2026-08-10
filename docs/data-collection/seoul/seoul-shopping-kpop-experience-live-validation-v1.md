# 서울 Shopping / K-pop / Experience Live Validation v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 실행일 | 2026-08-10 |
| Shopping | 18건 (SHOPPING_REVIEW) |
| K-pop cross-category | 8건 |
| Experience+Temple Stay | 12건 |
| UNRESOLVED 신규 | 7건 (Cy5h2x9, Ca1z6p7) |
| DB 변경 | 0 |

---

## A. Shopping Travel Value Validation

### A-1. 샘플 구성 (18건)

| 유형 | 예시 |
|---|---|
| 백화점/대형몰 | 현대백화점 무역센터점, 신세계 더 헤리티지 |
| 면세점 | 신라면세점 서울점, 신라아이파크면세점, 동화면세점 |
| 대형마트 | 롯데마트 제타플렉스 서울역점, 이마트 왕십리점 |
| 쇼핑몰 | 엔터식스 왕십리점, 테크노마트 |
| K-beauty/Design | 위글위글 플래그십스토어 도산점, 서울마이소울샵 5호점 |
| 로컬 시장 | 비앤씨마켓, 청계5가 지하쇼핑센터 |
| 지역 특산/공예 | 대성표구사, 마이초이스 서촌, 컬처앤네이처, 승진완구 |

### A-2. Signal 탐지

| Signal | 건수 | 비율 |
|---|---|---|
| `fashion` (패션) | 7 / 18 | 38.9% |
| `flagship` (플래그십) | 6 / 18 | 33.3% |
| `kbeauty` (K-beauty) | 6 / 18 | 33.3% |
| `ordinary_chain` | 4 / 18 | 22.2% |
| `traditional_market` (시장) | 4 / 18 | 22.2% |
| `tourism_district` (관광지) | 3 / 18 | 16.7% |
| `kpop_retail` | 1 / 18 | 5.6% |

### A-3. Shopping Travel Value 분류

**TOURISM_FLAGSHIP (AI CONDITIONAL)**
- 신라면세점 서울점 — 외국인 관광객 1차 목적지
- 위글위글 플래그십스토어 도산점 — K-design/lifestyle 브랜드 대표
- 서울마이소울샵 — 서울 기념품/로컬 특산 큐레이션

AI 자격: `CONDITIONAL` (intent: kbeauty, shopping, souvenir)

**TOURISM_DISTRICT_SHOPPING (SEARCHABLE)**
- 청계5가 지하쇼핑센터 — 도심 로컬 쇼핑 경험
- 비앤씨마켓 — 로컬 시장
- 대성표구사, 컬처앤네이처 — 특색 있는 로컬 샵

AI 자격: `CONDITIONAL` (intent: local_market, unique_experience)
EXPLORE: YES (Seongsu/Jongno 테마)

**ORDINARY_COMMERCIAL (SEARCHABLE, AI 제외)**
- 롯데마트 제타플렉스, 이마트 왕십리점 — 일반 대형마트
- 엔터식스, 테크노마트 — 일반 쇼핑몰

EXPLORE: CONDITIONAL 또는 NO
AI: NO (유틸리티 목적)

---

## B. K-pop Cross-Category Discovery

### B-1. VisitSeoul 전체 inventory K-pop 분포

전체 3,765건에서 K-pop 키워드 탐지: **145건** (3.85%)

| Track | 건수 |
|---|---|
| EVENT_TRACK | 66 (45.5%) |
| PLACE_CONDITIONAL_REVIEW | 39 (26.9%) |
| SHOPPING_REVIEW | 16 (11.0%) |
| RESTAURANT_TRACK | 10 (6.9%) |
| EXPERIENCE_CANDIDATE | 9 (6.2%) |
| PLACE_CORE_CANDIDATE | 5 (3.4%) |

### B-2. K-pop Cross-Category Sample (8건)

| CID | 제목 | Track | 평가 |
|---|---|---|---|
| KOP000465 | 제니하우스 | SHOPPING_REVIEW | K-pop 연관 쇼핑 확인 |
| KOP000730 | 서울썸머세일, 여름을 부탁해! | EVENT_TRACK | 쇼핑 이벤트 (K-pop 간접) |
| KOP001278 | 서울남산국악당 | PLACE_CONDITIONAL | 공연장 (전통/현대 공연) |
| KOP001453 | 두산아트센터 | PLACE_CONDITIONAL | 공연장 |
| KOP001732 | 아르코(ARKO)예술극장 | PLACE_CONDITIONAL | 공연장 |
| KOP002446 | 충무아트센터 | PLACE_CONDITIONAL | 공연장 |
| KOP003085 | 토탈미술관 | PLACE_CONDITIONAL | 갤러리 |
| KOP007290 | 삼청각 | RESTAURANT_TRACK | 전통 한식 + 공연 |

### B-3. KPOP_DISCOVERY_FROM_VISITSEOUL = **CONDITIONAL**

| 분류 | 내용 |
|---|---|
| 공연장/문화 venue | STRONG (아르코, 두산, 충무아트센터, 세종대 컨벤션, 라움 등) |
| K-pop 직접 관련 | WEAK (전문 K-pop 시설 미흡) |
| K-pop 이벤트 | CONDITIONAL (콘서트 이벤트는 별도 플랫폼 주도) |
| K-pop 쇼핑 | WEAK (제니하우스 등 소수) |

**GAP**: 하이브 인사이트, SM TOWN, YG 청담 등 공식 K-pop 체험 공간이 VisitSeoul에 미등록 또는 EXPERIENCE_CANDIDATE로만 분류됨. 별도 확인 필요.

EXPERIENCE_CANDIDATE 중 K-pop 관련:
- KOP011169 YG 엔터테인먼트
- KOP011250 JYP엔터테인먼트
- KOP011314 FNC 사옥
- KOP010289 나무엑터스

이 4건은 엔터사 사옥 — 체험 공간인지 사무 공간인지 VisitSeoul detail 확인 필요.

---

## C. Experience / Temple Stay Validation

### C-1. 샘플 구성 (12건)

| CID | 제목 | 유형 |
|---|---|---|
| KOPnel0nx | 상신당 | 전통 공예/무속 |
| KOP034361 | 세라듀 도자기공방 | 도자기 공예 체험 |
| KOP023571 | 서울창업허브 | 스타트업 허브 (창업 체험?) |
| KOP009576 | 강변스파랜드 | 스파/웰니스 |
| KOPgu3ezw | 강풀 만화 거리 투어 | 웹툰 투어 체험 |
| KOP011669 | 서울상상나라 | 어린이 체험관 |
| KOP019558 | 템플스테이 통합정보센터 | Temple Stay 안내/예약 |
| KOP003399 | 금현국악원 | 전통 국악 체험 |
| KOP018902 | 전통공예체험관 | 전통 공예 |
| KOP020257 | 카몽(KAMONG) | 전통/체험 |
| KOPccgonx | 스파고결 | 스파/웰니스 |
| KOP028456 | 더리버 | 한강 보트/체험? |

### C-2. Experience Travel Value

| 유형 | Travel Value | AI 자격 |
|---|---|---|
| 전통 공예 체험 (도자기, 국악, 공예) | HIGH — 한국 고유 경험 | CONDITIONAL (intent: traditional_culture, craft) |
| 스파/웰니스 | MEDIUM — 비독점적 | CONDITIONAL (intent: wellness, relaxation) |
| 어린이 체험관 | HIGH for families | CONDITIONAL (intent: family, kids) |
| Temple Stay | HIGH — 고유 경험 | CONDITIONAL (intent: temple_stay, meditation) |
| K-pop 체험 | HIGH for fans | CONDITIONAL (intent: kpop) |

### C-3. Temple Stay (2건 전체 inventory)

| CID | 제목 | 평가 |
|---|---|---|
| KOP019558 | 템플스테이 통합정보센터 | 예약/안내 허브 — SEARCHABLE=YES, 직접 예약 링크 |
| 기타 1건 | 국제선센터(양천구) | 현장 확인 — AI=CONDITIONAL |

**Temple Stay 정책**: 일반 숙박과 명확히 구분. CORE_TRAVEL_PLACE (문화 체험 분류).
```
AI_ITINERARY_ELIGIBLE = CONDITIONAL
intent: temple_stay, traditional_culture, wellness, meditation, slow_travel
```

---

## D. UNRESOLVED 22건 최종 Resolution

### 전체 UNRESOLVED 22건 분류 완료

| Code | Category | 건수 | 제안 Routing | 근거 |
|---|---|---|---|---|
| `Cw8j0y7` | 자연관광 > 자연경관(하천) | **13** | PLACE_CONDITIONAL_REVIEW | 하천/하강 — 자연 가치 높음. Nature 119건에서 13건 전부 이미 detail 호출 완료. |
| `Cy5h2x9` | 문화관광 > 테마공원 | **7** | 4건 PLACE_CORE + 3건 PLACE_CONDITIONAL | 롯데월드/씨라이프/서울랜드 = CORE. 어린이대공원반려견놀이터/라바타운/키자니아 = CONDITIONAL |
| `Ca1z6p7` | 역사관광 | **2** | PLACE_CONDITIONAL_REVIEW | 중랑망우공간(역사 메모리얼), 감사의 정원 |
| **합계** | | **22** | | |

**FULL_INVENTORY_UNRESOLVED_CATEGORY = 0** ✅

### Cy5h2x9 상세 (7건)

| CID | 제목 | 제안 |
|---|---|---|
| KOP000374 | 씨라이프 코엑스아쿠아리움 | PLACE_CORE_CANDIDATE |
| KOP001434 | 서울랜드 | PLACE_CORE_CANDIDATE |
| KOP002192 | 롯데월드 어드벤처 | PLACE_CORE_CANDIDATE |
| KOP037367 | 롯데월드 아쿠아리움 | PLACE_CORE_CANDIDATE |
| KOP028776 | 어린이대공원 반려견 놀이터 | PLACE_CONDITIONAL_REVIEW |
| KOP029502 | 라바타운 | PLACE_CONDITIONAL_REVIEW |
| KOP3o0027 | 키자니아 서울 | PLACE_CONDITIONAL_REVIEW (어린이 대상 체험) |

> **주의**: 이번 TASK에서는 분류 제안만. CATEGORY_CODE_MAP 코드 스크립트 업데이트는 별도 task (수집기 재실행 시).

---

## E. QA 플래그

| 플래그 | 값 |
|---|---|
| SHOPPING_TRAVEL_VALUE_VALIDATED | YES |
| KPOP_CROSS_CATEGORY_VALIDATED | YES |
| KPOP_DISCOVERY_FROM_VISITSEOUL | CONDITIONAL |
| EXPERIENCE_VALUE_VALIDATED | YES |
| FULL_INVENTORY_UNRESOLVED_CATEGORY | **0** |
| TEMPLE_STAY_POLICY | CONDITIONAL (체험/문화, 숙박 제외) |
| HYBE_INSIGHT_IN_VISITSEOUL | NEEDS_VERIFICATION |
| YG_JYP_OFFICE_TYPE | NEEDS_DETAIL_REVIEW (사무소 vs 체험공간) |
