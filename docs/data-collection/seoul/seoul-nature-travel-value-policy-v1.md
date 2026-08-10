# 서울 Nature Travel Value 정책 문서 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-VISITSEOUL-NATURE-TREKKING-TRAVEL-VALUE |
| 생성일 | 2026-08-10 |
| 적용 범위 | 서울 (정책 원칙은 전 도시 확장 적용 가능) |
| DB 변경 | 0 (정책/문서화 ONLY — schema/DB 구현 이번 task 금지) |
| 실증 근거 | 119건 VisitSeoul detail 호출 결과 |

---

## SECTION 1 — Nature Travel Value 인텐트 매트릭스

사용자의 자연/트레킹 여행 의도를 **19개 intent 값**으로 정의.
각 intent는 AI 일정 생성 시 place eligibility CONDITIONAL 매칭 기준으로 사용.

| Intent | 정의 | 대응 장소 유형 | VisitSeoul 카테고리 |
|---|---|---|---|
| `nature` | 자연 환경 방문 | 산, 공원, 하천, 자연공원 | Cu5u8d4, Ce9z7g9, Cp3b3j9, Cw8j0y7 |
| `hiking` | 등산/산행 | 산, 계곡, 등산로 | Cu5u8d4 + "등산" keyword |
| `trekking` | 장거리 트레킹/둘레길 | 둘레길, 산책 코스 | Cu5u8d4 + "둘레길" keyword |
| `walking` | 도심 산책/워킹 | 공원, 하천변, 산책로 | Ce9z7g9, Cw8j0y7 |
| `cycling` | 자전거 라이딩 | 한강공원, 하천 자전거 코스 | Co0g3x0 + "자전거" keyword |
| `river` | 강/하천 방문 | 한강, 청계천, 양재천 등 | Cw8j0y7, Co6c2n2 + 한강 keyword |
| `mountain` | 산/봉우리 방문 | 수락산, 도봉산, 북한산 등 | Cu5u8d4 |
| `coast` | 해안 방문 | NOT_AVAILABLE_IN_SEOUL | — |
| `park` | 공원 방문 | 서울숲, 올림픽공원, 한강공원 등 | Ce9z7g9, Cp3b3j9 |
| `viewpoint` | 전망대/뷰포인트 | 남산서울타워, 북악스카이웨이, 서울스카이 | Cl5y4k0 |
| `sunset` | 일몰 감상 | 하늘공원, 노을공원, 남산 | Ce9z7g9 + "노을" keyword |
| `night_view` | 야경 감상 | 야경 시리즈 8건, 반포대교야경 | Cl5y4k0 + "야경" keyword |
| `photography` | 사진 촬영 명소 | 야경, 공원, 랜드마크 | Cl5y4k0, Ce9z7g9 (서울사진맛집 태그) |
| `picnic` | 피크닉/소풍 | 한강공원, 서울숲, 올림픽공원 | Ce9z7g9 |
| `active_travel` | 활동형 여행 (하이킹+사이클+수영) | 북한산, 한강, 수영장 | Cu5u8d4, Co0g3x0 |
| `solo_outdoor` | 혼자 야외 활동 | 둘레길, 솔로투어코스 | "나혼자", "솔로" keyword |
| `family_outdoor` | 가족 야외 활동 | 어린이대공원, 서울대공원, 올림픽공원 | Ce9z7g9 |
| `couple_outdoor` | 커플 야외 활동 | 반포대교야경, 세빛섬, 서울달 | Cl5y4k0 + 낭만 keyword |
| `seasonal_nature` | 계절 자연 (벚꽃/단풍/눈) | 하늘공원 억새, 벚꽃 명소, 겨울 눈썰매장 | 계절 keyword |

### Intent → VisitSeoul 카테고리 매핑 요약

```
mountain    → Cu5u8d4 (자연관광 > 자연경관(산))
hiking      → Cu5u8d4 + "등산" post_desc
trekking    → Cu5u8d4 + "둘레길" / walking_route 유형
walking     → Ce9z7g9 (도시공원), Cw8j0y7 (하천)
cycling     → Co0g3x0 (레저스포츠시설) + "자전거"
river       → Cw8j0y7 (자연경관(하천)) + Co6c2n2
park        → Ce9z7g9, Cp3b3j9
viewpoint   → Cl5y4k0 (랜드마크관광) + "전망"
night_view  → Cl5y4k0 + "야경" / 야경 시리즈 CID
coast       → NOT_AVAILABLE_IN_SEOUL (서울 내륙 도시)
```

---

## SECTION 2 — PLACE_VALUE vs PLACE_BASED_EXPERIENCE_VALUE 분리 정책

> **중요**: schema/DB 구현 이번 task 금지. 정책/collector enrichment requirement만 문서화.

### 2-1. 정의

| 개념 | 의미 | 모델링 |
|---|---|---|
| **PLACE_VALUE** | 장소 자체에 내재적 방문 가치가 있음 | 장소 entity — AI 일정에 단독 포함 가능 |
| **PLACE_BASED_EXPERIENCE_VALUE** | 장소에서의 활동/시간대/계절 경험이 여행 가치 | experience entity — 활동/시간 컨텍스트 필요 |

### 2-2. 구분 기준 (Rules)

```
RULE PE-1: 활동 없이 방문만으로도 의미 있는 장소 → PLACE_VALUE
RULE PE-2: 특정 활동(사이클링, 수영, 캠핑)이 없으면 방문 가치 미약 → PLACE_BASED_EXPERIENCE_VALUE
RULE PE-3: 시간대(야경, 일몰) 의존 → PLACE_BASED_EXPERIENCE_VALUE (time-based)
RULE PE-4: 계절(벚꽃, 단풍, 눈썰매) 의존 → PLACE_BASED_EXPERIENCE_VALUE (season-based)
RULE PE-5: 루트(둘레길, 자전거 코스) — 시작점이 아닌 경로 자체가 가치 → ROUTE_EXPERIENCE_VALUE
```

### 2-3. 실증 예시

| 장소 | 모델 | 이유 |
|---|---|---|
| 북한산 (수락산, 도봉산 등) | PLACE_VALUE | 산 자체가 방문 목적. 등산 없이 방문해도 의미 있음. |
| 청계천 | PLACE_VALUE | 도시 하천 산책로. 걷지 않아도 방문 의미 있음. |
| 선유도 공원 | PLACE_VALUE | 생태공원 자체가 목적. |
| 뚝섬 한강공원 수영장 | PLACE_BASED_EXPERIENCE_VALUE | 수영이 없으면 수영장 방문 의미 없음. 여름만 운영. |
| 한강 자전거 코스 | ROUTE_EXPERIENCE_VALUE | 경로 자체가 가치. 시작점 ≠ 목적지. |
| 남산서울타워 야경 | PLACE_BASED_EXPERIENCE_VALUE (time-based) | 야간에만 의미 있음. 낮 방문은 별도 entity. |
| 하늘공원 억새 | PLACE_BASED_EXPERIENCE_VALUE (seasonal) | 가을에만 의미. |
| 서울 둘레길 코스 안내 | ROUTE_EXPERIENCE_VALUE | 156.5km 21개 코스 — 장소 아닌 루트. |
| 북한산국립공원 | PLACE_VALUE | 공원 자체가 목적 (내부 코스 다수). |

### 2-4. VisitSeoul 모델링 관찰

VisitSeoul은 PLACE_VALUE와 PLACE_BASED_EXPERIENCE_VALUE를 동일 스키마로 표현.
예: 남산서울타워(CID A)와 남산서울타워 야경(CID B)이 별도 CID로 공존.

**플랫폼 구현 요구사항** (schema/DB 결정은 MAIN):
- 야경/계절 경험은 기반 PLACE entity와 `experience_of` 관계 필요
- Route entity는 route 유형 플래그 필요 (`entity_type: route`)
- 계절/시간대 필터링을 위한 `season`, `time_of_day` 속성 필요

---

## SECTION 3 — Event-Place Relation 정책

### 3-1. 관찰된 패턴

VisitSeoul은 이벤트와 장소를 **별도 CID**로 관리:

| 장소 CID | 장소명 | 이벤트 CID | 이벤트명 |
|---|---|---|---|
| Cw8j0y7 계열 | 양재천&탄천 | Cd4y5u1 계열 | 양재천 벚꽃 등 축제 (3개 CID) |
| Ce9z7g9 계열 | 불광천 지역 | Cv7s8m5 계열 | 불광천 벚꽃축제 '은평의 봄' |
| Cp3b3j9 계열 | 한강공원, 난지캠핑장 | Cd4y5u1 계열 | 한강몽땅 여름축제 |
| Ce9z7g9 계열 | 뚝섬/여의도 한강공원 | Cd4y5u1 계열 | 뚝섬 한강공원 눈썰매장 개장 |

### 3-2. 자연 장소 이벤트 관계 원칙

```
RULE EP-1: 이벤트 entity는 독립 CID를 가짐 — PLACE entity와 합치지 않음.
RULE EP-2: 이벤트는 hosting_place 속성으로 PLACE entity를 참조.
RULE EP-3: PLACE entity의 AI 일정 추천과 이벤트 추천은 분리.
           PLACE = AI_ITINERARY_ELIGIBLE (조건 충족 시)
           EVENT = CONDITIONAL (기간 내 + 사용자 intent 매칭 시만)
RULE EP-4: 자연 장소의 계절 이벤트(벚꽃, 단풍, 눈썰매)는
           PLACE entity의 seasonal_highlights로 참조 가능.
           별도 이벤트 collector task에서 수집.
RULE EP-5: 이벤트 기간 외에도 PLACE는 유효 — EVENT 종료가 PLACE 제거 사유 아님.
```

### 3-3. EVENT_PLACE_RELATION_REQUIRED = YES

**구현 필요 사항** (schema/DB 결정은 MAIN):
- `events.hosting_place_id` → `city_spots.id` 참조
- 이벤트 기간 인덱스 (start_date, end_date)
- AI 일정에서 현재 날짜와 이벤트 기간 교차 필터링

---

## SECTION 4 — Food/Utility Relation 정책

### 4-1. 관찰된 패턴

자연 장소와 연결된 음식/편의 시설 레코드:

| CID | 제목 | 트랙 | 연결 자연 장소 |
|---|---|---|---|
| KOP012734 | 한강생태 | RESTAURANT_TRACK | 한강 |
| KOP013761 | 한강치킨 | RESTAURANT_TRACK | 한강 |

자연 장소 내/인근 편의 시설은 RESTAURANT_TRACK / SHOPPING_REVIEW로 분류됨.

### 4-2. 자연 장소 음식/편의 관계 원칙

```
RULE FU-1: 자연 장소 내/인근 식당·카페는 RESTAURANT_TRACK 유지.
           자연 장소 entity에 합치지 않음.
RULE FU-2: 자연 장소 detail 수집 시 nearby_food_cids 참조 목록 구성 가능.
RULE FU-3: AI 일정에서 자연 장소 추천 시 → 인근 식당 co-recommendation 가능.
RULE FU-4: 한강공원 내 편의시설(매점, 자전거 대여) →
           platform이 운영시간/위치 정보로 보완. VisitSeoul source 없을 수 있음.
```

---

## SECTION 5 — User-Generated Enrichment Role

### 5-1. VisitSeoul에서 제공하지 않는 자연/트레킹 데이터

| 데이터 유형 | VisitSeoul 제공 여부 | 사용자 기여 가능 여부 |
|---|---|---|
| 코스별 GPS 트랙 (KML/GPX) | ❌ 없음 | ✅ 가능 (Strava/Komoot 연동 또는 직접 업로드) |
| 등산 코스별 거리/소요시간 | ❌ 없음 (텍스트만) | ✅ 가능 (코스 리뷰) |
| 코스별 난이도 실측 | ❌ 없음 | ✅ 가능 (사용자 평가) |
| 계절별 최적 시기 | ❌ 없음 | ✅ 가능 (방문 후기) |
| 실시간 혼잡도 | ❌ 없음 | ✅ 가능 (실시간 제보) |
| 뷰포인트 내 사진 명소 정보 | ❌ 없음 | ✅ 가능 (사진 + 위치) |
| 접근성 실측 정보 | 일부 있음 | ✅ 보완 가능 |
| 주차/자전거 보관 실시간 | ❌ 없음 | ✅ 가능 |

### 5-2. 우선 보완 대상 (플랫폼 의사결정 필요)

1. **서울 둘레길 21개 코스**: 개별 코스 거리/소요시간/난이도
   - VisitSeoul: 전체 합계(156.5km)만 1개 CID(KOP015873)로 제공
   - 사용자 기여 또는 공식 API(서울둘레길 공식 사이트: `https://gil.seoul.go.kr`) 연동 필요

2. **북한산 등산 코스**: 의상능선, 백운대, 칼바위 등 코스별 데이터
   - VisitSeoul: 북한산국립공원 단일 CID(KOP000369)
   - 공식 출처: 북한산국립공원 공식 사이트 / 국립공원공단 API

3. **야경 최적 시간대**:
   - VisitSeoul: 시간 정보 없음
   - 사용자 기여 (일몰 시각 기반 자동 계산 가능)

### 5-3. USER_ROUTE_ENRICHMENT_ROLE 원칙

```
RULE URE-1: VisitSeoul에서 제공하지 않는 루트 상세 데이터는
            사용자 생성 콘텐츠(UGC) 또는 외부 API로 보완.
RULE URE-2: UGC route 데이터는 별도 entity로 관리.
            VisitSeoul PLACE entity에 직접 머지 금지.
RULE URE-3: UGC 데이터는 provenance 표시 필수
            (source: user_contributed, contributor_id, created_at).
RULE URE-4: 사용자 기여 route 데이터는 admin 검토 후 platform 표시.
RULE URE-5: 공식 외부 API(서울둘레길, 국립공원공단)에서 구조화 데이터 수집 가능 시
            → 별도 collector task로 수집. 이번 task 범위 아님.
```

---

## SECTION 6 — 요약 플래그

| 플래그 | 값 |
|---|---|
| NATURE_TRAVEL_VALUE_POLICY | **VALIDATED** |
| TREKKING_ROUTE_DATA_AVAILABLE_IN_VISITSEOUL | **PARTIAL** |
| PLACE_BASED_EXPERIENCE_MODEL_REQUIRED | **YES** |
| EVENT_PLACE_RELATION_REQUIRED | **YES** |
| USER_ROUTE_ENRICHMENT_ROLE | **DOCUMENTED** |
| NATURE_INTENTS_DEFINED | 19개 (coast=NOT_AVAILABLE_IN_SEOUL) |
| SCHEMA_DB_CHANGE_THIS_TASK | **NO** |

---

## SECTION 7 — MAIN 구현 요구사항 (정책 → 구현 브리지)

> 모두 MAIN 결정 대상. 이 task에서는 문서화만.

| 요구사항 | 우선순위 | 설명 |
|---|---|---|
| PLACE_VALUE / PLACE_BASED_EXPERIENCE 분류 | HIGH | 야경 series 8건 + 계절 이벤트 처리 |
| event-place 관계 연결 | HIGH | hosting_place_id 참조 |
| route entity 타입 | MEDIUM | 서울 둘레길, 한강 자전거 코스 모델링 |
| nature intent 매칭 필터 | MEDIUM | 19개 intent → category 코드 매핑 |
| user route enrichment | LOW | UGC API + 외부 API 연동 |
| coast intent | LOW | 서울은 해당 없음, 제주 등 해안 도시에서 적용 |

---

## SECTION 8 — 참조 파일

| 파일 | 설명 |
|---|---|
| `docs/data-collection/seoul/seoul-nature-trekking-value-live-validation-v1.md` | Live 검증 결과 (119건 detail) |
| `data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl` | 전체 inventory (3,765건) |
| `docs/data-collection/multicity-main-data-handoff-v1.md` | MAIN 인수인계 (MAIN CRITICAL section) |
