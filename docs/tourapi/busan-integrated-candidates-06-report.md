# TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**

---

## 1. 상태별 건수

| candidate_status | 건수 |
|---|---|
| existing_enriched | 362 |
| api_only_existing | 990 |
| web_only_new | 353 |
| course_reference | 49 |
| manual_review (canonical) | 4 |
| manual_review (VB) | 9 |
| **합계** | **1767** |

---

## 2. 보강 필드 수 (existing_enriched 362건 기준)

| 필드 | 보강 건수 | 비율 |
|---|---|---|
| hours | 357 | 98.6% |
| phone | 357 | 98.6% |
| external_official_url | 50 | 13.8% |

---

## 3. 신규 web_only 후보

| 항목 | 건수 |
|---|---|
| web_only_new (비-코스) | 353 |
| course_reference | 49 |
| **합계** | **402** |

---

## 4. manual_review

| 원천 | 건수 |
|---|---|
| canonical manual_review | 4 |
| VB manual_review | 9 |
| **합계** | **13** |

→ `busan-integrated-manual-review.csv` 별도 저장

---

## 5. unknown_allowed 및 좌표 충돌

| 항목 | 건수 | 내역 |
|---|---|---|
| unknown_allowed (shopping·experience web_only) | 173 | shopping:53 + experience:120 |
| 좌표 충돌 (coordinate_distance_m > 0) | 2 | existing_enriched 1건 + manual_review 1건 |

unknown_allowed: city_spots 5종 카테고리에 직접 대응되지 않는 shopping/experience 유형.
현재 `attraction`으로 임시 매핑, `subcategory=unknown`, 운영 반영 전 수동 검토 필요.

**좌표 충돌 추적:**

| candidate_id | status | distance_m | manual_review 포함 |
|---|---|---|---|
| busan-K-00739 | existing_enriched | 14m | ✗ (CSV coordinate_distance_m 필드에만 기록) |
| busan-VBM-1640 | manual_review | 4m | ✓ (busan-integrated-manual-review.csv 포함) |

`busan-K-00739`은 canonical 좌표 우선 적용됨. 운영 반영 전 수동 확인 권장.

---

## 6. 검증 조건

| 조건 | 결과 |
|---|---|
| canonical 1,356건 전부 추적 | ✓ (1356건) |
| matched 362건 existing_enriched | ✓ |
| web_only 402건 전부 추적 | ✓ (web_only_new 353 + course 49 = 402) |
| api_only 990건 전부 추적 | ✓ |
| VB manual_review 9건 별도 추적 | ✓ |
| canonical manual_review 4건 별도 추적 | ✓ |
| 총수·상태별 합계 일치 | ✓ |
| matched canonical_id 중복 0 | ✓ |
| candidate_id 중복 0 | ✓ |
| field_provenance 누락 0 | ✓ |
| 원본 canonical·VB full 무변경 | ✓ (읽기 전용) |

---

## 7. 변경 파일

| 파일 | 내용 |
|---|---|
| busan-integrated-candidates.csv | 1767행 통합 후보 |
| busan-integrated-candidates.json | 1767건 JSON |
| busan-integrated-manual-review.csv | 13건 검토 대상 |
| busan-integrated-candidates-metrics.json | 지표 요약 |
| busan-integrated-candidates-06-report.md | 본 보고서 |

---

TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-06 부산 최종 통합 후보 생성 완료.

---

## FINALIZE-10: 최종 통합 후보 정리 결과

**날짜:** 2026-07-24
**상태:** **PASS ✓**
**입력:** unknown_allowed 173건 (shopping:53 + experience:120)

### 판정 결과

| 최종 상태 | 건수 | 설명 |
|---|---|---|
| ready_for_candidate (web_only_new confirmed) | 131 | 기존 116 + 추가 확정 15 |
| merge_existing | 12 | 기존 canonical 또는 VB 후보에 병합 |
| reference_only | 21 | 기존 18 + 추가 3 |
| excluded | 8 | 장소 아님 제외 |
| unresolved (manual_review) | 1 | busan-VB-1859 (K-POP 동문) |
| **합계** | **173** | ✓ |

### 활성 운영 후보

| candidate_status | 건수 |
|---|---|
| web_only_new | 311 |
| existing_enriched | 362 |
| api_only_existing | 990 |
| **활성 합계** | **1663** |

> 활성 후보 중 subcategory=unknown: **0건** ✓

### merge_existing 12건 병합 대상

| candidate_id | merge_target_id | 유형 |
|---|---|---|
| busan-VB-399 | busan-K-00058 | canonical |
| busan-VB-412 | busan-K-00057 | canonical |
| busan-VB-400 | busan-K-00176 | canonical |
| busan-VB-363 | busan-K-00148 | canonical |
| busan-VB-327 | busan-K-00055 | canonical |
| busan-VB-300 | busan-K-00190 | canonical |
| busan-VB-1870 | busan-K-00350 | canonical |
| busan-VB-1858 | busan-K-00078 | canonical |
| busan-VB-1177 | busan-K-00224 | canonical |
| busan-VB-990 | busan-VB-336 | vb_candidate |
| busan-VB-481 | busan-VB-518 | vb_candidate |
| busan-VB-542 | busan-A-00004 | canonical |

### 검증 조건

| 조건 | 결과 |
|---|---|
| 173건 전부 최종 상태 추적 | ✓ |
| 131+12+21+8+1=173 합계 일치 | ✓ |
| ready_for_candidate category/subcategory 누락 0 | ✓ |
| unknown_allowed 출신 활성 후보 subcategory=unknown 0 | ✓ |
| merge_existing 병합 대상 누락 0 | ✓ |
| reference/exclude/unresolved 활성 후보 미포함 | ✓ |
| candidate_id 중복 0 | ✓ |
| 총 행수 1767 유지 | ✓ |
| 원본 canonical·VisitBusan 무변경 | ✓ (읽기 전용) |

### 스키마 변경

- `merge_target_id` 컬럼 추가 (12건 merge_existing 추적용, 나머지 공란)
- `category_compatibility_method`: unknown_allowed → category_confirmed / merge_existing / reference_only / excluded / unresolved
- `candidate_status`: 신규 값 추가 (merge_existing, reference_only, excluded)

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| busan-integrated-candidates.csv | 173행 상태·category·subcategory 업데이트, merge_target_id 컬럼 추가 |
| busan-integrated-candidates.json | 동일 내용 JSON 갱신 |
| busan-integrated-manual-review.csv | busan-VB-1859 추가 (총 14건) |
| busan-integrated-candidates-metrics.json | FINALIZE-10 섹션 추가 |
| busan-integrated-candidates-06-report.md | 본 섹션 추가 |

---

TASK-DATA-BUSAN-INTEGRATED-CANDIDATES-FINALIZE-10 부산 통합 후보 최종 정리 완료.
