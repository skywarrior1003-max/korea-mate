# 서울 Full Enrichment Routing V2 Summary

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION |
| 생성일 | 2026-08-10 |
| AS_OF | 2026-08-10 |
| Policy Version | v2.0.0 |
| 입력 | seoul-visitseoul-full-inventory-v1.jsonl (3,765건) |
| 출력 | seoul-full-enrichment-routing-v2.jsonl (3,765건) |
| Script | scripts/run-seoul-full-enrichment-routing-v2.py |
| API 호출 | 0 |
| V1 보존 | YES (삭제·덮어쓰기 없음) |

---

## A. V2 핵심 변경 사항

V1 대비 수정한 사항만 기술. 나머지 정책은 V1 동일.

| 변경 항목 | V1 | V2 |
|---|---|---|
| BLANKET_01: Ck6n0w6(주점) | `→ F (무조건)` | `→ A/C/F (3-tier keyword evidence)` |
| BLANKET_02: Cl2d2s1(교육시설) | `→ H (무조건)` | `→ A/C/F (evidence-based)` |
| BLANKET_03: Ct1z4k9(마트) | `latent → F` | `K-food signal → A, 없으면 → F` |
| SCT Route 감지 | 없음 | 둘레길/route keyword → SCT 보정 |
| CATEGORY_ALONE_FINAL_ROUTING | 있음 | FORBIDDEN (V2 전면 금지) |

---

## B. Primary Routing 분포

| Primary | V1 | V2 | Delta |
|---|---|---|---|
| A — DETAIL_REQUIRED_NOW | 1,318 | **1,344** | +26 |
| B — DETAIL_ALREADY_SUFFICIENT | 254 | 254 | 0 |
| C — UTILITY_ENRICHMENT_REQUIRED | 921 | **931** | +10 |
| D — EVENT_DATE_ENRICHMENT_REQUIRED | 1,152 | 1,152 | 0 |
| F — EXTERNAL_SEARCH_LAYER_SUITABLE | 72 | **49** | −23 |
| H — HOLD_USER_REVIEW_REQUIRED | 48 | **35** | −13 |
| **합계** | **3,765** | **3,765** | |

---

## C. V1→V2 Delta (41건)

```
PRIMARY_ROUTING_CHANGED_COUNT = 39
  BLANKET_01_FIX (주점 재라우팅) = 26  (F→A: 17, F→C: 9)
  BLANKET_02_FIX (교육시설 재라우팅) = 13  (H→A: 9, H→C: 1, H→F: 3)

SECONDARY_ROUTING_CHANGED_COUNT = 0
SOURCE_CONTENT_TYPE_CHANGED_COUNT = 2
  PHYSICAL_PLACE → EDITORIAL_MULTI_ROUTE_CONTENT = 1
  PHYSICAL_PLACE → PHYSICAL_PLACE_WITH_ROUTE_CONTENT = 1
```

---

## D. 주점(Ck6n0w6) V2 결과

```
총 64건 = B(4) + A(17) + C(9) + F(34)

BAR_PUB_UPGRADE_SIGNAL_COUNT = 28  (야간 audit 기준)
BAR_PUB_ACTUAL_ROUTING_CHANGED_COUNT = 26

A (17건): 루프탑/야경/전통주/재즈/한류/클럽 등 destination/cultural 신호 보유
C (9건): 포차/포장마차/외국인 등 utility/atmosphere 신호 보유
F (34건): 위 신호 없는 일반 주점 (변경 없음)
B (4건): 기존 detail 보유 (변경 없음)
```

---

## E. 교육시설(Cl2d2s1) V2 결과

```
총 13건 = A(9) + C(1) + F(3)  [V1: H(13)]

A (9건): 체험관/과학관/복합문화공간/한옥/어린이 시설
  - 광나루안전체험관, 에너지드림센터, 청소년체험의숲
  - 서울책보고, 과학전시관, 서울시립과학관, 청운문학도서관 등
C (1건): 한글파크아카데미 (한국어 교육 경험)
F (3건): 일반 civic facility (여성플라자, 평생학습센터, 일반학교)
```

---

## F. SOURCE_CONTENT_TYPE V2

| SCT | V1 | V2 |
|---|---|---|
| EVENT | 1,186 | 1,184 |
| PHYSICAL_PLACE | 2,474 | 2,472 |
| EXPERIENCE_CONTENT | 105 | 105 |
| EDITORIAL_MULTI_ROUTE_CONTENT | 0 | 1 |
| PHYSICAL_PLACE_WITH_ROUTE_CONTENT | 0 | 1 |
| ROUTE_COURSE | 0 | 0 |
| 기타 | — | 2 |

```
ROUTE_COURSE_CORRECTED = YES
SEOUL_DULLEGIL_21_COURSES_AS_INDEPENDENT_CIDS = NO
DULLEGIL_EDITORIAL_MAIN_CID = KOP015873 (서울 둘레길 코스 안내)
```

---

## G. 출력 파일

| 파일 | 위치 | 건수 |
|---|---|---|
| `seoul-full-enrichment-routing-v2.jsonl` | data/seoul-source-audit/ | 3,765 |
| `seoul-full-enrichment-routing-v1-v2-delta.jsonl` | data/seoul-source-audit/ | 41 |
| `seoul-full-enrichment-routing-v2-manifest.json` | data/seoul-source-audit/ | 1 |
| `seoul-full-enrichment-routing-v2-summary.md` | docs/data-collection/seoul/ | — |
| `seoul-routing-v1-v2-correction-report.md` | docs/data-collection/seoul/ | — |

---

## H. 절대 유지 정책 (V2에서도 동일)

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NUMERIC_PRUNING_POLICY = FORBIDDEN
CATEGORY_BLANKET_EXCLUSION = FORBIDDEN
CATEGORY_ALONE_FINAL_ROUTING = FORBIDDEN

Restaurant = CORE TRAVEL DOMAIN
Event = CORE TIME-SENSITIVE TRAVEL DOMAIN
Nature/Trekking/Route = CORE TRAVEL DATA

Routing은 retention/exclusion 결과가 아니라
"다음으로 필요한 enrichment 경로"이다.
```

---

## I. 다음 단계

```
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1

WHY:
  PLACE_CORE A routing 약 194건 (non-B PLACE_CORE)
  EXPERIENCE_CANDIDATE A 약 108건 동시 처리 가능
  V2 blanket fix → routing script 레벨 완료 (별도 collection 불필요)
  VisitSeoul detail 단일 배치로 TV gate 전 판정 가능
  ai_eligible=YES 확정 → AI 일정 서울 서비스 시작 최소 조건

NEXT_COLLECTION_READY = YES
```

---

## QA 플래그

```
ROUTING_V2_READY                 = YES
INPUT_TOTAL                      = 3765
OUTPUT_TOTAL                     = 3765
EVERY_CID_HAS_PRIMARY_ROUTING    = YES
PRIMARY_ROUTING_UNKNOWN          = 0
BYTE_IDENTICAL_REPRODUCIBLE      = YES
V1_PRESERVED                     = YES
API_CALLS                        = 0
AUTO_MERGE                       = 0
AUTO_DELETE                      = 0
AUTO_EXCLUDE                     = 0
SOURCE_MUTATION                  = NO
BLANKET_RULE_DEFECTS_FIXED       = YES (2/2)
```
