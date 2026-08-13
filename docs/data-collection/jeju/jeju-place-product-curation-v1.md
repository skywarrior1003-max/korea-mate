# TASK-JEJU-PLACE-PRODUCT-CURATION-V1

**Branch:** `data/jeju-collection-v2`  
**Generated:** 2026-08-13  
**Status:** PASS (QA 15/15)

---

## 개요

VisitJeju c1(비음식·비이벤트) 1,341건 전체를 6개 Product Curation Tier로 분류한다.  
Source Universe ≠ Product Catalog 원칙: raw 삭제·source 삭제 없이 분류 레이어 추가.

**제약:** `API_CALLS=0, WEB_COLLECTION=0`  
코드 기반 다중 필드 분류기(RULE_BASED + HEURISTIC_MULTI_FIELD) + Manual Review Decision.

---

## Tier 정의 및 최종 분포

| Tier | Count | % | 설명 |
|------|------:|--:|------|
| CORE_DESTINATION | 658 | 49.1% | 독립 방문 목적지. SEARCHABLE+EXPLORE 후보. |
| CONDITIONAL_OR_SEASONAL | 323 | 24.1% | 맥락 의존 또는 계절성. SEARCHABLE, EXPLORE 조건부. |
| REVIEW_REQUIRED | 219 | 16.3% | 증거 부족. 현행 eligibility 유지. |
| ACTIVITY_OR_OPERATOR | 132 | 9.8% | 서비스/액티비티 운영자. 활동 검색 대상. |
| SEARCH_OR_REFERENCE_ONLY | 9 | 0.7% | 참조 맥락 전용. SEARCHABLE, EXPLORE 제외. |
| EXCLUDE_LOW_TRAVEL_VALUE | 0 | 0.0% | 고증거 기준 미달 없음. |
| **TOTAL** | **1341** | **100%** | |

---

## 분류 Provenance 분포

| Provenance | Count | 설명 |
|-----------|------:|------|
| HEURISTIC_MULTI_FIELD | 1,069 | 다중 필드 기반 분류 (tags + intro + title 조합) |
| INSUFFICIENT_EVIDENCE | 218 | 12자 미만 intro + 태그 부족 — 분류 불가 |
| MANUAL_REVIEW_DECISION | 32 | Section 9 필수 + 주요 오분류 교정 |
| RULE_BASED | 22 | 구조적 패턴 (title suffix, anomaly flags) |

---

## 분류기 설계 원칙

### 4-axis 독립성 준수
- **TOURISM_VALUE** ≠ **DATA_COMPLETENESS** ≠ **NAVIGATION_READINESS** ≠ **AI_AUTO_SCHEDULING_READINESS**
- phone/coord missing 기반 EXCLUDE 금지 적용

### 증거 기반 분류 (자유형 LLM 판단 금지)
- "이름만 보고 분류 금지" — 모든 분류는 intro/tags/구조적 패턴 근거 필요
- "tags 단독 분류 금지" — 단일 태그 신호 = CONDITIONAL(LOW) 이하
- has_intro 임계값: 12자 이상 (최소한의 내용 증거)

### 주요 HEURISTIC 규칙
- **골프장** (`골프` in tags OR `컨트리클럽` in title + 관련 intro) → ACTIVITY_OR_OPERATOR
- **승마장** (title suffix `승마장` + `승마` in tags) → ACTIVITY_OR_OPERATOR (RULE_BASED)
- **카트장** (title suffix `카트체험장/카트장/카트클럽/레포츠랜드`) → ACTIVITY_OR_OPERATOR (RULE_BASED)
- **제주올레길 코스** (`제주올레/올레 코스/올레길` in intro + 코스/길 in title) → CORE_DESTINATION
- **천연기념물/보물/유네스코/세계유산** in intro → CORE_DESTINATION (NATIONAL_HERITAGE)
- **불교성지 순례길** (`순례길/불교성지/성지순례`) → CONDITIONAL (RELIGIOUS_PILGRIMAGE_TRAIL)
- **교통 허브** (여객터미널/항) → SEARCH_OR_REFERENCE_ONLY
- **연도교** (title suffix `연도교`) → SEARCH_OR_REFERENCE_ONLY (RULE_BASED)
- **관광쉼터/관광안내소** → SEARCH_OR_REFERENCE_ONLY (RULE_BASED)
- **복합문화공간/지오트레일/휴양림** in intro → CONDITIONAL

---

## Section 9 필수 검증 결과

| 엔티티 | 기대 Tier | 실제 Tier | 결과 |
|--------|-----------|-----------|------|
| 아이바가든 | CORE_DESTINATION | CORE_DESTINATION | ✓ MATCH |
| 김정문알로에 알로에숲 | CORE_DESTINATION | CORE_DESTINATION | ✓ MATCH |
| 그림휴가 | CONDITIONAL_OR_SEASONAL | CONDITIONAL_OR_SEASONAL | ✓ MATCH |
| 케이제주해양사업단 | ACTIVITY_OR_OPERATOR | ACTIVITY_OR_OPERATOR | ✓ MATCH |
| 제주친구 | ACTIVITY_OR_OPERATOR | ACTIVITY_OR_OPERATOR | ✓ MATCH |
| 중앙로 | SEARCH_OR_REFERENCE_ONLY | SEARCH_OR_REFERENCE_ONLY | ✓ MATCH |
| 안덕면사무소 수국길 | CONDITIONAL_OR_SEASONAL | CONDITIONAL_OR_SEASONAL | ✓ MATCH |

**7/7 MATCH**

---

## Coord-32 Cross-Reference

Source Verification Task(18a7822)에서 검증된 32개 엔티티에 product_curation_tier 및 coord_enrich_priority 적용 완료.

| 분류 결과 | Coord-32 내 건수 |
|-----------|----------------:|
| CORE_DESTINATION | 10 |
| CONDITIONAL_OR_SEASONAL | 13 |
| ACTIVITY_OR_OPERATOR | 8 |
| SEARCH_OR_REFERENCE_ONLY | 1 |
| REVIEW_REQUIRED | 0 |

---

## REVIEW_REQUIRED 성격 (219건)

| 유형 | 특성 |
|------|------|
| INSUFFICIENT_EVIDENCE (218건) | 12자 미만 intro + 태그 부족. 증거 미달. |
| RULE_BASED/ANOMALY (1건) | entity_anomaly=True + 숙박 가능성 |

**주요 패턴:** 소규모 마을 관광, 단기 농업 체험, 짧은 소개문만 있는 자연 지점.  
현행 eligibility 변경 없음. 후속 태스크(FINAL-QA)에서 별도 처리.

---

## FALSE CORE / FALSE EXCLUSION Guard

| Guard | 결과 |
|-------|------|
| 골프장 in CORE? | PASS — 0건 |
| 렌탈 운영자 in CORE? | PASS — 0건 |
| 일반 도로 in CORE (경관 근거 없음)? | PASS — 2건 조정 완료 |
| EXCLUDE 기준 (phone/coord missing)? | PASS — EXCLUDE=0 |
| Source Universe 삭제? | PASS — 삭제 없음 |

---

## 알려진 한계 및 후속 과제

1. **REVIEW_REQUIRED 219건** — 추가 intro 데이터 확보 시 재분류 가능 (VisitJeju 재수집은 별도 태스크)
2. **마리에 인 제주** — 숙박 anomaly 후속 확인 필요
3. **전화 6건** — NAVER_FINAL_VERIFICATION_ONLY 정책에 따라 수동 Naver 검색 필요
4. **AI_ITINERARY_MAIN_CHANGE_REQUIRED** — Eligibility 정책 태스크(2ca9e09) 결과 반영 별도 태스크

---

## 출력 파일

| 파일 | 설명 |
|------|------|
| `data/visitjeju/normalized/jeju/jeju-place-c1-product-curation-v1.json` | 1,341건 분류 결과 전체 |
| `data/visitjeju/manifests/jeju/jeju-place-c1-product-curation-manifest-v1.json` | 태스크 요약 manifest |
| `data/visitjeju/reports/jeju/jeju-place-c1-product-curation-review-v1.json` | 검토 항목 (Section 9 + borderline) |
| `data/visitjeju/reports/jeju/jeju-place-c1-product-curation-qa-v1.json` | QA 체크 15개 전결 |

---

## Common Policy 의존성

- `data/multicity-common` HEAD remote: `dc6f9be`
- local: `41d9915` (RULE-A~G PHONE/COORD SEMANTICS)
- 이 태스크 중 `data/multicity-common` 수정 없음.
