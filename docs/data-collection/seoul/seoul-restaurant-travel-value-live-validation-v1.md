# 서울 Restaurant Travel Value Live Validation v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 실행일 | 2026-08-10 |
| DETAIL_CALLS | 40건 (RESTAURANT_TRACK 샘플) |
| 전체 RESTAURANT_TRACK | 1,259건 |
| DB 변경 | 0 |

---

## A. 정책 원칙

> **RESTAURANT_IS_CORE_TRAVEL_DOMAIN = YES**

Restaurant을 별도 track으로 분리한 이유는 데이터 lifecycle과 수집 구조가 다르기 때문이지, 중요도가 낮아서가 아니다.

음식/카페 방문은 서울 여행자의 핵심 목적 중 하나. COUNT TARGET 없음. CATEGORY_BLANKET_EXCLUSION 금지.

---

## B. 샘플 구성 (40건)

| 유형 | 주요 예시 |
|---|---|
| 한식 전문점 | 사랑방칼국수, 평안도 족발집, 불이아 |
| 일식 | 야마모토스시, 이즈미, 기소야 |
| 중식 | 차이797, 타워차이, 싱카이 |
| 서양식 | 양키스 그릴, 더킹스, 워킹온더클라우드, 파파호, 도이치하우스 |
| 동남아/기타 | 리틀사이공(베트남), 구스토타코(멕시코), 루나아시아 |
| 인도/중동(할랄) | 케르반(터키), 강가(인도), 자프란, 델리인디아 |
| 카페/베이커리 | 스왈로 베이커리 카페, 여기인가 서촌카페, 카페 상국 |
| 채식/비건 | 꼭시넬, 릭십, 푸드떼, 카무플라주 |
| 바/라운지 | 에반스, 글램 라운지, 펍휘트니, 버뮤다삼각지 |

---

## C. Traveler Utility Signal 탐지 결과

| Signal | 탐지 건수 | 비율 | VisitSeoul 제공 방식 |
|---|---|---|---|
| `signature` (대표메뉴) | 6 / 40 | 15.0% | 설명 텍스트 |
| `cafe_destination` | 7 / 40 | 17.5% | 카테고리 코드 (카페/찻집) |
| `halal` | 5 / 40 | 12.5% | 설명 텍스트 (케르반, 강가, 자프란, 델리인디아 등) |
| `vegetarian` | 4 / 40 | 10.0% | 설명 텍스트 |
| `family` | 3 / 40 | 7.5% | 설명 텍스트 |
| `ordering` (주문방식) | 3 / 40 | 7.5% | 설명 텍스트 (키오스크, QR) |
| `waiting` (웨이팅) | 2 / 40 | 5.0% | 설명 텍스트 |
| `reservation` (예약) | 2 / 40 | 5.0% | 설명 텍스트 |
| `solo` (혼밥) | 1 / 40 | 2.5% | 설명 텍스트 |
| `late_night` (심야) | 1 / 40 | 2.5% | 설명 텍스트 (영업시간) |
| `allergy` (알레르기) | 0 / 40 | 0% | NOT_AVAILABLE |
| `foreign_menu` (외국어 메뉴) | 0 / 40 | 0% | NOT_AVAILABLE (structured) |

---

## D. 외국인 여행자 중요 정보 VisitSeoul 가용성 분석

| 정보 유형 | VS 구조화 필드 | VS 텍스트 추출 | 기타 소스 | 사용자 기여 |
|---|---|---|---|---|
| 대표 메뉴 | ❌ | ⚠️ 일부 | 구글/네이버 리뷰 | ✅ |
| 가격대 | ❌ | ⚠️ 일부 | 구글/네이버 | ✅ |
| 영업시간 | ⚠️ extra.cmmn_use_time | ✅ (일부) | — | ✅ |
| 입장료/무료 여부 | ✅ extra.trrsrt_use_chrge | — | — | — |
| 주소/위치 | ✅ traffic.adres | — | — | — |
| 좌표 | ✅ traffic.map_position_x/y | — | — | — |
| 지하철 접근 | ✅ traffic.subway_info | — | — | — |
| 전화번호 | ✅ extra.cmmn_telno | — | — | — |
| 공식 홈페이지 | ✅ extra.cmmn_hmpg_url | — | — | — |
| 솔로 다이닝 가능 여부 | ❌ | ⚠️ 드물게 | 구글/네이버 리뷰 | ✅ |
| 채식/비건 메뉴 여부 | ❌ | ⚠️ 일부 | 해피카우, 구글 | ✅ |
| 할랄 인증 여부 | ❌ | ⚠️ 일부 (설명문) | 할랄코리아 | ✅ |
| 알레르기 정보 | ❌ | ❌ | 공식 메뉴 | ✅ |
| 외국어 메뉴 여부 | ❌ | ❌ | 구글 리뷰 | ✅ |
| 키오스크/주문 방식 | ❌ | ⚠️ 드물게 | — | ✅ |
| 예약 필요 여부 | ❌ | ⚠️ 일부 | 구글 예약 | ✅ |
| 웨이팅 정보 | ❌ | ⚠️ 드물게 | 네이버 줄서기 | ✅ |
| 아침식사 운영 여부 | ❌ | ⚠️ 드물게 | — | ✅ |
| 심야 운영 여부 | ❌ | ⚠️ extra.cmmn_use_time | — | ✅ |
| 가족/어린이 적합 여부 | ❌ | ⚠️ 드물게 | — | ✅ |
| 접근성 (휠체어 등) | ⚠️ extra.disabled_facility | — | — | ✅ |

### 핵심 gap: SOLO_DINING, FOREIGN_LANGUAGE_MENU, ALLERGY, HALAL_CERTIFIED

이 4개 속성은 외국인 여행자 utility에서 가장 중요하지만
VisitSeoul structured 필드로는 확인 불가.

**보강 전략:**
- 할랄 인증: 한국이슬람교 연합회 / 할랄코리아 공식 리스트 연동
- 채식/비건: 해피카우(HappyCow) API 또는 UGC
- 알레르기: 공식 메뉴 데이터 없음 → UGC 필수
- 솔로 다이닝: UGC (사용자 경험 기반)

---

## E. Travel Value 분류 원칙

### DESTINATION_RESTAURANT (AI 후보)

의도적으로 찾아가는 식당. 서울/한국에서만 경험 가능한 가치.

예시:
- 한국 전통 식당 (삼청각 — 전통 공연 + 한식)
- 한강뷰/전망 식당 (워킹온더클라우드)
- 정통 한국 요리 (평안도 족발집)
- 외국인 맛집 큐레이션 등재 식당

AI 자격: `AI_ITINERARY_ELIGIBLE = CONDITIONAL`
(intent: `food_trip`, `korean_cuisine`, `traditional_food`)

### UTILITY_RESTAURANT (SEARCHABLE, AI 미포함)

외국인 여행자가 식사 목적으로 찾을 수 있지만 여행 대표 목적지는 아닌 식당.

예시:
- 일반 근처 식당, 배달 위주 식당
- 특이한 여행 가치 없는 일반 음식점

AI 자격: `AI_ITINERARY_ELIGIBLE = NO`
(SEARCHABLE=YES, USER_CAN_SELECT=YES 유지)

### SPECIALTY_INTEREST_RESTAURANT (AI CONDITIONAL)

특정 여행 intent에 강하게 매칭:
- 할랄/무슬림 친화 → `intent: halal`
- 채식/비건 → `intent: vegetarian, vegan`
- 혼밥/솔로 → `intent: solo_travel`
- 아침식사 → `intent: breakfast`
- 심야 → `intent: late_night`
- 이색 체험 식당 → `intent: unique_experience`

---

## F. RESTAURANT 1,259건 전략

| 항목 | 값 |
|---|---|
| COUNT_TARGET | NOT_DEFINED_BY_DESIGN |
| BULK_EXCLUDE | 금지 |
| CATEGORY_BLANKET_EXCLUSION | 금지 |

대신:

1. **Travel Value Gate 7축** 적용 (별도 task)
2. **Destination restaurant** → `AI_ITINERARY_ELIGIBLE = CONDITIONAL`
3. **Specialty interest** → intent 태그 추가
4. **VisitSeoul source 우선** — 공식 큐레이션된 식당은 기본 HIGH QUALITY
5. **Field gap 보강** → UGC + 외부 API (할랄, 비건, 접근성)

---

## G. 추가 발견 — 카페 (café) 유형

RESTAURANT_TRACK 내 카페(Cx0t8m5 코드) = 7건 sample에서 탐지.

외국인 여행자에게:
- 카페 호핑 (cafe hopping) = 독립 travel intent
- 사진 명소형 카페 = `photography`, `couple_outdoor` intent
- 성수/을지로/익선동 특색 카페 = `trendy_seoul` intent

VisitSeoul 카페 데이터:
- 카테고리 코드 `Cx0t8m5` (음식 > 카페/찻집): 전체 inventory에 다수 포함
- 주소/좌표 제공 ✅
- 운영시간 일부 ✅
- 분위기/특색 설명: ⚠️ 텍스트에 일부

---

## H. QA 플래그

| 플래그 | 값 |
|---|---|
| RESTAURANT_IS_CORE_TRAVEL_DOMAIN | YES |
| RESTAURANT_DETAIL_SAMPLE | 40건 |
| RESTAURANT_SUCCESS_RATE | 40/40 (100%) |
| SOLO_DINING_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| HALAL_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| VEGETARIAN_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| ALLERGY_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| FOREIGN_MENU_STRUCTURED_FIELD | NOT_AVAILABLE_IN_VISITSEOUL |
| COORDINATES_AVAILABLE | 95%+ |
| HOURS_AVAILABLE | extra.cmmn_use_time (일부) |
| COUNT_TARGET | NOT_DEFINED_BY_DESIGN |
| CATEGORY_BLANKET_EXCLUSION | FORBIDDEN |
