# TASK-DATA-BUSAN-REPEAT-AUTOMATION-01-REV — 완료 보고서

**날짜:** 2026-07-23
**태스크:** TASK-DATA-BUSAN-REPEAT-AUTOMATION-01-REV
**상태:** PASS

---

## 1. 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/tourapi-busan-diff.mjs` | **신규** — 저장공간·스냅샷·diff 헬퍼 모듈 |
| `scripts/tourapi-busan-batch.mjs` | 수정 — Phase 0·5 추가, import, 경로 상수, 보고서·메트릭 확장 |
| `.gitignore` | 수정 — 3개 패턴 추가 |
| `data/tourapi/snapshots/busan/2026-07-23/run-001/` | 신규 (baseline) |
| `data/tourapi/snapshots/busan/2026-07-23/run-002/` | 신규 (반복 실행 검증) |
| `data/tourapi/candidates/busan/busan-batch-diff.csv` | 신규 |
| `data/tourapi/reports/busan/busan-batch-diff-metrics.json` | 신규 |
| `data/tourapi/reports/busan/busan-raw-cleanup-candidates.json` | 신규 |

---

## 2. 저장공간 정책 결과

| 항목 | 값 |
|---|---|
| 디스크 여유 | 373.1GB [fs.statfsSync] |
| 2GB 기준 | PASS (수집 진행) |
| Raw 파일 수 | 49개 |
| Raw 총 용량 | 5.9MB |
| 14일 초과 후보 | **0개** (2026-07-23 1일치만 존재) |
| cleanup 보고서 | `data/tourapi/reports/busan/busan-raw-cleanup-candidates.json` |

---

## 3. 스냅샷 경로

```
data/tourapi/snapshots/busan/
  2026-07-23/
    run-001/   ← baseline (첫 실행, 이전 스냅샷 없음)
      busan-batch-normalized.json  (3,952건)
      snapshot-meta.json           (status=completed)
    run-002/   ← 반복 실행 검증용
      busan-batch-normalized.json  (3,952건)
      snapshot-meta.json           (status=completed)
```

같은 날 재실행 시 run-003, run-004… 자동 증가. 다른 날 실행 시 새 날짜 디렉터리에 run-001부터 시작.

---

## 4. baseline 및 diff 결과

| 항목 | 값 |
|---|---|
| baseline | `2026-07-23/run-001` (이전 스냅샷 없음 → 자동 저장) |
| 비교 대상 | `2026-07-23/run-001` |
| 비교 필드 | title, address, latitude, longitude, image_url, description |
| diff CSV 행 수 (헤더 제외) | **0건** (new=0, changed=0, missing_once=0) |
| unchanged | 3,952건 |

---

## 5. 반복 실행 검증

### 동일 raw 재실행 (idempotency)

| 분류 | 건수 | 기대 | 결과 |
|---|---|---|---|
| new | 0 | 0 | PASS |
| changed | 0 | 0 | PASS |
| missing_once | 0 | 0 | PASS |
| unchanged | 3,952 | 3,952 | PASS |

### Synthetic test

수동으로 synthetic previous를 구성해 3개 분류 모두 검출 확인:

| 조작 내용 | 기대 분류 | 검출 source_key | 결과 |
|---|---|---|---|
| previous에서 레코드 1건 제거 | new | `AttractionService:255:ko` | PASS |
| previous의 title 필드 변경 | changed | `AttractionService:343:ko` | PASS |
| previous에 가짜 레코드 추가 | missing_once | `SYNTHETIC:99999:ko` | PASS |

```
new: 1 ≥ 1 → PASS
changed: 1 ≥ 1 → PASS
missing_once: 1 ≥ 1 → PASS
unchanged: 3,950 → PASS
```

---

## 6. 기존 배치 수치 유지 여부

| 항목 | 기준 | 실제 | 결과 |
|---|---|---|---|
| normalized | 3,952 | 3,952 | PASS |
| high | 2,364 | 2,364 | PASS |
| manual_review | 66 | 66 | PASS |
| unlinked (insufficient_evidence) | 92 | 92 | PASS |
| source_key 중복 | 0 | 0 | PASS |
| 재처리 일치 | PASS | PASS | PASS |

---

## 7. `.gitignore` 반영

추가된 3개 패턴:

```
data/tourapi/raw/
data/tourapi/snapshots/
data/tourapi/normalized/**/*-batch-normalized.json
```

---

## 8. Git 상태

git 저장소 미초기화. commit/push 없음. 비밀값 노출 없음.

---

### 후속 과제 (문서화)

`ended_event` 분류는 현재 수집 스키마에 Festival 날짜 필드(`event_start_date`, `event_end_date`)가 없어 구현 보류. 해당 필드 도입 이후 `COMPARE_FIELDS`와 diff 분류 로직에 추가 예정.

---

TASK-DATA-BUSAN-REPEAT-AUTOMATION-01-REV 반복 운영 자동화 완료.
