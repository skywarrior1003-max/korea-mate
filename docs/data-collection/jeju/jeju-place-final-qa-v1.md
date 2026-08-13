# TASK-JEJU-PLACE-FINAL-QA-V1

**Branch:** `data/jeju-collection-v2`  
**Generated:** 2026-08-13  
**Status:** PLACE_FINAL_QA = PASS (27/27)  
**Depends on:** TASK-JEJU-PLACE-PRODUCT-CURATION-V1 (3729793), TASK-JEJU-PLACE-SOURCE-VERIFICATION-TARGETED-V1 (18a7822)

---

## 개요

VisitJeju c1 1,341건에 대한 Final QA 심층 감사.  
Product Curation Tier 교차 검증, 오염도 감사, 검증 좌표 반영, Service Pool 파생.

**제약:** `API_CALLS=0, WEB_COLLECTION=0, KTO_CALLS=0, MAP_API_CALLS=0`

---

## Curation 최종 분포 (QA 교정 후)

| Tier | V1 (3729793) | Final (after QA) | 변경 |
|------|-------------:|-----------------:|------|
| CORE_DESTINATION | 658 | 657 | -1 (쇠소깍해양레저타운 → ACTIVITY) |
| CONDITIONAL_OR_SEASONAL | 323 | 323 | ± 0 |
| REVIEW_REQUIRED | 219 | 218 | -1 (마리에 인 제주 → ACTIVITY) |
| ACTIVITY_OR_OPERATOR | 132 | 134 | +2 |
| SEARCH_OR_REFERENCE_ONLY | 9 | 9 | ± 0 |
| EXCLUDE_LOW_TRAVEL_VALUE | 0 | 0 | ± 0 |
| **TOTAL** | **1341** | **1341** | ✓ |

---

## QA 교정 2건

### 1. 쇠소깍해양레저타운 — CORE_DESTINATION → ACTIVITY_OR_OPERATOR
- **근거:** intro="제주바다 후룸라이드 '쇠소깍 제트보트'". 상업 해양 레저 운영자.
- **원인:** tags=해수욕장,해변이 CORE_TAG_KW에 해당 → 오분류. 해변 위치 ≠ 해변 목적지.
- **교정 provenance:** MANUAL_REVIEW_DECISION, FINAL_QA_CORRECTION

### 2. 마리에 인 제주 — REVIEW_REQUIRED → ACTIVITY_OR_OPERATOR
- **근거:** intro="제주스냅 올인원 토탈샵" + tags=스냅,웨딩스냅,스냅촬영. 웨딩·여행 사진 스튜디오.
- **원인:** intro 12자 이상이나 ACTIVITY_INTRO_KW 미매칭. Anomaly=숙박 후보로 REVIEW 오분류.
- **교정 provenance:** MANUAL_REVIEW_DECISION, FINAL_QA_CORRECTION

---

## 서비스 Pool 파생

| Pool | 엔티티 수 | 설명 |
|------|----------:|------|
| DEFAULT_EXPLORE | 657 | CORE_DESTINATION — EXPLORE=YES |
| CONDITIONAL_DISCOVERY | 323 | CONDITIONAL — EXPLORE=CONDITIONAL |
| ACTIVITY_OPERATOR | 134 | ACTIVITY_OR_OPERATOR — 활동 검색 |
| REFERENCE_ONLY | 9 | SEARCH_OR_REFERENCE_ONLY |
| REVIEW_HOLD | 218 | REVIEW_REQUIRED — EXPLORE=NO, AI=NO |
| **SOURCE_UNIVERSE** | **1341** | **전체 (삭제 없음)** |

### AI 자동화 Pool
| Pool | 건수 | 기준 |
|------|-----:|------|
| AI_AUTO_READY | 647 | CORE + coord + no_anomaly = AI=YES |
| AI_AUTO_CONDITIONAL | 333 | CORE(no_coord/anomaly) + CONDITIONAL = AI=CONDITIONAL |
| AI_EXCLUDED | 361 | ACTIVITY/SEARCH/REVIEW/EXCLUDE |

---

## 검증 좌표 반영 (4건)

Source Verification Task(18a7822) KTO 매칭 결과를 Service Catalog에 반영. Provenance 보존.

| 엔티티 | verified_lat | verified_lon | 유형 | KTO contentid |
|--------|-------------:|-------------:|------|---------------|
| 제주 카약올레 | 33.4623617 | 126.3104870 | VERIFIED_SOURCE_ANCHOR | 2738709 |
| 영아리 | 33.3268526 | 126.7169964 | VERIFIED_SOURCE_COORDINATE | 2433925 |
| 진지동굴 | 33.1991211 | 126.2935110 | VERIFIED_SOURCE_COORDINATE | 2765245 |
| 드르쿰다 in 성산 | 33.4444984 | 126.9191262 | VERIFIED_SOURCE_COORDINATE | 2755445 |

> **원칙:** canonical raw 수정 없음. `jeju-place-service-catalog-v1.json`의 `effective_lat/lon` 필드에 반영. `effective_coord_source=KTO:{contentid}` provenance 기록.

---

## Eligibility 최종값

| 필드 | YES | CONDITIONAL | NO | 합계 |
|------|----:|------------:|---:|-----:|
| SEARCHABLE | 1341 | 0 | 0 | 1341 |
| EXPLORE | 655 | 325 | 361 | 1341 |
| AI_ITINERARY | 647 | 333 | 361 | 1341 |
| USER_CAN_SELECT | 1332 | 0 | 9 | 1341 |
| USER_CAN_SAVE | 1332 | 0 | 9 | 1341 |
| COORD_NAV_READY | 1313 | — | 28 | 1341 |

> **USER_PICK ≥ AI_AUTO 준수:** VIOLATION_COUNT=0

---

## 오염 감사 결과

| 항목 | 후보 | 확인 결과 |
|------|-----:|----------|
| 숙박 오염 | 6 | CONFIRMED_MISMATCH=0 (온천/사진스튜디오/박물관. 마리에 인 제주 교정 완료) |
| 음식 오염 | 0 | PASS |
| 이벤트 오염 | 0 | PASS (영천동 해바라기축제 이미 EVENT_TYPE_MISMATCH_CANDIDATE 태깅됨) |
| False CORE (골프) | 0 | PASS |
| False CORE (운영자) | 1→0 | 쇠소깍해양레저타운 교정 완료 |
| False ACTIVITY (운영자 아님) | 0 | 렛츠런파크 제주 ACTIVITY 유지 (경마장, 천연기념물=제주마 품종 아님) |

---

## Section 9 필수 검증

| 엔티티 | 최종 Tier | EXPLORE | AI | 결과 |
|--------|-----------|---------|----|----|
| 아이바가든 | CORE_DESTINATION | YES | YES | ✓ |
| 김정문알로에 알로에숲 | CORE_DESTINATION | YES | YES | ✓ |
| 그림휴가 | CONDITIONAL_OR_SEASONAL | CONDITIONAL | CONDITIONAL | ✓ |
| 케이제주해양사업단 | ACTIVITY_OR_OPERATOR | NO | NO | ✓ |
| 제주친구 | ACTIVITY_OR_OPERATOR | NO | NO | ✓ |
| 중앙로 | SEARCH_OR_REFERENCE_ONLY | NO | NO | ✓ |
| 안덕면사무소 수국길 | CONDITIONAL_OR_SEASONAL | CONDITIONAL | CONDITIONAL | ✓ |

**7/7 MATCH**

---

## 보류·유보 항목

| 항목 | 상태 | 비고 |
|------|------|------|
| 전화 6건 NEEDS_VERIFICATION | DEFERRED | NAVER_FINAL_VERIFICATION_ONLY. PHONE_UNRESOLVED_BLOCKS_PLACE_FINAL=NO |
| REVIEW_REQUIRED 218건 | DEFERRED_HOLD | EXPLORE=NO, AI=NO 유지. 수요 신호 기반 재분류 |
| NO_SOURCE_COORDINATE 27건 | NAVIGATION_UNRESOLVED | VisitJeju-only 로컬 자산. coord missing ≠ tourism value 감소 |
| 제주환상자전거길 | FOLLOWUP_REQUIRED | ROUTE_COLLECTION 별도 태스크. CONDITIONAL 유지 |
| 쇠소깍 (자연) | CONDITIONAL 유지 | source evidence 부족, 모델 상식 승격 금지 |

---

## 출력 파일

| 파일 | 유형 | 크기 |
|------|------|------|
| `data/visitjeju/normalized/jeju/jeju-place-c1-product-curation-v1.json` | updated (2 corrections) | 1.48MB |
| `data/visitjeju/normalized/jeju/jeju-place-final-eligibility-v1.json` | new | 742KB |
| `data/visitjeju/normalized/jeju/jeju-place-service-catalog-v1.json` | new | 1.08MB |
| `data/visitjeju/reports/jeju/jeju-place-final-qa-v1.json` | new | 5.4KB |
| `data/visitjeju/reports/jeju/jeju-place-final-review-v1.json` | new | 6.3KB |
| `docs/data-collection/jeju/jeju-place-final-qa-v1.md` | new | this file |

---

## Common Policy 의존성

- `data/multicity-common` HEAD remote: `dc6f9be`
- local: `41d9915` (RULE-A~G PHONE/COORD SEMANTICS)
- 이 태스크 중 `data/multicity-common` 수정 없음.
- **COMMON_POLICY_CURATION_CANDIDATE:** YES (6-tier curation + Source Universe/Product Catalog 분리 승격 후보. 후속 멀티시티 태스크에서 결정.)

---

## 다음 태스크

1. **전화 6건 Naver 수동 확인** — NAVER_FINAL_VERIFICATION_ONLY (별도 세션)
2. **TASK-JEJU-FOOD-COLLECTION-V1** — VisitJeju c4 음식점 1,870건
3. **TASK-JEJU-EVENT-COLLECTION-V1** — KTO searchFestival2 areaCode=39

**PLACE_COMPLETE = YES · SAFE_TO_START_JEJU_FOOD = YES**
