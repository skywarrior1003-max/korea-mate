# TASK-JEJU-PLACE-ELIGIBILITY-V1 — 완료 보고서

**태스크**: 제주 c1 관광지 1,341건 5축 Eligibility 분류  
**브랜치**: `data/jeju-collection-v2`  
**완료 일자**: 2026-08-13  
**API_CALLS**: 0 / **WEB_COLLECTION**: 0 / **SECRET_LEAK**: 0

---

## §1. 개요

VisitJeju c1 카테고리 전수 수집 결과(1,341건, `ba266c5`)에 대해  
Multicity 공통 Eligibility Policy (`data/multicity-common` @ `dc6f9be`)의 5축 분류를 적용했다.

분류 기준:
- 공통 정책 파일: `docs/data-collection/multicity-place-eligibility-policy-v1.md`
- 회귀 검증 픽스처: `data/multicity-common/multicity-eligibility-regression-fixtures-v1.json`
- API 호출 없음 — 기존 canonical 데이터에서 결정론적 분류

---

## §2. 입력 데이터

| 파일 | 경로 | SHA-256 (records) |
|------|------|-------------------|
| canonical | `data/visitjeju/normalized/jeju/jeju-place-c1-canonical-v1.json` | `4321c702...` |
| 레코드 수 | 1,341건 | 정렬 기준: `contentsid` 오름차순 |

---

## §3. 분류 알고리즘 (v2 확정본)

### §3.1 핵심 설계 원칙

**alltag 필드 스코프 제한 (v1 버그 수정)**  
VisitJeju API의 `alltag` 필드는 *시설 편의 태그* (주차장=주차장 보유, 화장실=화장실 보유)를 포함한다.  
이 태그는 장소 유형을 나타내지 않고 편의시설 유무를 나타낸다.  
v1에서 `has_kw([title, alltag], UTIL_KW)`로 "주차장"·"화장실"을 검사했을 때  
621건(46.3%)이 정상 관광지임에도 EXTERNAL_OR_USER_PLACE로 오분류되었다.

v2 수정:
- **Utility 판별**: `title` ONLY — 해당 장소 자체가 주차장/정류장인지 판별
- **긍정적 증거**: `title + alltag` 모두 사용 가능 (관광 가치 확인)
- UTIL_KW에서 "주차장"·"화장실" 제거 (편의시설 태그, 장소 유형 아님)

### §3.2 Place Class 결정 규칙

```
Priority 1 — UTILITY_STRICT (title only)
  "정류장" or "주차장" in title → EXTERNAL_OR_USER_PLACE

Priority 2 — UTILITY_FLAG (title only, → REVIEW_REQUIRED)
  "화장실" or "검표소" or "매표소" or "관광안내소" in title

Priority 3 — ACCOMMODATION_RISK (title only, → REVIEW_REQUIRED)  
  "게스트하우스" or "민박" or "모텔" or "콘도미니엄" in title

Default — CORE_TRAVEL_PLACE
  VisitJeju c1 = 제주관광공사 공식 관광지 → 기본값 CORE
```

### §3.3 5축 결정 규칙 (CORE_TRAVEL_PLACE 기준)

| 축 | 조건 | 값 |
|----|------|-----|
| SEARCHABLE | 모든 CORE | YES |
| EXPLORE_ELIGIBLE | coord_valid + info≥MEDIUM | YES |
| EXPLORE_ELIGIBLE | coord_valid + BASIC | CONDITIONAL |
| EXPLORE_ELIGIBLE | !coord_valid + address 있음 | CONDITIONAL |
| EXPLORE_ELIGIBLE | !coord_valid + !address | REVIEW_REQUIRED |
| AI_ITINERARY | activity booking-required | CONDITIONAL |
| AI_ITINERARY | !coord_valid | REVIEW_REQUIRED |
| AI_ITINERARY | info=BASIC | REVIEW_REQUIRED |
| AI_ITINERARY | default CORE + valid coord | YES |
| USER_CAN_SELECT | 모든 CORE | YES |
| USER_CAN_SAVE | 모든 CORE | YES |

---

## §4. 분류 결과

### §4.1 Place Class 분포

| Place Class | 건수 | 비율 |
|-------------|------|------|
| CORE_TRAVEL_PLACE | 1,336 | 99.6% |
| REVIEW_REQUIRED | 5 | 0.4% |
| EXTERNAL_OR_USER_PLACE | 0 | 0.0% |
| **합계** | **1,341** | **100%** |

> c1은 제주관광공사 공식 선정 관광지이므로 CORE 우위는 정상이다.  
> EXTERNAL_OR_USER_PLACE=0: 버스정류장·주차장 단독 entity가 c1에 없음 확인.

### §4.2 5축 결과

| 축 | YES | CONDITIONAL | NO | REVIEW_REQUIRED | 합계 |
|----|-----|-------------|-----|-----------------|------|
| SEARCHABLE | 1,336 | 0 | 0 | 5 | 1,341 |
| EXPLORE_ELIGIBLE | 1,304 | 27 | 0 | 10 | 1,341 |
| AI_ITINERARY_ELIGIBLE | 1,225 | 81 | 0 | 35 | 1,341 |
| USER_CAN_SELECT | 1,336 | 0 | 0 | 5 | 1,341 |
| USER_CAN_SAVE | 1,336 | 0 | 0 | 5 | 1,341 |

**NO=0**: c1 공식 관광지에서 완전 불가 장소 없음 (정책 일치)

### §4.3 EXPLORE_ELIGIBLE=CONDITIONAL (27건)

좌표 누락 또는 INVALID_SOURCE_ZERO(0.0)로 지도 표시가 부정확하나  
주소가 있어 표시 가능한 장소들.

- INVALID_SOURCE_ZERO 2건: 제주 카약올레, 병악현무암지대
- MISSING_COORDINATE 25건: 좌표 미제공

→ KTO Gap Fill 대상 포함됨

### §4.4 AI_ITINERARY_ELIGIBLE=CONDITIONAL (81건)

예약·결제가 필요한 체험·액티비티 업체들.

주요 패턴:
- 승마장 (9건): 노을승마장, 한라승마장, 송당승마장 등
- 카약·서핑·다이빙 (20+건): 비체올린, 월정투명카약, 제주카약 등
- 체험마을·농장 (10+건): 해품은체험농장, 테우마을 수원리 농어촌체험마을 등
- 패러글라이딩·번지·집라인 (5건)

> AI 여행 일정 생성 시 사용자 선호 의사 확인 후 포함.

---

## §5. REVIEW_REQUIRED 5건 세부 내역

| contentsid | title | 사유 |
|------------|-------|------|
| CNTS_000000000020606 | 아라리오뮤지엄동문모텔2 | ENTITY_TYPE_REVIEW: "모텔" 포함 — 실제 아트뮤지엄, 수동 확인 후 CORE로 승격 권장 |
| CNTS_000000000020607 | 아라리오뮤지엄 동문모텔 | 동일 — 아라리오뮤지엄 동문 건물 |
| CNTS_300000000012851 | 쇠소깍 테우 매표소 | UTILITY_ADJACENT_REVIEW: 테우 체험 매표소 — 체험 접수처, SEARCHABLE=YES 후보 |
| CNTS_300000000013415 | 마라도가는여객선매표소 | UTILITY_ADJACENT_REVIEW: 마라도 여객선 매표소 — 여행 경로상 필수, 검토 필요 |
| CNTS_300000000013568 | 제주도 코난비치 스노쿨링 대여점 월정뷰게스트하우스 | ENTITY_TYPE_REVIEW: "게스트하우스" 포함 — 복합 업체, 유형 확인 필요 |

**조치 권장:**
- 아라리오뮤지엄 2건: 수동 검토 → CORE_TRAVEL_PLACE, EXPLORE=YES, AI=YES 승격
- 매표소 2건: 모체 체험/여객선이 AI 일정 대상이면 TRAVEL_USEFUL_PLACE로 통합 검토
- 코난비치 1건: 스노쿨링 업체로 확인되면 AI=CONDITIONAL

---

## §6. 좌표 현황 및 KTO 목표

### §6.1 전체 좌표 현황

| 상태 | 건수 | 비율 |
|------|------|------|
| VALID (33-34°N, 125.9-127.2°E) | 1,309 | 97.6% |
| MISSING_COORDINATE | 30 | 2.2% |
| INVALID_SOURCE_ZERO (0.0/0.0) | 2 | 0.1% |
| **합계** | **1,341** | |

### §6.2 KTO 보강 대상 (SEARCHABLE=YES 기준)

| 목표 | 건수 | 비율 |
|------|------|------|
| 좌표 Gap | 32 | 2.4% |
| 전화번호 Gap | 145 | 10.8% |

→ `TASK-JEJU-KTO-PLACE-GAP-FILL-V1` 후속 작업 대상

**좌표 Gap 우선순위:**  
EXPLORE=CONDITIONAL 27건 + REVIEW_REQUIRED 5건 = 32건이 KTO 좌표 목표.  
KTO searchKeyword (areaCode=39, addr= 검색)로 좌표 보강 시도.

---

## §7. 결정론 검증

| 항목 | 값 |
|------|-----|
| Run 1 SHA-256 | `e9a0836b307d2cf4dba453f827093111d3f10c7a824116a2d0b5e5b4ee080e4d` |
| Run 2 SHA-256 | `e9a0836b307d2cf4dba453f827093111d3f10c7a824116a2d0b5e5b4ee080e4d` |
| DETERMINISM | **CONFIRMED_RUN1_EQ_RUN2** |
| 정렬 기준 | `contentsid` 오름차순 고정 |
| 분류 규칙 | 결정론적 조건문 (AI 분류 없음) |

---

## §8. QA 체크포인트

| 항목 | 결과 | 기준 |
|------|------|------|
| ENTITY_LOSS | 0 | 1341 in = 1341 out |
| DUPLICATE_ID_COUNT | 0 | 중복 없음 |
| 모든 축 합계 = 1341 | PASS | YES+COND+NO+REVIEW=1341 |
| NO = 0 | PASS | c1 공식 관광지에서 완전 제외 없음 |
| MAIN_IMPORT | 0 | 프로덕션 미반영 |
| PRODUCTION_WRITE | 0 | |
| SECRET_LEAK | 0 | |
| API_CALLS | 0 | |
| WEB_COLLECTION | 0 | |
| RAW_SOURCE_MODIFIED | 0 | canonical 수정 없음 |
| ZERO_COORD_USED_AS_VALID | 0 | 0.0 좌표 = INVALID 처리 |
| MULTILINGUAL_ANOMALY | 2건 허용 | CONT_ 레거시 ID (만장굴 등) |

---

## §9. v1 버그 사후 기록

### 버그: alltag 편의시설 태그 과매칭 (v1, 미커밋)

**증상**: 621건(46.3%)이 EXTERNAL_OR_USER_PLACE로 오분류  
**원인**: `has_kw([title, alltag], UTIL_KW)`에서 "주차장"·"화장실"이 alltag의 편의시설 태그와 매칭  
- "공용주차장" (편의시설 보유 표시) → "주차장" 키워드 매칭 → 546건 오분류  
- "화장실" (화장실 보유 표시) → 521건 오분류  

**예시 오분류**: 약천사(사찰), 표선해수욕장(해변), 카멜리아힐(정원), 큰바리메오름(오름)  
**수정**: UTIL 검사 범위를 `title` only로 제한, "주차장"·"화장실" UTIL_KW 제거  
**v1 파일 상태**: 미커밋 — git HEAD는 ba266c5로 유지, v2 결과로 덮어씀

---

## §10. 산출물 파일

| 파일 | 용도 | 레코드 수 |
|------|------|-----------|
| `data/visitjeju/normalized/jeju/jeju-place-c1-eligibility-v1.json` | 5축 분류 결과 | 1,341 |
| `data/visitjeju/reports/jeju/jeju-place-eligibility-review-v1.json` | 리뷰 큐 + 이상 목록 | 37 (REVIEW 대상) |
| `data/visitjeju/manifests/jeju/jeju-place-kto-targets-v1.json` | KTO Gap Fill 목표 | coord=32, phone=145 |
| `data/visitjeju/reports/jeju/jeju-place-eligibility-qa-v1.json` | QA 전체 항목 | — |
| `docs/data-collection/jeju/jeju-place-eligibility-v1.md` | 본 완료 보고서 | — |

**SHA-256** (eligibility records): `e9a0836b307d2cf4dba453f827093111d3f10c7a824116a2d0b5e5b4ee080e4d`

---

## §11. 다음 단계

1. **TASK-JEJU-KTO-PLACE-GAP-FILL-V1** (미설계)  
   KTO `searchKeyword` API (areaCode=39)로 좌표 32건 + 전화번호 145건 보강  
   대상: `jeju-place-kto-targets-v1.json`

2. **TASK-JEJU-FOOD-COLLECTION-V1** (미착수)  
   VisitJeju c4 음식점 1,870건 수집 → Eligibility 분류

3. **TASK-JEJU-EVENT-COLLECTION-V1** (미착수)  
   KTO `searchFestival2` (areaCode=39) 축제·행사 수집

4. **REVIEW_REQUIRED 5건 수동 처리**  
   아라리오뮤지엄 2건 → CORE 승격 권장  
   매표소 2건, 복합업체 1건 → 유형 확인 후 결정

---

*TASK-JEJU-PLACE-ELIGIBILITY-V1 PASS — 2026-08-13*  
*API_CALLS=0 / DETERMINISM=CONFIRMED / SECRET_LEAK=0 / JEJU_DATA_CHANGE=0 (기존 canonical 불변)*
