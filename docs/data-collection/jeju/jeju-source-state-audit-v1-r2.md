# 제주 Source State Audit v1-R2

| 항목 | 값 |
|---|---|
| 버전 | v1-R2 |
| 작성일 | 2026-08-13 |
| 작업 TASK | TASK-JEJU-SOURCE-STATE-AUDIT-V1-R2 |
| Branch | data/jeju-collection-v2 |
| Base | a9014c6 (origin/master, 직접 분기) |
| 감사 방식 | READ-ONLY |
| 선행 | TASK-JEJU-SOURCE-STATE-AUDIT-V1 PASS (0bc7f8a, data/jeju-collection-v1) |

```
COMMON_POLICY_BRANCH = data/multicity-common
COMMON_POLICY_COMMIT = dc6f9be563983d369f400e4e8b0eea139f82da7c

API_CALLS         = 0
WEB_COLLECTION    = 0
DATA_COLLECTION   = 0
DB_WRITE          = 0
MASTER_WRITE      = 0
PRODUCTION_WRITE  = 0
```

---

## R1 대비 변경 사항

### 구조 변경

| 항목 | R1 상태 | R2 상태 |
|---|---|---|
| Jeju branch | data/jeju-collection-v1 (Seoul 계보) | **data/jeju-collection-v2 (master 직접 분기)** |
| Common SSOT | 미정 (data branch 분산) | **data/multicity-common (dc6f9be) 확정** |
| Master 상태 | 897edf6 (multicity 파일 없음) | a9014c6 (제품 코드 업데이트, multicity 미포함) |

### master 신규 변경 (897edf6 → a9014c6)

- src/ + functions/ + supabase/: 제품 기능 업데이트 (My Places, i18n, commerce 정리)
- `src/content/posts/2026-06-13-jeju-3-day-itinerary.md`: 부킹 가격 제거 (editorial 업데이트)
- **data/**, **docs/data-collection/**: 변경 없음
- 제주 데이터 수집 artifact: 변경 없음

---

## R2 감사 결과

### SECTION 1 — data/ 파이프라인 Artifacts

| 항목 | 값 |
|---|---|
| JEJU_EXISTING_DATA_ARTIFACTS | **0건** (R1과 동일) |
| data/jeju-collection*/ | 없음 |
| data/tourapi/raw/jeju/ | 없음 |
| data/tourapi/enriched/jeju/ | 없음 |
| data/tourapi/candidates/jeju/ | 없음 |

### SECTION 2 — app 레벨 Skeleton

| 파일 | 상태 | R1 대비 |
|---|---|---|
| `src/data/cities/jeju.ts` | `staticSpots: []` | 변경 없음 |
| `src/app/jeju/page.tsx` | UI skeleton | 변경 없음 |
| `src/content/posts/2026-06-13-jeju-3-day-itinerary.md` | editorial (가격 표현 제거) | 소폭 업데이트 (데이터 수집 무관) |
| `public/images/cities/city-jeju-v1.webp` | UI 자산 | 변경 없음 |
| `src/app/api/generate-itinerary/route.ts` | MOCK 일정 | 변경 없음 |

### SECTION 3 — Source 상태

| Source | 상태 | R1 대비 |
|---|---|---|
| 제주관광공사(JTO) API | `NEEDS_SOURCE_CAPABILITY_CHECK` | 변경 없음 |
| visitjeju.net | `NEEDS_SOURCE_CAPABILITY_CHECK` | 변경 없음 |
| KTO TourAPI (areaCode=39) | `HOLD_FOR_SOURCE_CAPABILITY_DECISION` | 변경 없음 |
| Naver | `NOT_NEEDED_CURRENT_SCOPE` | 변경 없음 |

### SECTION 4 — Stale Policy Conflict

| 항목 | 상태 |
|---|---|
| STALE_POLICY_CONFLICT_COUNT | 1 (R1과 동일) |
| 내용 | `docs/tourapi/gokoreamate-data-source-strategy.md` §D KTO primary 가정 |
| 처리 | 미정 — Source Capability Check 후 정정 예정 |

### SECTION 5 — 공통 정책 참조

R2부터 적용되는 공통 정책 SSOT:

| 정책 | 파일 | Commit |
|---|---|---|
| Place eligibility 5축 | multicity-place-eligibility-policy-v1.md | e6ee1f1 (in common) |
| Event freshness | multicity-event-freshness-policy-v1.md | 983c8d9 (in common) |
| Food discovery | multicity-food-discovery-collection-policy-v1.md | cfa4640 FINAL FREEZE (in common) |
| Data quality guardrail | multicity-data-quality-guardrail-v1.md | 8dfdc6d (in common) |
| 주요 handoff 기준 | multicity-main-data-handoff-v1.md | 983c8d9 (in common) |

모든 공통 정책은 `data/multicity-common (dc6f9be)` 기준으로 읽는다. 제주 branch 내부 복사본 사용 금지.

### SECTION 6 — Track별 상태

| Track | 상태 | R1 대비 |
|---|---|---|
| PLACE / ATTRACTION | NOT_STARTED | 변경 없음 |
| NATURE / TREKKING | NOT_STARTED | 변경 없음 |
| FOOD | NOT_STARTED | 변경 없음 |
| EVENT | NOT_STARTED (ACTIVE_EVENT_SERVICE_POOL=0) | 변경 없음 |
| MULTILINGUAL | NOT_STARTED | 변경 없음 |
| IMAGE | UI_ASSETS_ONLY | 변경 없음 |

---

## 최종 플래그

```
TASK_RESULT                         = PASS
JEJU_ACTIVE_BRANCH                  = data/jeju-collection-v2
JEJU_BRANCH_BASE                    = a9014c6 (origin/master, 직접 분기)
SEOUL_LINEAGE_INHERITED             = NO

COMMON_POLICY_BRANCH                = data/multicity-common
COMMON_POLICY_COMMIT                = dc6f9be563983d369f400e4e8b0eea139f82da7c

JEJU_EXISTING_ARTIFACTS_FOUND       = NO (data/ pipeline 0건)
REGIONAL_SOURCE_STATE               = NEEDS_SOURCE_CAPABILITY_CHECK
REGIONAL_OFFICIAL_PRIMARY_CANDIDATE = 제주관광공사(JTO) API / visitjeju

PLACE_STATE         = NOT_STARTED
FOOD_STATE          = NOT_STARTED
EVENT_STATE         = NOT_STARTED (ACTIVE_EVENT_SERVICE_POOL=0)
MULTILINGUAL_STATE  = NOT_STARTED
IMAGE_STATE         = UI_ASSETS_ONLY

KTO_JEJU                    = HOLD_FOR_SOURCE_CAPABILITY_DECISION
STALE_POLICY_CONFLICT_COUNT = 1

R1_VS_R2_DELTA = 구조 변경만 (branch 계보 정정, common SSOT 확정). 수집 상태 변화 없음.

API_CALLS         = 0
WEB_COLLECTION    = 0
DATA_COLLECTION   = 0
DB_WRITE          = 0
MASTER_WRITE      = 0
PRODUCTION_WRITE  = 0

NEXT_TASK = TASK-JEJU-REGIONAL-SOURCE-CAPABILITY-CHECK-V1
```
