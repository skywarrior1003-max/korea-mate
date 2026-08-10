# 서울 Integrated Travel Value Policy v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 생성일 | 2026-08-10 |
| 적용 범위 | 서울 전체 inventory (VisitSeoul + 추가 source) |
| DB 변경 | 0 |

---

## 0. 핵심 원칙

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NUMERIC_PRUNING_POLICY = FORBIDDEN
CATEGORY_BLANKET_EXCLUSION = FORBIDDEN
RESTAURANT_IS_CORE_TRAVEL_DOMAIN = YES
EVENT_IS_CORE_TIME_SENSITIVE_DOMAIN = YES
SHOPPING_IS_CORE_TRAVEL_DOMAIN = YES
KPOP_IS_CROSS_CATEGORY_DOMAIN = YES
NATURE_IS_CORE_TRAVEL_DOMAIN = YES
```

**어떤 category도 "수가 너무 많다"는 이유로 일괄 제외하거나 수를 줄이지 않는다.**
coverage가 목표이다. 각 record는 7축 Travel Value Gate를 통과해 개별 평가된다.

---

## 1. 7축 Travel Value Gate (TV Gate)

모든 VisitSeoul CID는 아래 7축으로 평가. 플랫폼 구현 시 자동/반자동화 대상.

### TV1 — TRAVEL_PURPOSE_VALUE

"이 콘텐츠가 서울 여행의 이유가 되거나 여행 중 중요 목적이 되는가?"

| 등급 | 기준 |
|---|---|
| HIGH | 방문 자체가 목적. 경복궁, 남산, 롯데월드, K-pop 콘서트 등 |
| MEDIUM | 여행 중 자연스럽게 포함. 명동 식당, 강남 카페, 성수 쇼핑 |
| LOW | 여행 중 우연히 또는 편의 목적. 편의점, 일반 약국 |
| NONE | 여행과 관련 없음 (지역 행정, 이사 서비스 등) |

### TV2 — TRAVELER_UTILITY_VALUE

"외국인 여행자에게 실용적 가치가 있는가?"

| 등급 | 기준 |
|---|---|
| HIGH | 여행자 필수 정보 (좌표, 영업시간, 접근성, 할랄, 비건 등) |
| MEDIUM | 유용하나 대체 가능 |
| LOW | 내국인 위주 정보 |

### TV3 — KOREA_LOCAL_UNIQUENESS

"한국/서울에서만 경험 가능한가?"

| 등급 | 기준 |
|---|---|
| HIGH | 한국 전통문화, K-pop, 한옥/궁궐, 한강 고유 경험, 전통 음식 |
| MEDIUM | 한국적 특성이 있으나 다른 곳에서도 가능 |
| LOW | 범세계적 체인, 일반 상업시설 |

### TV4 — EXPERIENCE_VALUE

"방문자에게 memorable 경험을 제공하는가?"

| 등급 | 기준 |
|---|---|
| HIGH | 체험형, 참여형, 감각적 경험. 달빛기행, 도자기체험, K-pop 공연 |
| MEDIUM | 일반적 방문 경험 |
| LOW | 실용 방문 (쇼핑 소모품, 편의 서비스) |

### TV5 — INTENT_MATCH_POTENTIAL

"정의된 여행자 intent에 매칭 가능한가?"

| 등급 | 기준 |
|---|---|
| HIGH | 3개 이상 intent에 명확히 매칭 |
| MEDIUM | 1~2개 intent 매칭 |
| LOW | intent 매칭 어려움 |

### TV6 — INFORMATION_QUALITY

"VisitSeoul에서 제공하는 정보 품질이 충분한가?"

| 등급 | 기준 |
|---|---|
| HIGH | 좌표 ✅, 영업시간 ✅, 설명 ✅, 전화 ✅ |
| MEDIUM | 좌표 ✅, 최소 1개 이상 추가 필드 |
| LOW | 좌표만 또는 설명만 |
| INSUFFICIENT | 좌표 없음, 설명 없음 — USER_REVIEW 또는 외부 보강 필요 |

### TV7 — CURRENT_USABILITY

"현재 활성/유효한 콘텐츠인가?"

| 등급 | 기준 |
|---|---|
| ACTIVE | 현재 운영 중 |
| SEASONAL | 계절성. 해당 시즌에 ACTIVE |
| RECURRING | 반복성 이벤트 (매년). 다음 회차 예정 |
| UNKNOWN | 상태 불명 — 외부 확인 필요 |
| ENDED | 종료 확인됨 — EXPLORE 기본 숨김, AI=NO |

---

## 2. AI 자격 분류 (ai_itinerary_eligible)

| 분류 | 기준 | 설명 |
|---|---|---|
| `YES` | TV1≥MEDIUM, TV3≥MEDIUM, TV5≥HIGH, TV7=ACTIVE/SEASONAL/RECURRING | AI 추천 자격 확정 |
| `CONDITIONAL` | 일부 축 미달 또는 intent 매칭 조건부 | intent 파라미터 매칭 시 AI 후보 |
| `NO` | TV1=LOW/NONE, 또는 TV7=ENDED, 또는 UTILITY_ONLY | AI 추천 제외 |

### CONDITIONAL 예시

| intent | 조건부 후보 카테고리 |
|---|---|
| `solo_travel` | SOLO_DINING 가능한 restaurant |
| `halal` | HALAL 가능 restaurant, HALAL_VERIFIED=YES |
| `kpop` | K-pop 공연장, K-pop 관련 체험, KPOP 이벤트 |
| `temple_stay` | 템플스테이 등록 사찰 |
| `family` | 어린이 체험관, 테마파크, 가족 공원 |
| `night_view` | 야경 가능 장소 (시간대=야간) |
| `wellness` | 스파, 한방 체험, 명상 |
| `trekking` | 등산로 접근 가능 장소 |

---

## 3. 카테고리별 Travel Value 평가 원칙

### 3-1. PLACE_CORE_CANDIDATE (기존 분류)

- TV Gate 전 항목 MEDIUM 이상
- ai_eligible = YES (기본 후보)
- 대표: 경복궁, 남산서울타워, 명동, 홍대, 63빌딩, 한강공원 (메인 거점)

### 3-2. PLACE_CONDITIONAL_REVIEW

- TV1/TV3/TV5 중 하나 이상 MEDIUM/LOW
- 추가 검토 후 ai_eligible = CONDITIONAL 또는 NO
- 대표: 특정 동네 카페, 일반 공원, 유틸리티성 시설

### 3-3. RESTAURANT_TRACK (1,259건)

모든 1,259건 개별 TV Gate 적용. 일괄 제외 금지.

- `DESTINATION` → TV1=HIGH, TV3≥MEDIUM → ai=CONDITIONAL
- `SPECIALTY_INTEREST` → intent 매칭 (할랄, 비건, 솔로) → ai=CONDITIONAL
- `UTILITY` → TV1=LOW → SEARCHABLE=YES, ai=NO

### 3-4. EVENT_TRACK (1,190건)

- TV7이 핵심 축. ENDED → ai=NO (숨김)
- ACTIVE/UPCOMING → TV1≥HIGH이면 ai=CONDITIONAL 최우선
- RECURRING → 시즌 접근 시 ai=CONDITIONAL

### 3-5. SHOPPING_REVIEW

- TOURISM_FLAGSHIP (신라면세점, K-beauty flagship) → ai=CONDITIONAL (intent: shopping, kbeauty)
- TOURISM_DISTRICT (로컬 시장, 특색 쇼핑) → ai=CONDITIONAL (intent: local_market)
- ORDINARY_COMMERCIAL (대형마트, 일반 체인) → SEARCHABLE=YES, ai=NO

### 3-6. EXPERIENCE_CANDIDATE

- 전통 공예/체험 → TV3=HIGH → ai=CONDITIONAL (intent: traditional_culture)
- Temple Stay → TV3=HIGH → ai=CONDITIONAL (intent: temple_stay)
- 어린이 체험 → TV4=HIGH → ai=CONDITIONAL (intent: family, kids)
- 스파/웰니스 → TV3=MEDIUM → ai=CONDITIONAL (intent: wellness)

### 3-7. NATURE / TREKKING

- 산/트레킹: TV1=HIGH, TV3=HIGH → ai=YES (기본)
- 공원/하천: TV1=MEDIUM → ai=CONDITIONAL (intent에 따라)
- 야경 경험: EXPERIENCE_CONTENT 분류 → ai=CONDITIONAL (intent: night_view)
- 코스 안내 (ROUTE_COURSE): ai=CONDITIONAL (intent: trekking, cycling, walking)

---

## 4. Legacy 1,277건 명칭 정정

```
OLD: EXACT_PRELIMINARY_RETAINED = 1,277
NEW: LEGACY_PRE_TRAVEL_VALUE_DETAIL_POOL = 1,277
```

**이 1,277건은:**
- 분류: PLACE_CORE_CANDIDATE / PLACE_CONDITIONAL_REVIEW / SHOPPING_REVIEW / EXPERIENCE_CANDIDATE
- **Restaurant과 Event는 포함되지 않음** (별도 track)
- 수집 당시: Travel Value Gate 적용 전 상태
- RETAINED_DETAIL_PLAN_READY = NO (TV Gate 통과 전까지 "ready" 아님)
- 향후 TV Gate 적용 시 개별 ai_eligible 판정 예정

---

## 5. 4-Layer Curation 모델

```
A. CURATED_CANONICAL
   └─ KoreaMate 큐레이션 공식 리스트 (예: "서울 TOP 명소 50선")
   └─ 수동 검토 + 다국어 설명 보강

B. EXTERNAL_SEARCHABLE
   └─ VisitSeoul AI=NO 콘텐츠, 좌표+기본 정보 제공
   └─ 여행자 검색 시 표시 (AI 추천 제외)

C. USER_MY_PLACES
   └─ 사용자가 직접 추가한 장소
   └─ 개인화 아이템 — 타인에게 기본 비공개

D. USER_SIGNAL_PROMOTION_CANDIDATE
   └─ 다수 사용자가 추가/방문한 외부 장소
   └─ 일정 임계값 이상이면 B 또는 A 후보로 검토
```

---

## 6. Entity Relation Model 요구사항 (구현 제외, 정의만)

```
PHYSICAL_PLACE
  ├─ EXPERIENCE_CONTENT --experience_at→ PHYSICAL_PLACE
  ├─ EVENT --held_at→ PHYSICAL_PLACE (M:N)
  ├─ ROUTE_COURSE --route_through→ PHYSICAL_PLACE (M:N)
  └─ UTILITY_SERVICE --amenity_of→ PHYSICAL_PLACE

PHYSICAL_PLACE
  ├─ hosting_events: list of EVENT ids
  ├─ nearby_experiences: list of EXPERIENCE_CONTENT ids
  └─ accessibility_amenities: list of UTILITY_SERVICE ids
```

single hosting_place_id 확정 금지 — M:N 관계 필요.

---

## 7. 다국어 정책 (MULTILINGUAL_COVERAGE)

| 언어 | 지원 원칙 |
|---|---|
| 한국어 | VisitSeoul ko 언어 우선 수집 |
| 영어 | multi_lang_list CID 연결 (en suffix) |
| 일본어 | multi_lang_list CID 연결 (ja suffix) |
| 중국어(간체) | multi_lang_list CID 연결 (zh-CN suffix) |
| 기타 | UGC 또는 외부 소스 |

VisitSeoul multi_lang_list에서 동일 콘텐츠의 다국어 CID를 연결하여 단일 entity로 통합.

---

## 8. QA 플래그

| 플래그 | 값 |
|---|---|
| COUNT_TARGET | NOT_DEFINED_BY_DESIGN |
| NUMERIC_PRUNING_POLICY | FORBIDDEN |
| CATEGORY_BLANKET_EXCLUSION | FORBIDDEN |
| TV_GATE_AXES | 7 (TV1~TV7) |
| AI_ELIGIBLE_CLASSES | YES / CONDITIONAL / NO |
| LEGACY_PRE_TRAVEL_VALUE_DETAIL_POOL | 1,277 |
| RETAINED_DETAIL_PLAN_READY | NO |
| ENTITY_RELATION_MODEL | M:N 정의 완료, 구현 제외 |
| MULTILINGUAL_COVERAGE | YES (4개 언어 기준) |
| DB_CHANGE | 0 |
