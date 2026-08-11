# 서울 Routing V1→V2 Correction Report

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION |
| 완료일 | 2026-08-10 |
| START_SHA | 6d09d4c |
| BRANCH | data/seoul-collection-v1 |
| API 호출 | 0 |
| 자동 변경 | 0 |

---

## A. Start State

```
START_SHA = 6d09d4c
BRANCH = data/seoul-collection-v1
INPUT = data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl (3,765건)
V1_ROUTING = data/seoul-source-audit/seoul-full-enrichment-routing-v1.jsonl (3,765건)
BLANKET_RULE_DEFECTS = 2 (야간 감사에서 확인)
```

---

## B. Blanket Defect Fix

### BLANKET_01 — Ck6n0w6(주점) 전체 F (정책 위반)

**V1 rule**: `com_ctgry_sn == Ck6n0w6 → F (no signal check)`

**V2 fix**: 3-tier keyword evidence routing 적용
```
Tier A (destination/cultural): 루프탑, 야경, 전통주, 양조장, 재즈, 한류스타, K-pop,
                                클럽, 한강뷰, 남산뷰, 최초, 7080, 호텔 라운지
Tier C (utility/atmosphere):   포차, 포장마차, 외국인, 이자카야, 수제맥주, 특색
Tier F (external search):      위 키워드 없는 일반 주점
```

**추가 blanket defect 발견**: 없음 (Shopping blanket audit: Ct1z4k9 3건 모두 B, 현재 무해)

### BLANKET_02 — Cl2d2s1(교육시설) 전체 H (정책 위반)

**V1 rule**: `com_ctgry_sn == Cl2d2s1 → H (no signal check)`

**V2 fix**: evidence-based routing 적용
```
A: 체험, 전시, 박물관, 과학관, 한옥, 복합문화공간, 최초, 어린이/청소년 체험
C: 아카데미, 회화수업, 한국어수업, 교육과정
F: 위 키워드 없는 일반 도서관/생활시설
```

---

## C. Bar/Pub 60건 재라우팅

| 구분 | V1 | V2 | 변화 |
|---|---|---|---|
| B (기존 detail 보유) | 4 | 4 | 0 |
| A (destination/cultural) | 0 | 17 | +17 |
| C (utility/atmosphere) | 0 | 9 | +9 |
| F (external search) | 60 | 34 | -26 |
| H | 0 | 0 | 0 |
| **합계** | **64** | **64** | |

```
BAR_PUB_UPGRADE_SIGNAL_COUNT = 28  (야간 audit 기준)
BAR_PUB_ACTUAL_ROUTING_CHANGED_COUNT = 26
  (신호 보유 28건 중 26건 주요 routing 변경 — 2건은 F 유지 판정)
```

**주요 A 상향 사례**:

| CID | 제목 | 이유 |
|---|---|---|
| KOP001154 | 올댓재즈 | 재즈, 국내 최초 재즈 바 |
| KOP011191 | 클럽 NB2 | 클럽, 한류스타, K-pop |
| KOP011556 | 파크 하얏트 서울 더라운지 | 루프탑, 야경, 전망 |
| KOP036858 | 느린마을 양조장 강남점 | 전통주, 양조장 |
| KOP036985 | 한강주조 | 전통주, 주조 |
| KOP2h7itr | 남산술클럽 | 남산뷰, 야경 |

**C 분류 사례**:

| CID | 제목 | 이유 |
|---|---|---|
| KOP011051 | 삼거리포차 | 포차, 포장마차 |
| KOP014272 | 논현포차골목 | 포차 |
| KOPhnvr4s | 문래포차1422 | 포차 |

---

## D. 교육시설 13건 재라우팅

| 구분 | V1 | V2 |
|---|---|---|
| H | 13 | 0 |
| A | 0 | 9 |
| C | 0 | 1 |
| F | 0 | 3 |

**A 상향 (9건)**:

| CID | 제목 | 이유 |
|---|---|---|
| KOP001912 | 서울시민 광나루안전체험관 | 체험, 국내 최초 재난 체험관 |
| KOP011622 | 서울에너지드림센터 | 전시, 체험, 국내 최초 |
| KOP029759 | 중랑 청소년 체험의 숲 운영센터 | 체험, 어린이/청소년, 도전/모험 |
| KOP030789 | 서울책보고 | 복합문화공간, 한국 고유 헌책방 |
| KOP031055 | 서울특별시교육청과학전시관 | 과학관, 전시, 체험 |
| KOPn1ua1r | 서울시립과학관 | 과학관, 전시, 어린이 |
| KOPojrz90 | 청운문학도서관 | 한옥, 특화 도서관 |
| KOP001596* | 정독도서관 | — |
| KOP011010* | 국립중앙도서관 | — |

*정독도서관/국립중앙도서관은 도서관이지만 요약에 "지식 문화" 요소가 있어 경계 케이스.

**C 상향 (1건)**:

| CID | 제목 | 이유 |
|---|---|---|
| KOP5gy81t | 한글파크아카데미 | 한국어 수업, 아카데미 |

**F 분류 (3건)**:

| CID | 제목 | 이유 |
|---|---|---|
| KOP029564 | 서울여성플라자 | 시민 공간, 일반 civic facility |
| KOP035570 | 모두의 학교 | 일반 평생학습센터 |
| KOPgcblme | 중앙고등학교 | 일반 학교 |

---

## E. Shopping/Mart Blanket 검사

```
BLANKET_03 (Ct1z4k9 → F): 현재 3건 모두 B (기존 detail 보유)
→ 실제 영향 없음. 그러나 V2 script에 K-food/specialty 신호 확인 로직 추가.
향후 신규 mart 레코드 추가 시 blanket F 방지.
SHOPPING_BLANKET_REAUDITED = YES
```

---

## F. Route/SCT V2

```
ROUTE_COURSE_PRIOR_COUNT (V1)       = 0
ROUTE_COURSE_V2_COUNT               = 1
EDITORIAL_MULTI_ROUTE_V2_COUNT      = 1  (KOP015873 서울 둘레길 코스 안내)
PHYSICAL_PLACE_WITH_ROUTE_V2_COUNT  = 1
SCT_CHANGED_TOTAL                   = 2
SEOUL_DULLEGIL_21_COURSES_AS_INDEPENDENT_CIDS = NO (재확인)
```

SCT 변경 내용:

| 유형 | V1 | V2 | 건수 |
|---|---|---|---|
| PHYSICAL_PLACE → EDITORIAL_MULTI_ROUTE_CONTENT | 1 | 1 | 1 |
| PHYSICAL_PLACE → PHYSICAL_PLACE_WITH_ROUTE_CONTENT | 0 | 1 | 1 |

야간 audit에서 식별된 SCT 재분류 16건 중 2건이 V2 SCT 필드에 반영.  
나머지 14건은 routing 변경 없이 주석/manifest 기록.

---

## G. V1→V2 Delta

| 항목 | 수치 |
|---|---|
| PRIMARY_ROUTING_CHANGED_COUNT | 39 |
| SECONDARY_ROUTING_CHANGED_COUNT | 0 |
| SOURCE_CONTENT_TYPE_CHANGED_COUNT | 2 |
| TOTAL_DELTA_RECORDS | 41 |

**Primary 변경 분해**:

| V1 → V2 | 건수 |
|---|---|
| F → A | 17 (bar 17) |
| F → C | 9 (bar 9) |
| H → A | 9 (edu 9) |
| H → C | 1 (edu 1) |
| H → F | 3 (edu 3) |
| **합계** | **39** |

**변경 이유별**:

| 이유 | 건수 |
|---|---|
| BLANKET_01_FIX (주점 재라우팅) | 26 |
| BLANKET_02_FIX (교육시설 재라우팅) | 13 |
| **합계** | **39** |

**전체 Primary Routing 분포 변화**:

| Primary | V1 | V2 | Delta |
|---|---|---|---|
| A | 1,318 | 1,344 | +26 |
| B | 254 | 254 | 0 |
| C | 921 | 931 | +10 |
| D | 1,152 | 1,152 | 0 |
| F | 72 | 49 | -23 |
| H | 48 | 35 | -13 |
| **합계** | **3,765** | **3,765** | |

---

## H. Review Queue

```
REVIEW_ISSUE_ROWS_V2 = blanket_fix 적용 레코드 + H routing 레코드 (중복 포함)
REVIEW_UNIQUE_CIDS_V2 = 각 CID 1회만 계산
(야간 audit review queue 526 ≠ unique review CIDs — 동일 CID에 복수 issue 가능)

AUTO_MERGE = 0
AUTO_DELETE = 0
AUTO_EXCLUDE = 0
DUPLICATE_AUTO_CONFIRM = 0
```

---

## I. Full 3,765 QA

```
INPUT_TOTAL = 3765
OUTPUT_TOTAL = 3765
UNIQUE_CID = 3765
EVERY_CID_HAS_PRIMARY_ROUTING = YES
PRIMARY_ROUTING_UNKNOWN = 0
PRIMARY_ROUTING_SUM = 3765
BYTE_IDENTICAL_REPRODUCIBLE = YES
SOURCE_MUTATION = NO
V1_PRESERVED = YES  (V1 파일 삭제/덮어쓰기 없음)
API_CALLS = 0
```

---

## J. Restaurant/Event/Nature/Shopping/Experience 정책 유지 확인

| 영역 | V1 → V2 | 정책 유지 |
|---|---|---|
| Restaurant (주점 제외) | C/A 유지 | ✅ |
| Restaurant 주점 | F → A/C/F (3-tier) | ✅ blanket fix |
| Event 1,152 | D 유지 | ✅ |
| Nature 119 | B 유지 | ✅ |
| Shopping | A/B/F 유지 | ✅ |
| Experience 120건 | A 유지 | ✅ |
| PLACE_CORE | A 유지 | ✅ |
| 숙박 (한옥 예외 유지) | A/F 유지 | ✅ |

Travel Value 7축 (TV1~TV7) framework 유지.  
45개 intent taxonomy 유지.

---

## K. Next Collection Priority

```
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1

WHY_THIS_NEXT (V2 결과 기반):
  - PLACE_CORE A routing: 약 194건 (기존 detail 미보유)
  - blanket fix는 routing script 변경으로 완료 — 별도 collection task 불필요
  - EXPERIENCE_CANDIDATE A: ~108건 동시 처리 가능
  - Event D: 1,152건이나 date pipeline 설정 비용 높음
  - Restaurant C: 931건이나 건당 AI 가치 낮음
  - PLACE_CORE + EXPERIENCE → 단일 VisitSeoul detail 배치로 TV gate 전 판정
  - ai_eligible=YES 확정 → AI 일정 서울 서비스 시작 최소 조건
```

---

## L. Multicity Handoff 추가 사항

(multicity-main-data-handoff-v1.md에 반영)

```
RULE_MH_09 (수정): 주점 category blanket F = 정책 위반.
  → keyword evidence 3-tier (A destination / C utility / F default)
RULE_MH_10 (수정): 교육시설 category blanket H = 정책 위반.
  → 체험/전시/문화 keyword → A, 교육과정 keyword → C, 나머지 → F
RULE_MH_11 (신규): 대형마트 category latent blanket F.
  → K-food/specialty signal → A, 없으면 F (현재 3건 B로 무해하나 script 보정 완료)
```

---

## M. Files

| 파일 | 유형 | 건수 |
|---|---|---|
| `scripts/run-seoul-full-enrichment-routing-v2.py` | NEW | — |
| `data/seoul-source-audit/seoul-full-enrichment-routing-v2.jsonl` | NEW | 3,765 |
| `data/seoul-source-audit/seoul-full-enrichment-routing-v1-v2-delta.jsonl` | NEW | 41 |
| `data/seoul-source-audit/seoul-full-enrichment-routing-v2-manifest.json` | NEW | 1 |
| `docs/data-collection/seoul/seoul-full-enrichment-routing-v2-summary.md` | NEW | — |
| `docs/data-collection/seoul/seoul-routing-v1-v2-correction-report.md` | NEW | — |
| `docs/data-collection/seoul/seoul-next-collection-priority-v1.md` | UPDATED | — |
| `docs/data-collection/multicity-main-data-handoff-v1.md` | UPDATED | — |

---

## N. Safety

```
VISITSEOUL_API_CALLS = 0
KTO_API_CALLS = 0
WEB_CALLS = 0
DB_CHANGE = 0
SQL_EXECUTED = 0
SRC_MODIFIED = 0
UI_MODIFIED = 0
DEPLOY_EXECUTED = 0
MASTER_PUSH = FORBIDDEN (준수)
BUSAN_GYEONGJU_BRANCH_MODIFIED = 0
GIT_ADD_A = FORBIDDEN (준수)
SECRET_LOGGED = 0
V1_DELETED = 0
V1_OVERWRITTEN = 0
AUTO_MERGE = 0
AUTO_DELETE = 0
AUTO_EXCLUDE = 0
```

---

## O. Git

```
START_SHA = 6d09d4c
BRANCH = data/seoul-collection-v1
FINAL_SHA = caa72bb
PUSH = YES (data/seoul-collection-v1 → origin)
```

---

## 최종 QA 플래그

```
ROUTING_V2_READY                 = YES
BLANKET_RULE_DEFECTS_FIXED       = YES
CATEGORY_ALONE_FINAL_ROUTING     = FORBIDDEN
BAR_PUB_REAUDITED                = YES
EDUCATION_REAUDITED              = YES
SHOPPING_BLANKET_REAUDITED       = YES
ROUTE_COURSE_CORRECTED           = YES
INPUT_TOTAL                      = 3765
OUTPUT_TOTAL                     = 3765
EVERY_CID_HAS_PRIMARY_ROUTING    = YES
AUTO_MERGE                       = 0
AUTO_DELETE                      = 0
AUTO_EXCLUDE                     = 0
NEW_API_CALLS                    = 0
BYTE_IDENTICAL_REPRODUCIBLE      = YES
NEXT_COLLECTION_READY            = YES
RECOMMENDED_NEXT_TASK            = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1
```

TASK-SEOUL-FULL-ENRICHMENT-ROUTING-V2-CORRECTION 작업을 완료했습니다.
