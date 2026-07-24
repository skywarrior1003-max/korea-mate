# TASK-DATA-BUSAN-BATCH-02-FIX — 완료 보고서

**날짜:** 2026-07-23
**태스크:** TASK-DATA-BUSAN-BATCH-02-FIX
**상태:** PASS

---

## 변경 파일

`scripts/tourapi-busan-batch.mjs` — 총 9개 지점 수정 (1파일)

| 변경 위치 | 내용 |
|---|---|
| `buildLanguageLinks` — `const links = []` | `const unlinked = []` 추가 |
| Pass 2 임계값 | `>= 50` → `>= 60` |
| Pass 2 else-if | score 50~59 후보를 `unlinked`에 `insufficient_evidence`로 추가 |
| 반환값 | `return links` → `return { links, unlinked }` |
| Phase 3 호출부 | 구조분해 할당, unlinked 콘솔 출력 추가 |
| Phase 4 파일 저장 | `busan-batch-unlinked-candidates.csv` 생성 추가 |
| 재처리 검증 | unlinked 수 일치 검사 포함 |
| `buildReport` | `unlinked` 파라미터 추가 및 미연결 후보 섹션 추가 |
| 메트릭 JSON | `unlinked_insufficient_evidence` 키 추가 |

---

## 수정 전후 수치

| 항목 | 수정 전 | 수정 후 | 검증 기준 |
|---|---|---|---|
| 정규화 레코드 | 3,952건 | **3,952건** | PASS (유지) |
| high | 2,353건 | **2,364건** | PASS (≥2,353 유지, 실제 개선) |
| manual_review | 113건 | **66건** | PASS (감소) |
| low | 0건 | **0건** | PASS |
| 총 링크 | 2,466건 | **2,430건** | PASS (감소) |
| unlinked (insufficient_evidence) | — | **92건** | PASS (보존) |
| source_key 중복 | PASS | **PASS** | PASS |
| API 추가 호출 | 0 | **0** | PASS |
| 재처리 일치 | PASS | **PASS** | PASS |

### 예측값 대비 실제값 차이

태스크 예측(단순 차감)과 실제 결과의 차이는 **cascade 효과** 때문입니다.

- **high**: 예측 2,353 → 실제 2,364 (+11): score=50 링크가 점령하던 target이 해제되면서 다른 KO 레코드가 해당 target을 score≥80으로 재경쟁해 high로 승격.
- **manual_review**: 예측 50 → 실제 66 (+16): 마찬가지로 freed target 일부가 score 60-79로 재경쟁됨.
- **unlinked**: 예측 63 → 실제 92 (+29): 이전에 점령당한 target을 기다리던 KO 레코드들이 대체 target을 찾지만 score=50(GPS 단독)에 그쳐 insufficient_evidence로 추가됨.

모두 알고리즘 정상 동작이며, 핵심 검증 조건은 전부 충족됩니다.

---

## unlinked 후보 저장 결과

**파일:** `data/tourapi/candidates/busan/busan-batch-unlinked-candidates.csv`

| 항목 | 값 |
|---|---|
| 헤더 | source_key_ko, source_key_target, target_language, score, dist_m, title_ko, title_target, status |
| 총 행 수 | 92건 |
| score 분포 | score=50: 92건 (전원) |
| score 범위 이탈 | 없음 (50~59 범위 내) |
| status 종류 | `insufficient_evidence` (전원) |

> score=51~59가 존재하지 않는 이유: 스코어 함수의 최소 단위가 10점(동일 카테고리·부분 명칭·동일 구)이므로 가능한 score 값은 0, 10, 20, 30, 40, 50, 60… 으로 불연속. score=50의 구성은 "GPS ≤100m(50점) 단독" 또는 "GPS ≤200m(30점) + 동일 구(20점)"의 두 가지.

---

## 재처리 검증 출력 (전문)

```
=== TASK-DATA-BUSAN-BATCH-01 ===
Date: 2026-07-23, max_pages: all, reset: false
[재개] 12/12개 원천 완료 상태

=== Phase 1: API 수집 ===
[SKIP] busan-attraction-ko: 완료 (213건)
[SKIP] busan-attraction-en: 완료 (208건)
[SKIP] busan-food-ko: 완료 (437건)
[SKIP] busan-food-en: 완료 (436건)
[SKIP] busan-attraction-ja: 완료 (209건)
[SKIP] busan-attraction-zhs: 완료 (209건)
[SKIP] busan-attraction-zht: 완료 (209건)
[SKIP] busan-food-ja: 완료 (438건)
[SKIP] busan-food-zhs: 완료 (338건)
[SKIP] busan-food-zht: 완료 (286건)
[SKIP] kto-ko: 완료 (775건)
[SKIP] kto-en: 완료 (194건)

=== Phase 2: 정규화 ===
정규화: 3952건

=== Phase 3: 언어 연결 ===
연결: total=2430 high=2364 manual=66 low=0
미연결(insufficient_evidence): 92건

=== 재처리 검증 ===
records: 3952=3952, links: 2430=2430, unlinked: 92=92 → PASS

=== 완료 요약 ===
총 요청: 49
정규화: 3952건
source_key 중복: PASS
언어 연결: 2430건
미연결(insufficient_evidence): 92건
재처리: PASS
실패 원천: 없음
```

---

## 생성·갱신 파일

| 파일 | 변경 |
|---|---|
| `scripts/tourapi-busan-batch.mjs` | 수정 (임계값 + unlinked 추적) |
| `data/tourapi/candidates/busan/busan-batch-language-links.csv` | 갱신 (2,466 → 2,430건) |
| `data/tourapi/candidates/busan/busan-batch-unlinked-candidates.csv` | **신규 생성** (92건) |
| `data/tourapi/reports/busan/busan-batch-metrics.json` | 갱신 (`unlinked_insufficient_evidence: 92` 추가) |
| `docs/tourapi/busan-batch-report.md` | 갱신 (미연결 섹션 추가) |

---

## Git 상태

git 저장소 미초기화. 변경 파일 없음.

---

TASK-DATA-BUSAN-BATCH-02-FIX 배치 연결 임계값 수정 완료.
