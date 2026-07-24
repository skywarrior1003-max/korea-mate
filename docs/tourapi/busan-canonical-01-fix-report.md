# TASK-DATA-BUSAN-CANONICAL-01-FIX — 완료 보고서

**날짜:** 2026-07-24
**태스크:** TASK-DATA-BUSAN-CANONICAL-01-FIX
**상태:** PASS

---

## 1. 신규·변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/tourapi-busan-canonical-fix.mjs` | **신규** — 동일 장소 통합 스크립트 |
| `data/tourapi/candidates/busan/busan-canonical-candidates.csv` | **덮어쓰기** — 상태 체계 갱신 |
| `data/tourapi/candidates/busan/busan-canonical-same-place.csv` | **신규** — same_place 124쌍 상세 |
| `data/tourapi/candidates/busan/busan-canonical-manual-review.csv` | **덮어쓰기** — 언어링크 MR + 카테고리 불일치 |
| `data/tourapi/candidates/busan/busan-canonical-parent-child.csv` | **덮어쓰기** — 101-300m 참고용, nameSim 포함 |
| `data/tourapi/candidates/busan/busan-canonical-unmatched.csv` | 동일 (99건) |
| `data/tourapi/reports/busan/busan-canonical-metrics.json` | **덮어쓰기** — unlinked delta 분리 포함 |

---

## 2. 병합 알고리즘

| 항목 | 기준 |
|---|---|
| same_place 조건 | dist_m ≤ 100 AND nameSim ≥ 0.85 AND 카테고리 일치 |
| nameSim 함수 | normTitle + contains 체크(최소 3자) + 문자 bigram Jaccard |
| 카테고리 일치 | ct39(음식) ↔ FoodService / 나머지 KTO ↔ AttractionService |
| 카테고리 불일치 | → manual_review (category_mismatch) |
| 거리만 있고 이름 유사도 <0.85 | → 병합 안 함 (separate 유지) |
| 우선순위 | dist_m 오름차순 → sim 내림차순 (가장 가까운 Busan 우선 병합) |
| 참고용 parent_child | dist_m 101-300m (이름 근거 없이 참고만) |

---

## 3. 최종 Canonical Groups

### 전체 수

| 항목 | 건수 |
|---|---|
| **총 canonical groups** | **1,356** (기존 1,465 → KTO 109건 Busan 흡수) |
| 전체 추적 | 4,135 / 4,135 |

### 상태별 분포

| 상태 | 건수 | 설명 |
|---|---|---|
| **same_place** | **109** | Busan city + KTO 병합 그룹 |
| busan_confirmed | 536 | Busan 서비스, 언어링크 high |
| busan_manual_review | 1 | 언어링크 manual_review 포함 |
| busan_unlinked | 4 | 언어링크 없음 |
| kto_separate | 282 | KTO, 300m 내 Busan 매칭 없음 |
| kto_parent_child | 383 | KTO, 101-300m 참고 후보만 있음 |
| kto_manual_review | 1 | KTO-Busan 카테고리 불일치 (롯데호텔↔블루헤이븐) |
| festival_confirmed | 34 | 행사, 언어링크 high |
| festival_manual_review | 2 | 행사, 언어링크 manual_review |
| festival_unlinked | 4 | 행사, 언어링크 없음 |

### 유형별 최종 고유 수

| 유형 | 건수 |
|---|---|
| 장소·맛집 (비Festival) | 1,316 |
| 행사 (Festival, 별도 canonical event) | 40 |
| **총 canonical** | **1,356** |

---

## 4. 검증 결과

### 전체 추적

| 항목 | 수치 | 결과 |
|---|---|---|
| 원래 KO 레코드 | 1,465 | ✓ |
| 링크된 비KO | 2,571 | ✓ |
| insufficient_evidence_only | 37 | ✓ |
| unclaimed | 62 | ✓ |
| **합계** | **4,135** | ✓ PASS |
| KTO 중복 귀속 | 0 | ✓ PASS |
| candidates.csv 행 수 | 1,357 (헤더 포함) | ✓ PASS |

### 카테고리별 표본 검증

| 상태 | 표본 레코드 | 확인 내용 |
|---|---|---|
| same_place | 부산시립미술관 (AttractionService) + KorService2:130166 병합 | 정상 |
| same_place | 물꽁식당 (FoodService:109) + KorService2:132805 병합, dist=1m sim=1.0 | 정상 |
| same_place | 성일집 + 부산꼼장어맛집 성일집, dist=1m sim=0.9 (contains 체크) | 정상 |
| kto_separate | 금정산 (KTO, 300m 내 Busan 매칭 없음) | 정상 |
| festival_confirmed | 부산바다축제 (FestivalService, 비Festival과 미병합) | 정상 |
| kto_manual_review | 롯데호텔 부산 (ct32숙박) ↔ 블루헤이븐 (food) | 카테고리 불일치 → 미병합 정상 |

---

## 5. nameSim 분포 (≤100m 쌍 461건)

| nameSim 구간 | 건수 | 처리 |
|---|---|---|
| ≥ 0.85 (same_place) | 125 (카테고리 불일치 1건 제외 → 124) | 병합 후보 |
| 0.50 – 0.84 | 0 | — |
| < 0.50 | 336 | 이름 달라 GPS 근접 우연 → separate 유지 |

**분포가 명확한 이분**: sim ≥ 0.9 또는 < 0.5, 중간 구간(0.5-0.84) 실질적 0건.

---

## 6. 특이 발견

### Busan FoodService 중복 등록 의심 (15건)

same_place 124쌍 중 15건: 동일 KTO 레코드가 같은 이름·GPS의 Busan 레코드 2개와 매칭.

| KTO | Busan #1 | Busan #2 | dist |
|---|---|---|---|
| 물꽁식당 (KorService2:132805) | FoodService:109 (1m) | FoodService:1608 (3m) | 동명 2건 |
| 동백섬횟집 (KorService2:135827) | FoodService:154 (1m) | FoodService:1546 (4m) | 동명 2건 |
| 목장원 (KorService2:820382) | FoodService:1582 (2m) | FoodService:1250 (4m) | 동명 2건 |

→ Busan FoodService API 자체 내 중복 등록 가능성. 각 KTO는 가장 가까운 Busan과 병합(dist_m 우선). 두 번째 Busan 레코드는 별도 busan_confirmed로 유지.

### unlinked 92→96 원인 분리

| 구분 | 건수 | 원인 |
|---|---|---|
| festival 신규 행 | 2 | FestivalService KO 2건이 EngService2 EN과 score 50-59 |
| 비Festival 증가분 | +4 (92→96) | festival 통합 시 KTO 타겟 풀 확장 → KorService2 4건 신규 insufficient_evidence |
| 비Festival 언어링크 | high=2,364 ✓ / manual_review=66 ✓ | PASS |

---

## 7. Git 상태

git add / commit / push 없음. 비밀값 노출 없음. API 호출 없음.

---

TASK-DATA-BUSAN-CANONICAL-01-FIX 부산 실제 고유 장소 통합 완료.
