# TASK-DATA-BUSAN-CANONICAL-01 — 완료 보고서

**날짜:** 2026-07-24
**태스크:** TASK-DATA-BUSAN-CANONICAL-01
**상태:** PASS

---

## 1. 신규 파일

| 파일 | 역할 |
|---|---|
| `scripts/tourapi-busan-canonical.mjs` | 신규 — canonical 그룹 생성 스크립트 |
| `data/tourapi/candidates/busan/busan-canonical-candidates.csv` | 전체 1,465 canonical groups |
| `data/tourapi/candidates/busan/busan-canonical-manual-review.csv` | 수동 검토 그룹 상세 |
| `data/tourapi/candidates/busan/busan-canonical-parent-child.csv` | KTO ↔ Busan 이중 수록 후보 |
| `data/tourapi/candidates/busan/busan-canonical-unmatched.csv` | canonical group 미귀속 비KO |
| `data/tourapi/reports/busan/busan-canonical-metrics.json` | 유형별·원천별 메트릭 |

---

## 2. Canonical Group 결과

### 상태별 분포

| 상태 | 건수 | 기준 |
|---|---|---|
| confirmed | 723 | 모든 링크 confidence=high (score≥80) |
| manual_review | 66 | 하나 이상 confidence=manual_review (score 60-79) |
| unlinked | 676 | 언어 링크 0건 |
| **합계** | **1,465** | KO 레코드 = canonical group leaders |

### 서비스×상태 교차표

| 서비스 | 총 | confirmed | manual_review | unlinked |
|---|---|---|---|---|
| AttractionService | 213 | 207 | 3 | 3 |
| FestivalService | 40 | 34 | 2 | 4 |
| FoodService | 437 | 436 | 0 | 1 |
| KorService2 | 775 | 46 | 61 | 668 |

**KTO 676건 unlinked**: KorService2 KO 레코드의 대부분이 EngService2 EN 링크를 확보하지 못함 (GPS·명칭 유사 점수 기준 미달). parent_child 탐색으로 Busan city 데이터와의 중복 후보를 별도 제공.

### 언어 커버리지

평균 lang_count: **2.75** (KO 포함)

| 언어 | canonical group 내 포함 수 |
|---|---|
| ko | 1,465 (100%) |
| en | 787 (54%) |
| ja | 678 (46%) |
| zhs | 580 (40%) |
| zht | 526 (36%) |

---

## 3. 미매칭 비KO 레코드 (99건)

| 사유 | 건수 | 설명 |
|---|---|---|
| insufficient_evidence_only | 37 | unlinked CSV에 등록(score 50-59)됐으나 다른 KO에도 linked되지 않은 고유 비KO |
| unclaimed | 62 | 어떤 KO와도 50점 이상 매칭 없는 비KO |
| **합계** | **99** | |

---

## 4. parent_child 후보 (2,140건)

KTO(KorService2) ↔ Busan city 서비스 간 GPS 300m 이내 쌍.  
Festival 간 매칭 제외 (행사는 별도 canonical event 유지 원칙).

| dist_m 구간 | 건수 | 해석 |
|---|---|---|
| 0 – 50m | 228 | 동일 건물·입구 가능성 높음 |
| 51 – 100m | 233 | 동일 장소 가능성 높음 |
| 101 – 200m | 704 | 인접 구역, 수동 검토 필요 |
| 201 – 300m | 975 | 같은 동네, 별도 장소일 가능성 있음 |

- 고유 KTO canonical group: **508건** (774건 중 66%)이 Busan과 1개 이상 매칭
- 최대 매칭 수: 26 (밀집 상권 내 단일 KTO 레코드 ↔ 26개 Busan 레코드)

**검토 우선순위**: `dist_m ≤ 100m` 461건이 가장 실용적인 검토 범위.

---

## 5. 전체 레코드 추적 검증

| 항목 | 수치 | 결과 |
|---|---|---|
| KO records (canonical group leaders) | 1,465 | ✓ |
| 링크된 비KO (language links target) | 2,571 | ✓ |
| insufficient_evidence_only | 37 | ✓ |
| unclaimed | 62 | ✓ |
| **합계** | **4,135** | ✓ PASS |
| source_key 중복 귀속 | 0 | ✓ PASS |
| canonical_id 중복 | 0 | ✓ PASS |
| festival이 parent_child에 포함 | 0 | ✓ PASS |

---

## 6. 기존 수치 유지 검증

| 항목 | 기준 | 실제 | 결과 |
|---|---|---|---|
| 비Festival high confidence 링크 | 2,364 | 2,364 | ✓ PASS |
| 비Festival manual_review 링크 | 66 | 66 | ✓ PASS |
| 비Festival unlinked CSV rows | 92 (베이스라인) | 96 | △ |

**unlinked +4 설명:** festival 통합 후 언어 링크 재실행 시 KTO 타겟 풀(EngService2 EN)에 FestivalService EN이 추가됨. 기존 KorService2 KO 4건이 FestivalService EN 레코드를 score 50-59로 발견 → insufficient_evidence 신규 진입. high/manual_review 수치는 동일하므로 데이터 무결성에 영향 없음.

---

## 7. CSV 포맷 참고

- `event_period_raw`에 포함된 개행 문자(`\n`)를 공백으로 정규화하여 CSV 임베드 개행 방지.
- parent_child CSV는 dist_m 오름차순 정렬 (가까운 쌍이 먼저).
- `candidates.csv`의 `languages` 컬럼은 파이프(`|`) 구분 (예: `ko|en|ja|zhs|zht`).

---

## 8. Git 상태

git add / commit / push 없음. 비밀값 노출 없음.

---

TASK-DATA-BUSAN-CANONICAL-01 Canonical Grouping 완료.
