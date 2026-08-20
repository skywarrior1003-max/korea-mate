# TASK-JEONJU-MULTILINGUAL-OWNER-ENTITY-NORMALIZATION-CORRECTION-V1 State

| 항목 | 값 |
|---|---|
| TASK | TASK-JEONJU-MULTILINGUAL-OWNER-ENTITY-NORMALIZATION-CORRECTION-V1 |
| 완료일 | 2026-08-20 |
| BRANCH | data/jeonju-multilingual-v1 |
| SHA_BEFORE | 6770dc8c596f1acfe93095aaa1bfbe32713559e6 |
| JEONJU_CANONICAL_CHANGED | 0 |
| FINAL_QA | PASS |
| SAFE_TO_CLOSE | YES |
| NEXT_TASK | TASK-JEONJU-MULTILINGUAL-MAIN-HANDOFF |

---

## 작업 내용

V2 gap review 결과에서 Owner entity 정규화 결정을 enrichment/gap/QA에 정확히 반영.
API 재수집 없음. canonical 수정 없음. 파일 필드 정정/추가만 수행.

---

## Owner Confirmed 4개 Normalization Group

### 1. JEONJU_ZOO
- Canonical: **OFF-9784 전주동물원**
- Sub-facility: OFF-16676 전주드림랜드 → `OWNER_CONFIRMED_SUBFACILITY`
- Localized pages: Zoo(EN+JA+ZH) + Dreamland(EN+JA+ZH) = 6개 공식 외국어 페이지
- Status: RESOLVED

### 2. JEONJU_NATIONAL_MUSEUM
- Canonical: **OFF-9756 국립전주박물관**
- Sub-facility: OFF-16104 어린이박물관 → `OWNER_CONFIRMED_SUBFACILITY`
- Localized pages: National(EN+JA+ZH) + Children(EN+JA+ZH) = 6개
- Status: RESOLVED

### 3. NAMBU_MARKET _(Future merge required)_
- Canonical: **PENDING** (남부시장 개념)
- Current rows: OFF-16084 (청년몰), OFF-16085 (야시장) — **둘 다 매칭됨**
- 청년몰은 내부 구성, 야시장은 운영 형태/시간대 콘텐츠
- 이번 작업에서 survivor canonical 결정 안 함
- Status: **FUTURE_MERGE_REQUIRED** → MAIN HANDOFF에서 처리

### 4. OMOKDAE
- Canonical: **OFF-9742 오목대·이목대**
- Area-context: OFF-9774 전주천 → `OWNER_CONFIRMED_AREA_CONTEXT`
- Stream content는 오목대 수변/맥락 정보로 귀속
- Status: RESOLVED

---

## 수정 사항

### enrichment file (9건 업데이트)

| dataSid | locale | entity_relation_type |
|---|---|---|
| 16763 | en | SUBFACILITY |
| 16764 | ja | SUBFACILITY |
| 16765 | zh-CN | SUBFACILITY |
| 16192 | en | SUBFACILITY |
| 16193 | ja | SUBFACILITY |
| 16194 | zh-CN | SUBFACILITY |
| 10029 | en | AREA_CONTEXT |
| 9926 | ja | AREA_CONTEXT |
| 9897 | zh-CN | AREA_CONTEXT |

### gap file (9건 reclassify, 3 cid × 3 locale)

| candidate_id | 이전 | 이후 | owner_parent_cid |
|---|---|---|---|
| OFF-16676 | MAPPING_GAP | OWNER_CONFIRMED_SUBFACILITY | OFF-9784 |
| OFF-16104 | MAPPING_GAP | OWNER_CONFIRMED_SUBFACILITY | OFF-9756 |
| OFF-9774 | MAPPING_GAP | OWNER_CONFIRMED_AREA_CONTEXT | OFF-9742 |

---

## 최종 Coverage (service_universe=236)

### Source Pages vs Deduped Canonical Places

| locale | OFFICIAL_LOCALIZED_CONTENT_RECORDS | MULTILINGUAL_READY_CANONICAL_PLACES | core_ready |
|---|---|---|---|
| EN | 92 | 89 | 85/236 (36.0%) |
| JA | 72 | 69 | 69/236 (29.2%) |
| zh-CN | 72 | 69 | 69/236 (29.2%) |

CONTENT_RECORDS > CANONICAL_PLACES 이유: 동일 canonical에 여러 공식 외국어 페이지 연결됨
(Zoo+Dreamland→전주동물원, National+Children→국립전주박물관, Omokdae original+Stream→오목대·이목대)

### Gap 분류 (EN 기준)

| 유형 | 건수 | 설명 |
|---|---|---|
| NO_VISITJEONJU_LOCALE_RECORD | 133 | KTO-only (VisitJeonju 수록 없음) |
| MAPPING_GAP | 11 | OFFICIAL이나 연결 불가 (VisitJeonju 외국어 페이지 없거나 증거 부족) |
| OWNER_CONFIRMED_SUBFACILITY | 2 | 전주드림랜드, 어린이박물관 |
| OWNER_CONFIRMED_AREA_CONTEXT | 1 | 전주천 |

---

## QA 체크

```
OWNER_NORMALIZATION_GROUPS            = 4
DREAMLAND_MAPPING_GAP                 = NO
CHILDRENS_MUSEUM_MAPPING_GAP          = NO
JEONJUCHEON_MAPPING_GAP               = NO
NAMBU_MARKET_FUTURE_NORMALIZATION     = YES (MAIN HANDOFF)
JEONJU_CANONICAL_CHANGED              = 0
TRANSLATION_USED                      = NO
FALSE_MATCH                           = 0
OWNER_ENTITY_NORMALIZATION_FOR_MAIN_HANDOFF = YES
OWNER_REQUEST_FOR_MAIN_HANDOFF        = YES
```

---

## Main Handoff Owner Request

`OWNER_ENTITY_NORMALIZATION_FOR_MAIN_HANDOFF = YES`

메인 노트북에 전달할 Owner 확정사항:
1. Zoo + Dreamland → 전주동물원 (OFF-9784)
2. National Museum + Children's Museum → 국립전주박물관 (OFF-9756)
3. Youth Mall + Night Market → 남부시장 (물리적 merge는 main에서 schema 검토 후)
4. Jeonjucheon Stream → 오목대·이목대 (OFF-9742) context

보조컴퓨터 제약:
- canonical row 물리적 merge/delete 안 함
- 메인에서 안전하게 normalization 수행
