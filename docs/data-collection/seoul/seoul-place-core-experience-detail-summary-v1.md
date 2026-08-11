# 서울 PLACE_CORE + EXPERIENCE Detail Collection Summary v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-PLACE-CORE-AND-EXPERIENCE-DETAIL-COLLECTION-V1-R1 |
| 완료일 | 2026-08-11 |
| START_SHA | 802d163 (ROUTING-V2-CORRECTION HEAD) |
| BRANCH | data/seoul-collection-v1 |
| SCRIPT | scripts/run-seoul-place-core-experience-detail-collection-v1.py |

---

## A. 수집 범위

| Collection Domain | 건수 | 대상 |
|---|---|---|
| PLACE_CORE | 194 | PLACE_CORE_CANDIDATE A-routing, 기존 detail 미보유 |
| EXPERIENCE | 107 | EXPERIENCE_CANDIDATE A-routing, 기존 detail 미보유 |
| TEMPLE_STAY | 1 | TEMPLE_STAY_CANDIDATE (KOP0pzgtj 국제선센터 템플스테이) |
| V2_RECOVERED | 9 | BLANKET_02_FIX 교육시설 A-routing 복원분 |
| **PLAN_TOTAL** | **311** | |

```
BAR_PUB_EXCLUDED_FROM_THIS_TASK = 17  (→ TASK-SEOUL-RESTAURANT-UTILITY-ENRICHMENT-V1)
DUPLICATE_PLAN_CIDS = 0
EXISTING_DETAIL_INCLUDED = 0
SAFETY_CEILING = 400  (초과 시 HARD STOP)
```

---

## B. API 호출 결과

```
SOURCE = VisitSeoul contents/info (POST)
API_UNIQUE_CIDS_CALLED   = 311
API_TOTAL_ATTEMPTS       = 311
API_SUCCESS              = 311
API_FAILURE              = 0
EMPTY_RESPONSE           = 0
AUTH_FAIL                = 0
IDENTITY_MISMATCH        = 0
PARSE_ERROR              = 0
```

---

## C. 기존 Detail 현황 (수집 전)

| 구분 | 건수 | 설명 |
|---|---|---|
| Nature category evidence only | 119 | API 호출 없음; routing 증거 only |
| INTEGRATED detail (API payload) | 120 | 기존 API 호출 완료 |
| DRYRUN unique (API payload) | 15 | 기존 API 호출 완료 |
| **B_ROUTING_EVIDENCE_CIDS** | **254** | Nature 119 + Integrated 120 + Dryrun 15 |
| **ACTUAL_API_PAYLOAD_BEFORE_TASK** | **135** | Integrated 120 + Dryrun 15 (실제 호출분만) |
| **ACTUAL_API_PAYLOAD_AFTER_TASK** | **446** | 135 + 311 = 실제 API 호출 누적 |

> **주의**: B_ROUTING_EVIDENCE(254) ≠ ACTUAL_API_PAYLOAD(135).  
> Nature 119건은 category code 증거로 B-routing이나 API payload 미보유.  
> 이 작업에서 Nature 119건을 재호출하지 않음 (NATURE_RECALLED=0).

---

## D. 필드 가용성 (311건 기준)

| 필드 | 가용 건수 | 출처 |
|---|---|---|
| coordinates | 311 | traffic.map_position_xy |
| address | 310 | traffic.new_adres / adres |
| main_image | 311 | content.main_img |
| **related_images** | **311** | **content.relate_img** (list of URLs) |
| **summary** | **311** | **content.sumry** (최대 500자) |
| **tags** | **311** | **content.tag** (list of strings) |
| **created_at** | **311** | **content.creat_dt_text** |
| **updated_at** | **311** | **content.updt_dt_text** |
| opening_hours | 258 | extra.cmmn_use_time |
| homepage | 225 | extra.cmmn_hmpg_url |
| phone | 278 | extra.cmmn_telno |

---

## E. Quality Gaps (VisitSeoul API 미제공)

| 필드 | 누락 건수 | 비고 |
|---|---|---|
| closed_days | 311 | extra.cmmn_rstrde_info 없음 |
| accessibility | 311 | extra.cmmn_acmpnyat_dc 없음 |
| fee_price | 311 | extra.cmmn_ntry_se_dc 구조 없음 |
| homepage | 86 | |
| opening_hours | 53 | |
| phone | 33 | |
| address | 1 | |

```
QUALITY_GAP_ORIGIN = VISITSEOUL_MISSING (API가 해당 필드를 제공하지 않음)
RELATED_IMAGES_GAP = CLOSED (relate_img 필드로 해결)
TAGS_GAP = CLOSED (tag 필드로 해결)
SUMMARY_GAP = CLOSED (sumry 필드로 해결)
```

---

## F. Source Content Type (SCT)

| SCT | 건수 |
|---|---|
| PHYSICAL_PLACE | 211 |
| EXPERIENCE_CONTENT | 98 |
| PHYSICAL_PLACE_WITH_ROUTE_CONTENT | 2 |

```
SCT_CHANGED_FROM_V2 = 7
  PHYSICAL_PLACE → EXPERIENCE_CONTENT: 5  (웰니스/체험 시설)
  PHYSICAL_PLACE → PHYSICAL_PLACE_WITH_ROUTE_CONTENT: 2  (산책로 코스)

SCT_AUDIT_CANDIDATES = 16  (야간 감사 식별)
SCT_APPLIED_V2 = 2  (V2 correction에서 반영)
SCT_REMAINING_BEFORE_DETAIL = 14
DETAIL_RESOLVED_SCT_COUNT = 7
SCT_REMAINING_AFTER_DETAIL = 7  (수동 검토 필요)
```

---

## G. Eligibility

| 차원 | YES | CONDITIONAL | NO |
|---|---|---|---|
| SEARCHABLE | 311 | — | 0 |
| EXPLORE_ELIGIBLE | 274 | 21 | 16 |
| AI_ITINERARY_ELIGIBLE | 265 | 30 | 16 |

```
AI_ITINERARY_YES      = 265/311  (85.2%)
AI_ITINERARY_COND     = 30/311   (9.6%)
  조건: COORDINATE_REQUIRED / HOURS_OR_HOMEPAGE_REQUIRED / IDENTITY_VERIFICATION_REQUIRED
AI_ITINERARY_NO       = 16/311   (5.2%)
```

주요 AI_YES 사례:
- 경복궁 (KOP000083)
- 창덕궁 (KOP000085)
- 남산서울타워 (KOP000036)
- 국제선센터 템플스테이 (KOP0pzgtj) — homepage=templestay.com
- 국립민속박물관, 국립중앙박물관, 서울역사박물관

---

## H. Travel Value (7축)

Travel Value 7축 (TV1~TV7)은 evidence-based keyword signal 기반으로 평가.  
고정 산술 공식 없음 — keyword evidence 종류·강도를 종합 판단.

```
TV1 PURPOSE_CONTEXT_VALUE
TV2 TRAVELER_UTILITY_VALUE
TV3 KOREA_LOCAL_UNIQUENESS
TV4 EXPERIENCE_VALUE
TV5 INTENT_MATCH_POTENTIAL
TV6 INFORMATION_QUALITY
TV7 CURRENT_USABILITY
```

PLACE_CORE 194건: TV1/TV3/TV5 HIGH 비율 높음 (랜드마크·역사·문화)  
EXPERIENCE 107건: TV4/TV3 HIGH 비율 높음 (체험·워크숍·전통)

---

## I. 정규화 무결성

```
NORMALIZED_SHA256 = c1b88ae1e5eb20e821348da60d9952222e282450a3892d40827a70e8aa40e87c
NORMALIZATION_BYTE_IDENTICAL = YES  (두 번 실행 결과 동일)
NORMALIZE_FIELD_DISCOVERY_ROUNDS = 2
  Round 1: relate_img / tag / sumry / creat_dt_text / updt_dt_text 발견
  Round 2: 추출 코드 업데이트 후 재정규화 → SHA 변경 (94E65F3A → c1b88ae1)
```

---

## J. Safety

```
VISITSEOUL_API_CALLS       = 311
KTO_API_CALLS              = 0
WEB_CALLS                  = 0
DB_CHANGE                  = 0
SQL_EXECUTED               = 0
SRC_MODIFIED               = 0
UI_MODIFIED                = 0
DEPLOY_EXECUTED            = 0
MASTER_PUSH                = FORBIDDEN (준수)
BUSAN_GYEONGJU_MODIFIED    = 0
GIT_ADD_A                  = FORBIDDEN (준수)
SECRET_LOGGED              = 0
NATURE_RECALLED            = 0
EXISTING_API_PAYLOAD_RECALLED = 0
BAR_PUB_CALLED             = 0
AUTO_MERGE                 = 0
AUTO_DELETE                = 0
AUTO_EXCLUDE               = 0
```

---

## K. 산출물 파일

| 파일 | 유형 | 건수 |
|---|---|---|
| `data/seoul-source-audit/seoul-place-core-experience-detail-plan-v1.jsonl` | NEW | 311 |
| `data/seoul-source-audit/seoul-place-core-experience-detail-raw-v1.jsonl` | NEW | 311 |
| `data/seoul-source-audit/seoul-place-core-experience-detail-normalized-v1.jsonl` | NEW | 311 |
| `data/seoul-source-audit/seoul-place-core-experience-detail-attempts-v1.jsonl` | NEW | 311 |
| `data/seoul-source-audit/seoul-place-core-experience-detail-manifest-v1.json` | NEW | 1 |
| `scripts/run-seoul-place-core-experience-detail-collection-v1.py` | NEW | — |
| `docs/data-collection/seoul/seoul-place-core-experience-detail-summary-v1.md` | NEW | — |
| `docs/data-collection/seoul/seoul-place-core-experience-quality-gap-v1.json` | NEW | — |
| `docs/data-collection/seoul/seoul-place-core-experience-eligibility-audit-v1.json` | NEW | — |

---

## L. 다음 단계

```
RECOMMENDED_NEXT_TASK = TASK-SEOUL-RESTAURANT-UTILITY-ENRICHMENT-V1
  대상: Bar/Pub 17건 (BAR_PUB_EXCLUDED_FROM_THIS_TASK)
  + Restaurant C-routing 931건 utility enrichment (halal/vegan/solo 우선)

ALTERNATIVE_NEXT = TASK-SEOUL-EVENT-DATE-STATUS-PIPELINE-V1
  대상: D-routing 1,152건
  날짜 없이는 AI 일정 사용 불가

SCT_REMAINING_AUDIT = 7건 수동 검토 필요
```

---

## M. 최종 QA 플래그

```
PLAN_TOTAL                   = 311
API_SUCCESS                  = 311
NORMALIZED_TOTAL             = 311
NORMALIZED_SHA256            = c1b88ae1e5eb20e821348da60d9952222e282450a3892d40827a70e8aa40e87c
NORMALIZATION_BYTE_IDENTICAL = YES
FIELD_DISCOVERY_COMPLETE     = YES  (relate_img/tag/sumry/creat_dt_text/updt_dt_text)
QUALITY_GAP_UPDATED          = YES
AI_ITINERARY_YES             = 265/311
SEARCHABLE_YES               = 311/311
BAR_PUB_CALLED               = 0
NATURE_RECALLED              = 0
SECRET_LEAK                  = 0
AUTO_MERGE                   = 0
TASK_COMPLETE                = YES
```
