# GoKoreaMate — New City Data Package Contract v1

| 항목 | 값 |
|---|---|
| `document_title` | New City Data Package Contract v1 |
| `document_version` | **1.0** |
| `status` | **ACTIVE** — 다음 신규 도시부터 적용 |
| `created_at` | 2026-08-22 |
| `created_by` | TASK-MULTICITY-NEW-CITY-DATA-PACKAGE-CONTRACT-V1 |
| `branch` | `data/multicity-new-city-package-contract-v1` |
| `base_sha` | `1fb26351d4e195cdc6218d3b4417309e1f1838f3` |
| `base_branch` | `data/multicity-common` |
| `scope` | **신규 도시 데이터 패키지 전 단계** — 수집·canonical·service 선별·multilingual·image·provenance·regional·QA·manifest·Main intake |
| `lessons_from` | 부산·경주·서울·제주·전주 (5도시 reference, 소급 변경 금지) |

---

## 이 계약의 역할

이 계약은 기존 common 정책을 **폐기하거나 덮어쓰지 않는다.**

> 기존 SSOT 문서 목록:
> - `docs/architecture/gokoreamate-data-contract-v1.md` — DB·importer·identity 최상위 계약
> - `docs/data-collection/multicity-multilingual-canonical-contract-v2.md` — 다국어 SSOT
> - `docs/automation/image-curation-rules.md` — 이미지 큐레이션 규칙
> - `docs/data-collection/multicity-place-eligibility-policy-v1.md` — 5축 eligibility 정책
> - `docs/data-collection/multicity-data-quality-guardrail-v1.md` — 데이터 품질 가드레일
> - `docs/data-collection/multicity-main-data-handoff-v1.md` — Main 인수인계 공통 기준
> - `docs/data-collection/multicity-event-freshness-policy-v1.md` — Event freshness 정책
> - `docs/data-collection/multicity-food-discovery-collection-policy-v1.md` — Food 수집 정책

이 계약은 위 문서들을 **포함(by reference)**하며, 5도시 수집 과정에서 발견된 교훈을 새 도시에 처음부터 적용할 **operational 상위 계약**이다.

충돌 발견 시:
- 이 계약이 기존 문서와 충돌하면 → **이 계약을 수정하고 기존 문서를 보존한다.**
- 기존 문서끼리 충돌하면 → **작업 중단 후 보고한다.**

---

## 제1조 — 5도시 소급 적용 금지

```
FIVE_CITY_BACKFILL = FORBIDDEN
FIVE_CITY_REAUDIT  = FORBIDDEN
FIVE_CITY_CANONICAL_CHANGE = FORBIDDEN
```

부산·경주·서울·제주·전주 기존 final artifact는 이 계약에 맞게 재변환하지 않는다.
5도시는 **lessons learned / compatibility reference**로만 사용한다.

---

## 제2조 — A / B / C Package 구조

모든 신규 도시 작업은 **처음부터** 3계층으로 분리한다.
마지막에 정리하는 방식을 반복하지 않는다.

### A. CORE_RUNTIME_CANDIDATE

`RUNTIME_DIRECT_USE = YES`

Main `city_spots` canonical 후보. 포함 항목:

- 정체성: `canonical_id`, `source_type`, `source_key`, `canonical_title`
- 다국어 제목·설명: ko/en/ja/zh-CN (available coverage 표기)
- 분류: `category`, `subcategory`
- 위치: `address`, `lat`/`lng`, `coord_source`, `coord_valid`
- 탐색: `nav_ready`, `naver_map_url`/`kakao_map_url`
- 이미지: `image_url`, `image_rights`, `image_source`, `image_display_eligible`
- 정보: `phone`, `homepage`, `official_url`, `opening_hours`
- Eligibility: `ai_auto`, `nav_ready`, `coord_valid`, `service_status`
- Provenance: `source_tier`, `as_of`, `schema_version`

### B. REGIONAL_PRODUCT_CONTENT

`RUNTIME_DIRECT_USE = YES` (normalized-v1 schema 사용)

Core Place와 분리. **처음부터** `five-city-regional-content-normalized-contract-v1.md`의 `normalized-v1` 스키마에서 읽을 수 있는 형식으로 작성한다. 도시별 별도 스키마 → 마지막 normalize 방식 반복 금지.

포함 항목:
- recommended courses (final_recommended_courses, stops: list)
- recommended_now
- official guides/maps (다국어 locale별)
- travel utility (교통·공항·카드·패스·accessibility·Muslim-friendly 등)
- regional recommendations (linkage: canonical_id or RELATION/NEW_CANDIDATE 명시)

### C. RESEARCH_RAW_EVIDENCE

`RUNTIME_DIRECT_USE = NO`

절대 Main에 직접 사용하지 않는다:

- raw API 응답
- PDF 원본 / scraper 다운로드
- intermediate CSV/JSON
- rejected/stale candidates
- QA fixture / debug output
- 임시 파일

Final Package에서 C 경로는 `MAIN_MUST_NOT_INTAKE` 목록에 명시한다.

---

## 제3조 — Discovery → Service Universe 완전 분리

```
DISCOVERY_COUNT ≠ SERVICE_COUNT (기본 전제)
```

모든 canonical record는 아래 상태 중 하나에 속한다. 상태를 알 수 없으면 `REVIEW_REQUIRED`.

| 상태 | 의미 | Service 포함 |
|---|---|---|
| `DISCOVERED` | 수집됨, canonical 평가 전 | NO |
| `CANONICAL` | canonical record 확정, 서비스 여부 미결 | NO |
| `SERVICE_ACTIVE` | 서비스 포함 확정 | YES ✅ |
| `EXCLUDED` | 서비스 제외 확정 (사유 기록) | NO |
| `RELATION_CONTEXT` | 경로·지역 맥락 참조용 (searchable 가능) | NO (별도) |
| `EXPIRED_EVENT` | 이벤트 만료 | NO |
| `REVIEW_REQUIRED` | 사람 검토 필요 | HOLD |

**서비스 수량은 오직 `SERVICE_ACTIVE` 기준으로 계산한다.**

Final Manifest에 반드시 기록 (§제12조 참조):

```
discovered_count + canonical_count + service_active_count
+ excluded_count + relation_context_count + expired_count + review_count
= total_collected (arithmetic)
```

arithmetic 불일치 → `FINAL_FREEZE_READY = NO`

**부산 교훈 — 반드시 읽기:**

```
DISCOVERY_UNIVERSE  = 부산 busan-F 식별 전체 (Main에 326 row 존재)
SERVICE_UNIVERSE    = 최종 선별 후 (food 194건)
TIER-1_DIRECT_MATCH = 97건 (326과 194의 실제 교차 결과)

326 ≠ 194 ≠ 97.
"X건 수집됨" 보고 시 어느 universe인지 반드시 명시한다.
```

---

## 제4조 — Stable Source Identity (처음부터 보존)

**교훈:** `external_id가 없다 ≠ source identity가 없다`

경주에서 `legacy_external_id = null`이라 source bridge가 없다고 오판했지만,
`city_spot_sources.source_key = gyeongju-GJ0X-XXXX`가 canonical `candidate_id`와 완전 일치했다.

모든 canonical record에 가능한 범위에서 처음부터:

```json
{
  "canonical_id":          "string | null",
  "source_type":           "string",
  "source_key":            "string | null",
  "source_id_stable":      "YES | NO | PARTIAL",
  "canonical_id_deterministic": "YES | NO",
  "cross_run_stable":      "YES | NO",
  "primary_source_url":    "string | null",
  "source_locale":         "string | null",
  "as_of":                 "YYYY-MM-DDThh:mm:ssZ",
  "collected_at":          "YYYY-MM-DDThh:mm:ssZ"
}
```

**Source Identity Contract 필수 체크리스트:**

- `PRIMARY_SOURCE_KEY`: 주 매칭 키 (stable official ID 우선)
- `SECONDARY_SOURCE_KEYS`: 보조 키 목록 (KTO contentId, 공식 SID 등)
- `SOURCE_ID_STABLE = YES/NO/PARTIAL`
- `CANONICAL_ID_DETERMINISTIC = YES/NO`
- `CROSS_RUN_STABLE = YES/NO` (동일 source 재실행 시 동일 ID 보장 여부)

**canonical artifact ↔ provenance artifact 사이의 identity bridge를 Final Manifest에서 기계적으로 확인할 수 있어야 한다.**

### Canonical ID Type 문서화 (도시별 필수)

| 항목 | 기록할 값 |
|---|---|
| `CANONICAL_ID_TYPE` | `source-derived` / `internal-sequential` / `mixed` |
| `ID_FORMAT_EXAMPLE` | `"seoul-KOP000034"` 등 실제 예시 |
| `SOURCE_ID_AVAILABLE` | `YES` / `NO` / `PARTIAL` |
| `DETERMINISTIC` | `YES` / `NO` |
| `CROSS_RUN_STABLE` | `YES` / `NO` |
| `KNOWN_LIMITATIONS` | 예: `GJ01 sequential — source 재수집 시 번호 재배정 위험` |

---

## 제5조 — Matching Key Inventory

새 도시 수집 종료 시점이 아니라 **처음부터** 유지한다.

### STRONG (Tier-1 — 결정론적 direct match)

- stable official/source ID (KTO contentId, SID, CID 등)
- deterministic canonical ID (`source-derived` 형식)
- exact source_key

### SECONDARY (Tier-2 — name+unique identifier)

- normalized/native title (언어별)
- exact address
- coordinates (lat/lng 일치 허용 오차: 5m)
- phone (국번 정규화 후)
- official URL
- exact naver/kakao map URL
- category

### WEAK (Tier-3 — 보조, 단독 사용 금지)

- partial title
- district
- broad category
- image URL

Final Package에 도시 전체의:

```
strong_key_coverage        = count / service_total
missing_strong_key_count   = int
duplicate_canonical_id_count = int
duplicate_source_key_count = int
```

가 자동 계산 가능해야 한다.

---

## 제6조 — Field Provenance Contract

row 전체 provenance로 끝내지 않는다.

Final Package에서 주요 필드에 대해 `이 값이 어느 source에서 왔는가`를 재구성할 수 있어야 한다.

**추적 대상 주요 필드 (최소):**

| 필드 | 추적 방법 |
|---|---|
| `title_ko`/`name_ko` | source_type + source_key + as_of |
| `title_{locale}` | multilingual source mapping (CID/포인터 또는 source_url) |
| `description_ko` | source_url / official_material |
| `description_{locale}` | locale source + as_of |
| `address` | source 원문 보존 |
| `lat`/`lng` | `coord_source` + `coord_recovery_method` |
| `image_url` | `image_source` + `image_rights` |
| `phone` | source + as_of |
| `opening_hours` | source + as_of |
| `official_url` | source_url |
| `nav_ready` | provider + last_verified |

모든 필드에 별도 행을 강제하지 않는다.
단, Final QA Manifest에서 주요 위험 필드의 null reason을 집계할 수 있어야 한다.

---

## 제7조 — Null Semantics (명확한 구분)

단순 `null`로 의미를 잃지 않는다.

| 상태 코드 | 의미 |
|---|---|
| `SOURCE_HAS_NO_VALUE` | source에 해당 필드 없음 (확인됨) |
| `NOT_COLLECTED` | 수집 미실시 (아직 모름) |
| `NOT_APPLICABLE` | 해당 category에서 필드 자체가 의미 없음 |
| `SOURCE_EMPTY` | source에 빈 문자열/빈 배열 |
| `FETCH_GAP` | 수집 실패 또는 접근 불가 |
| `REVIEW_REQUIRED` | 사람 검토 필요 |
| `INTENTIONALLY_EMPTY` | 의도적 공백 (운영 결정) |

모든 필드에 null reason을 강제하지 않는다.

Final Manifest의 주요 위험 필드(description, coordinate, image)에 한해 null reason을 집계한다.

**목적:** Main intake 시 `NEW_NULL → OLD_LEGACY_VALUE 자동 fallback`을 방지한다.
신규 canonical의 null은 "source에 없음"이지 "기존 값이 더 낫다"는 뜻이 아니다.

---

## 제8조 — Multilingual Contract (v2 확장)

**SSOT:** `docs/data-collection/multicity-multilingual-canonical-contract-v2.md`

변경하지 않고 참조한다. 추가 요구사항:

### Locale Gap Reason (신규 도시 추가)

Final Manifest에 locale별 gap reason을 집계한다:

| 코드 | 의미 |
|---|---|
| `CANONICAL_PRESENT` | 공식 locale 콘텐츠 존재 |
| `MAPPING_GAP` | source에는 있으나 canonical 연결 미완료 |
| `COLLECTION_GAP` | source 수집 미실시 |
| `SOURCE_NO_LOCALE` | 해당 source가 해당 locale을 미지원 |
| `SOURCE_EMPTY` | source에 빈 콘텐츠 |
| `FETCH_GAP` | 수집 실패 |
| `GOOGLE_TRANSLATE_ONLY` | GT 결과만 존재 — `CANONICAL_PRESENT = NO` |

**GT 결과는 official coverage 아님.** locale gap의 수치는 GT 제외 실제 coverage로만 집계한다.

### zh-CN locale key 매핑 주의

신규 데이터의 `zh-CN` → Main intake 시 Main DB 정책에 따라 mapping 처리.
이 계약에서 강제하지 않으나 Final Package에 `ZH_KEY_MAPPING_NOTE`를 기록한다.

---

## 제9조 — Image Contract (curation-rules 확장)

**SSOT:** `docs/automation/image-curation-rules.md`

변경하지 않고 참조한다. 추가 요구사항:

### 이미지 상태 필드 (신규 도시 필수)

| 필드 | 의미 |
|---|---|
| `image_candidate_count` | 수집된 후보 수 |
| `image_display_eligible` | YES/NO — 표시 가능 |
| `image_primary` | 선정된 대표 이미지 URL |
| `image_provenance` | source + rights type |
| `image_rights_status` | `confirmed`/`operational_assumed`/`review_required` |
| `image_fallback_type` | `NONE`/`NAVER`/`OFFICIAL_SITE`/`GENERIC` |
| `image_as_of` | 확인 일시 |

### Final Manifest 집계 (필수)

```
image_coverage              = display_eligible_count / service_total
image_provenance_coverage   = provenance_recorded_count / service_total
image_missing_count         = int
image_unresolved_count      = int (review_required)
```

**이미지 없음 ≠ place 자동 제외.** 이미지 없는 place는 `image_display_eligible = NO`로 기록하고 service에서 제외하지 않는다.

---

## 제10조 — Coordinate / Navigation Contract

기존 원칙 유지:

- 좌표 존재 ≠ `NAV_READY`
- 잘못된 좌표 > 누락 좌표 (오류가 더 위험)
- area/route는 임의 centroid 금지 — arrival_point 사용
- entrance/start/trailhead 등 실제 여행자 도착점 사용

### 필수 추적 필드

| 필드 | 의미 |
|---|---|
| `coord_source` | `kto_api`/`official_map`/`vworld`/`manual` 등 |
| `coord_verified_at` | 검증 일시 |
| `nav_ready` | YES/NO (coord_valid + 허용 source 조건 충족) |
| `arrival_point_meaning` | `main_entrance`/`ticket_booth`/`trailhead`/`centroid_ok` 등 |
| `coord_recovery_method` | 복구 시 방법 기록 (`vworld_address_search` 등) |

### Final Manifest 집계

```
coord_coverage    = coord_valid_count / service_total
nav_coverage      = nav_ready_count / service_total
coord_missing     = int
nav_missing       = int
```

---

## 제11조 — Canonical ID Reproducibility

새 도시마다 반드시 문서화:

```
CANONICAL_ID_TYPE          = source-derived | internal-sequential | mixed
CANONICAL_ID_DETERMINISTIC = YES | NO
CROSS_RUN_STABLE           = YES | NO
SOURCE_ID_AVAILABLE        = YES | NO | PARTIAL
FIXED_AS_OF                = YYYY-MM-DD (재현 기준 수집일)
DETERMINISTIC_SORT         = field + direction (예: candidate_id ASC)
KNOWN_LIMITATIONS          = 자유 텍스트
```

Final Release Gate에서:
- `rerun_determinism` 여부
- `known_limitation` 기록 여부

를 확인한다.

---

## 제12조 — Final Artifact Contract

```
INTAKE_METHOD = FINAL_ARTIFACT_INTAKE
WHOLE_BRANCH_MERGE = FORBIDDEN
```

### MAIN_MUST_INTAKE (명시 필수)

| 항목 | 설명 |
|---|---|
| Core canonical final artifact | 도시별 `.json`/`.jsonl` — service_status 필터 기준 명시 |
| Multilingual artifact | locale별 coverage artifact |
| Provenance artifact | 필요 시 별도 또는 canonical 내 포함 |
| Final Manifest | §제13조 schema — machine-readable |
| Release Gate result | §제14조 — PASS/FAIL 증거 |
| Regional normalized artifact | `normalized-v1` schema (B 계층) |
| Schema/Contract 문서 | 이 계약서 + v2 multilingual contract 등 |

### MAIN_MUST_NOT_INTAKE (명시 필수)

| 항목 |
|---|
| raw API 응답 (`data/*/checkpoints/` 등) |
| intermediate manifests / enrichment 결과 |
| rejected/stale candidates |
| QA fixture / debug output |
| superseded 버전의 artifact |
| temporary/research-only evidence |
| regional 원본 20파일 (normalized-v1 사용) |

**Main이 "어느 파일이 최종인가?"를 다시 조사하지 않아도 되어야 한다.**

---

## 제13조 — Final Manifest Schema (Machine-readable)

**파일:** `data/{city}-release/final-manifest-v1.json`

상세 JSON template: `docs/data-collection/new-city-package/new-city-final-manifest-template-v1.json`

### 최소 필수 섹션

```json
{
  "city": "string",
  "package_version": "string",
  "approved_sha": "string",
  "common_policy_pin": "string (common branch SHA)",
  "schema_version": "string",
  "generated_as_of": "YYYY-MM-DDThh:mm:ssZ",
  "canonical_id_type": "string",
  "canonical_id_deterministic": "YES|NO",
  "cross_run_stable": "YES|NO",

  "universe": {
    "discovered_count": 0,
    "canonical_count": 0,
    "service_active_count": 0,
    "excluded_count": 0,
    "relation_context_count": 0,
    "expired_count": 0,
    "review_count": 0,
    "arithmetic_valid": true
  },

  "category_counts": {},

  "identity": {
    "canonical_id_count": 0,
    "canonical_id_duplicate_count": 0,
    "source_key_coverage": 0,
    "source_key_duplicate_count": 0,
    "missing_strong_identity_count": 0
  },

  "data_readiness": {
    "coord_valid_count": 0,
    "nav_ready_count": 0,
    "image_display_eligible_count": 0,
    "image_provenance_count": 0,
    "description_ko_count": 0
  },

  "locale": {
    "ko":    {"title": 0, "description": 0, "gap_by_reason": {}},
    "en":    {"title": 0, "description": 0, "gap_by_reason": {}},
    "ja":    {"title": 0, "description": 0, "gap_by_reason": {}},
    "zh-CN": {"title": 0, "description": 0, "gap_by_reason": {}}
  },

  "artifacts": [],

  "release": {
    "reproducibility": "string",
    "known_issues": [],
    "targeted_qa_required": false,
    "safe_for_main_intake": "YES|NO|HOLD"
  }
}
```

---

## 제14조 — Automated Release Gate

다음 검사를 모두 통과해야 `FINAL_FREEZE_READY = YES`.
하나라도 실패하면 `FINAL_FREEZE_READY = NO`이며 실패한 항목만 targeted QA한다.
**전체 도시 재수집으로 되돌아가지 않는다.**

| # | 검사 항목 | 실패 시 |
|---|---|---|
| G-01 | `service_active + excluded + relation + expired + review = total_canonical` arithmetic 일치 | HOLD |
| G-02 | canonical_id 중복 없음 | HOLD |
| G-03 | service universe 내 source_key 중복 없음 | HOLD |
| G-04 | SERVICE_ACTIVE와 EXCLUDED 혼합 없음 | HOLD |
| G-05 | MAIN_MUST_INTAKE 필수 artifact 전체 존재 | HOLD |
| G-06 | manifest row count = artifact record count | HOLD |
| G-07 | 주요 필드 provenance 필드 coverage > 0 | WARN |
| G-08 | coord arithmetic (valid+missing = total) | HOLD |
| G-09 | multilingual KO title 100% (service) | HOLD |
| G-10 | image manifest count = artifact image count | HOLD |
| G-11 | Regional linkage arithmetic (EXACT+REL+EVENT+NEW+UNC = total refs) | WARN |
| G-12 | MAIN_MUST_NOT_INTAKE 경로가 Core artifact 내부에서 참조되지 않음 | HOLD |
| G-13 | approved_sha ↔ local HEAD 일치 | HOLD |
| G-14 | local HEAD = origin HEAD (force push 없음) | HOLD |
| G-15 | `reproducibility` 필드 기록 완료 | WARN |

**HOLD** = `FINAL_FREEZE_READY = NO` (수정 후 재실행)
**WARN** = 기록 누락 경고 (targeted QA 권고, blocking 아님)

Validator spec: §제15조 참조.

---

## 제15조 — Validator 명세 (opt-in, 신규 도시 전용)

**기존 5도시에 강제 실행 금지.** 새 도시 `new-city-package` 경로에서만 opt-in으로 실행한다.

### validator 위치 (예정)

```
scripts/validate-new-city-package-v1.py
```

### 입력

```
--manifest  data/{city}-release/final-manifest-v1.json
--artifacts data/{city}-release/
--city      {city}
--strict    (G-XX HOLD 항목 전부 enforcing)
```

### 출력

```json
{
  "FINAL_FREEZE_READY": "YES|NO",
  "gates": [
    {"id": "G-01", "status": "PASS|FAIL|WARN", "detail": "..."}
  ]
}
```

### 구현 범위 (이번 TASK)

이번 TASK에서는 **Validator Specification까지만** 작성한다.
실제 Python 구현은 첫 신규 도시 착수 전 별도 TASK에서 작성한다.

---

## 제16조 — Main Intake Contract

```
RECOMMENDED_MAIN_INTAKE = FINAL_ARTIFACT_INTAKE
WHOLE_BRANCH_MERGE      = HIGH_RISK (금지 권고)
CHERRY_PICK             = FORBIDDEN (raw data 유입 위험)
```

### Main-side Intake 절차

1. Final Manifest (`final-manifest-v1.json`) 확인 → `safe_for_main_intake = YES` 확인
2. `MAIN_MUST_INTAKE` 파일 목록 추출 (git show로 특정 SHA)
3. 도시별 새 importer 작성 (`import-spots.ts` 구 버전 사용 금지)
4. Crosswalk tier 결정:
   - TIER-1: strong source_key ↔ Main source_key 직접 일치 → `MATCH_REPLACE`
   - TIER-2/3: name+coord → `REVIEW` 후 `MATCH_REPLACE` 또는 `AMBIGUOUS`
   - 신규 도시: Main 0건이면 전체 `NEW_INTAKE`
5. EXCLUDED canonical → Main 기존 row → `LEGACY_ONLY_VALID` (MATCH_REPLACE 금지)
6. `NEW_NULL` → Main old value 자동 fallback 금지

### Crosswalk Tier 기록

Final Manifest에 기록:

```json
"crosswalk": {
  "tier1_eligible_count": 0,
  "tier2_eligible_count": 0,
  "new_intake_count": 0,
  "legacy_only_count": 0,
  "matching_key_primary": "source_key | candidate_id | ...",
  "matching_key_secondary": ["title_ko", "lat_lng"]
}
```

---

## 제17조 — City Package Directory 구조

기존 repo 관례를 최대한 유지한다. 새 구조를 과도하게 만들지 않는다.

최소 역할 구분 (path 명칭은 도시별로 다를 수 있음):

```
data/{city}-collection-v1/          ← C. raw/checkpoint (RUNTIME=NO)
data/{city}-targeted-completion-v1/ ← 최종 curation branch
  data/{city}-final-release/        ← A. CORE_RUNTIME artifact
    {city}-canonical-places-v1.jsonl       (또는 .json)
    {city}-canonical-release-summary-v1.json
    final-manifest-v1.json                ← §제13조
  docs/data-collection/{city}/      ← QA/handoff docs
data/{city}-multilingual-v1/        ← multilingual artifact
data/{city}-regional-recommendations-v1/ ← B. REGIONAL
data/regional-recommendations/normalized/ ← normalized-v1 소비 기준
```

Food canonical이 별도 branch에 있을 경우 Final Manifest에 명시하고 SHA로 고정한다.

---

## 제18조 — Regional normalized-v1 Contract 연결

**SSOT:** `docs/data-collection/handoff/five-city-regional-content-normalized-contract-v1.md`

신규 도시의 Regional content는 처음부터 `normalized-v1` 스키마를 사용한다.

핵심 요구사항:
- `final_recommended_courses` (list 형식 stops)
- stop에 `canonical_id` 또는 `linkage_type: RELATION_CONTEXT | NEW_CANDIDATE | UNCERTAIN` 명시
- `recommended_now`의 stale item은 `stale_or_excluded` 키로 분리
- locale dict 형식: `{"ko": true, "en": true}` (list 형식 지양)
- Regional QA arithmetic: `EXACT + REL + EVENT + NEW + UNC = TOTAL_REFS`

---

## 제19조 — 신규 도시 착수 체크리스트

이 계약에서 새 도시 수집 착수 전 확인:

```
[ ] 1. BASE_BRANCH = origin/data/multicity-common (최신 HEAD 확인)
[ ] 2. 이 계약 + 기존 common SSOT 문서 열람
[ ] 3. CANONICAL_ID_TYPE 결정 및 문서화
[ ] 4. PRIMARY_SOURCE_KEY 정의 (strong tier 가능 여부 확인)
[ ] 5. A/B/C 디렉토리 구조 초안
[ ] 6. Service status 필드명 결정 (service_status / publishability)
[ ] 7. Locale 수집 가능 source 사전 조사
[ ] 8. Image 수집 가능 source 사전 조사
[ ] 9. Regional content 구조 결정 (처음부터 normalized-v1 형식)
[ ] 10. Final Manifest template 복사 및 도시별 customization
[ ] 11. Release Gate 기준 확인 (G-01~G-15)
```

---

## 기존 계약과의 관계 요약

| 기존 문서 | 이 계약의 역할 |
|---|---|
| `gokoreamate-data-contract-v1.md` | 폐기 안 함. DB·identity 최상위 — 이 계약이 참조 |
| `multicity-multilingual-canonical-contract-v2.md` | 폐기 안 함. §제8조가 확장 |
| `image-curation-rules.md` | 폐기 안 함. §제9조가 확장 |
| `multicity-place-eligibility-policy-v1.md` | 폐기 안 함. §제3조 상태 taxonomy와 병행 |
| `multicity-data-quality-guardrail-v1.md` | 폐기 안 함. §제3조/제14조가 확장 |
| `multicity-main-data-handoff-v1.md` | 폐기 안 함. §제16조가 확장 |
| `five-city-regional-content-normalized-contract-v1.md` | 폐기 안 함. §제18조가 연결 |

**충돌 발견 시 이 계약을 수정하고 기존 문서를 보존한다.**

---

## 이 계약 버전 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 1.0 | 2026-08-22 | 최초 작성 — 5도시 lessons learned 기반 |
