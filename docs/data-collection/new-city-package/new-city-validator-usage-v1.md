# New City Package Validator — 사용 안내 v1

**파일**: `scripts/validate-new-city-package-v1.py`  
**계약 참조**: `docs/data-collection/new-city-package/multicity-new-city-package-contract-v1.md §제14조`  
**적용 범위**: 신규 도시 opt-in 전용. **기존 5개 도시(부산·경주·서울·제주·전주)에 강제 실행 금지.**

---

## 개요

New City Package Final Manifest를 입력으로 받아 Release Gate G-01~G-15를 자동 검사한다.  
최종 결과로 `FINAL_FREEZE_READY = YES | NO | HOLD` 및 `SAFE_FOR_MAIN_INTAKE = YES | NO | HOLD`를 출력한다.

---

## 빠른 시작

```bash
# 사람이 읽기 좋은 형식
python scripts/validate-new-city-package-v1.py data/<city>-release/final-manifest-v1.json

# 기계 처리 JSON 형식
python scripts/validate-new-city-package-v1.py data/<city>-release/final-manifest-v1.json --json

# strict 모드 (WARN도 blocking으로 처리)
python scripts/validate-new-city-package-v1.py data/<city>-release/final-manifest-v1.json --strict
```

---

## Exit Code

| 코드 | 의미 | 설명 |
|------|------|------|
| `0` | **PASS** | 모든 HOLD gate 통과, WARN 없음 |
| `1` | **HOLD** | WARN 또는 EXTERNAL_CHECK_REQUIRED 존재. HOLD gate 실패 없음. |
| `2` | **FAIL** | HOLD gate 1개 이상 실패. FINAL_FREEZE_READY = NO. |

`--strict` 옵션 사용 시 WARN도 exit 2로 처리된다.

---

## G-01~G-15 검사 항목

| Gate | 검사 항목 | 실패 시 | 검증 방식 |
|------|----------|---------|-----------|
| G-01 | Universe arithmetic (sa+ex+rc+ep+rv = canonical) | HOLD→exit 2 | manifest 필드 계산 |
| G-02 | canonical_id 중복 없음 | HOLD→exit 2 | manifest.identity.canonical_id_duplicate_count |
| G-03 | service universe 내 source_key 중복 없음 | HOLD→exit 2 | manifest.identity.source_key_duplicate_count |
| G-04 | SERVICE_ACTIVE와 EXCLUDED 혼합 없음 | HOLD→exit 2 | canonical_id 중복 간접 지표 / EXTERNAL_CHECK_REQUIRED |
| G-05 | MAIN_MUST_INTAKE 필수 아티팩트 존재 | HOLD→exit 2 | 파일 경로 존재 확인 (템플릿 경로는 EXTERNAL_CHECK_REQUIRED) |
| G-06 | manifest row count = artifact record count | HOLD→exit 2 | core_canonical.row_count = service_active_count |
| G-07 | 주요 필드 provenance coverage > 0 | WARN→exit 1 | description_ko / coord_valid / image_eligible count |
| G-08 | coord arithmetic (valid+missing = sa) | HOLD→exit 2 | manifest 필드 계산 |
| G-09 | KO title 100% (service_active) | HOLD→exit 2 | locale.ko.title_count ≥ service_active_count |
| G-10 | image count arithmetic (eligible+missing = sa) | HOLD→exit 2 | manifest 필드 계산 |
| G-11 | Regional linkage arithmetic | WARN→exit 1 / NA | regional artifact 있으면 WARN |
| G-12 | raw/discovery 경로가 core artifact에서 참조되지 않음 | HOLD→exit 2 | manifest artifact 경로 패턴 검사 |
| G-13 | manifest.approved_sha ↔ local git HEAD 일치 | HOLD→exit 2 | git rev-parse HEAD |
| G-14 | local HEAD = origin HEAD (force push 없음) | HOLD→exit 2 | git fetch + 비교 |
| G-15 | release.reproducibility 필드 기록 완료 | WARN→exit 1 | 필드 존재 및 내용 확인 |

### Gate 상태값

| 상태 | 의미 |
|------|------|
| `PASS` | 검사 통과 |
| `FAIL` | HOLD gate 실패 → FINAL_FREEZE_READY = NO |
| `WARN` | 경고 (blocking 아님, targeted QA 권고) |
| `NOT_APPLICABLE` | 해당 도시에 적용 불가 (예: regional 아티팩트 없음) |
| `EXTERNAL_CHECK_REQUIRED` | manifest 레벨에서 검증 불가 — 수동 또는 아티팩트 직접 검사 필요 |

---

## JSON 출력 형식

```json
{
  "validator": "validate-new-city-package-v1 1.0.0",
  "contract": "...",
  "run_at": "2026-08-22T00:00:00Z",
  "city": "yeosu",
  "manifest": "data/yeosu-release/final-manifest-v1.json",
  "strict_mode": false,
  "FINAL_FREEZE_READY": "YES | NO | HOLD",
  "result": "PASS | FAIL | HOLD",
  "safe_for_main_intake": "YES | NO | HOLD",
  "exit_code": 0,
  "summary": {
    "total": 15, "pass": 12, "fail": 0,
    "warn": 1, "not_applicable": 1, "external_check_required": 1
  },
  "gates": [
    {"id": "G-01", "status": "PASS", "detail": "...", "actual": 200, "expected": 200},
    {"id": "G-11", "status": "WARN", "detail": "Regional linkage arithmetic 수동 검사 필요"},
    ...
  ],
  "errors": [],
  "warnings": [{"id": "G-11", ...}],
  "external_checks": [{"id": "G-12", ...}]
}
```

---

## 신규 도시 Final Manifest 작성 흐름

1. `docs/data-collection/new-city-package/new-city-final-manifest-template-v1.json` 복사
2. `city`, `approved_sha`, `universe.*`, `identity.*`, `data_readiness.*`, `locale.*`, `artifacts[]` 실제 값으로 채움
3. `arithmetic_valid = true` 수동 확인 후 기입
4. Validator 실행:
   ```bash
   python scripts/validate-new-city-package-v1.py data/<city>-release/final-manifest-v1.json
   ```
5. FAIL 항목만 targeted QA → 수정 후 재실행
6. `FINAL_FREEZE_READY = YES` 확인 후 Main Intake 진행

---

## EXTERNAL_CHECK_REQUIRED 처리 가이드

EXTERNAL_CHECK_REQUIRED는 **blocking이 아님** (exit 1 = HOLD).  
단, Main Intake 전 수동 확인 필요:

| Gate | 수동 확인 방법 |
|------|--------------|
| G-04 | `jq '[.[] \| .service_status] \| group_by(.) \| map({status: .[0], count: length})' canonical.jsonl` |
| G-05 | 각 artifact 경로 파일 존재 여부 직접 확인 |
| G-12 | Core artifact 내부에서 raw/discovery 경로 참조 여부 `grep -r "raw/" data/<city>-final-release/` |
| G-14 | `git fetch origin && git diff HEAD origin/<branch>` |

---

## 테스트

```bash
python scripts/tests/run-validator-tests-v1.py
```

8개 시나리오 30개 assertion. 모두 PASS해야 한다.

### Fixture 설명

| 파일 | 시나리오 | 예상 exit |
|------|----------|----------|
| `fixture-valid-city-v1.json` | 정상 manifest (템플릿 경로) | 0 또는 1 |
| `fixture-invalid-arithmetic-v1.json` | G-01/G-08/G-10 arithmetic 불일치 | 2 |
| `fixture-duplicate-identity-v1.json` | G-02/G-03 중복, G-04 혼합 의심 | 2 |
| `fixture-raw-leakage-v1.json` | G-12 raw 경로 + G-09 KO title 누락 | 2 |
| `fixture-external-check-v1.json` | G-02/G-03 필드 누락, G-11 WARN | 1 |

**Fixtures 위치**: `data/test-fixtures/new-city-package/`

---

## 제약 사항

- **기존 5도시 강제 실행 금지**: 부산, 경주, 서울, 제주, 전주에 이 validator를 자동화/강제 적용하지 않는다.
- **DB/네트워크 접근 없음**: manifest 파일과 로컬 git 상태만 읽는다.
- **아티팩트 읽기**: JSON/JSONL만 읽는다. 파일이 있으면 G-06 카운트 검증에 활용한다.
- **Python 표준 라이브러리만 사용**: 외부 패키지 없이 동작한다.

---

## 관련 문서

- 계약: `docs/data-collection/new-city-package/multicity-new-city-package-contract-v1.md`
- 템플릿: `docs/data-collection/new-city-package/new-city-final-manifest-template-v1.json`
- 소급 금지 정책: `multicity-new-city-package-contract-v1.md §제15조`
