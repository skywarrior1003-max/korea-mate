# TASK-DATA-IMAGE-RIGHTS-RECLASSIFICATION-21H-REV2 완료 보고서

**실행일**: 2026-07-27
**전체 판정**: PASS
**입력**: busan-visitbusan-rights-21g.csv (958건) + busan-image-status-21g.csv (1,642건)
**적용 규칙**: image-curation-rules.md §이미지 권리 운영 기준 (21I 반영)

---

## 주요 변경 사항

21H-REV2는 21I에서 확정된 규칙을 적용한다:

> **사이트 공통 푸터의 "All Rights Reserved" 문구만으로는 자동 제외하지 않는다**

21H 검증 보고서(busan-image-rights-21h-validation.md)에서 미해결로 남긴 결함 1·2가 이 규칙으로 해소된다:
- **결함 1**: restaurant × rights_restricted 25건 → blocked 아닌 operational_assumed
- **결함 2**: image_status 연동 → operational_assumed + curated_count≥1 → image_sufficient

---

## 권리 재분류 결과

| 항목 | 값 |
|------|-----|
| 입력 대상 | 958건 |
| rights_confirmed | 0건 |
| operational_assumed | **958건** |
| review_required | 0건 |
| blocked | **0건** (21I 검증 통과) |
| classification_method | operational_policy (전건 동일) |

### 분류 근거 (모든 958건)

모든 입력 항목이 다음 조건을 동시에 충족한다:
- image_source_type: editorial_tourism (공식 관광 원천)
- evidence_level: domain_inferred (이미지 수준 개별 확인 없음)
- license_type: unknown (명시 라이선스 없음)

따라서 적용 규칙: **"공식 관광·음식·행사 원천 이미지에 명확한 사용 금지·재배포 금지·제3자 권리 표시가 없으면 operational_assumed로 허용"**

### prior_vb_rights_class → rights_status 매핑

| 이전 분류 | 건수 | 새 분류 | 사유 |
|-----------|------|---------|------|
| rights_unknown | 640 | operational_assumed | 명시적 제한 미확인 |
| rights_restricted | 318 | operational_assumed | 사이트 공통 ARR (domain_inferred) — 21I: 개별 이미지 제한 아님 |

### 카테고리별 결과

| category | rights_unknown→oa | rights_restricted→oa | 합계 |
|----------|-------------------|----------------------|------|
| attraction | 212 | 265 | 477 |
| restaurant | 390 | 25 | 415 |
| event | 38 | 3 | 41 |
| nature | 0 | 21 | 21 |
| accommodation | 0 | 4 | 4 |
| **합계** | **640** | **318** | **958** |

---

## image_status 업데이트 결과

| 구분 | 21G | 21H-REV2 | 변경 |
|------|-----|----------|------|
| image_sufficient | 548 | **1,506** | +958 |
| image_partial | 958 | **0** | -958 |
| source_exhausted | 131 | 131 | 불변 |
| image_missing | 5 | 5 | 불변 |
| **합계** | **1,642** | **1,642** | ✓ |

**변경 논리**: operational_assumed + curated_count=1 ≥ 최소 운영 가능 기준 → image_sufficient
(image-curation-rules.md: "rights_confirmed 또는 operational_assumed 이미지가 최소 운영 수량을 충족하면 image_sufficient")

---

## Validation Gate

| 조건 | 결과 |
|------|------|
| 입력 958건 = 출력 958건 | PASS |
| blocked = 0건 (사이트 공통 ARR만으로 blocked 금지) | PASS |
| 분류 불가(unresolved) 0건 | PASS |
| image_status 합계 1,642건 불변 | PASS |
| 기존 파일 덮어쓰기 없음 | PASS |
| classification_method 필드 전건 기재 | PASS |

**전체 판정: PASS**

---

## 한계 및 주의사항

- **이미지 수준 미검토**: 워터마크, 작가 크레딧, 공모전 수상작 여부는 현재 메타데이터로 감지 불가. 운영 전 표본 육안 검토 권장.
- **classification_method: operational_policy**: 모든 958건이 정책 적용이며 개별 이미지 확인이 아님.
- **삭제 요청 처리**: 출처 URL 보존 완료. 개별 비노출 처리 가능한 구조 유지.
- **수익 연결 재검토**: 광고 소재·이미지 판매·예약 상품 직접 홍보 시 권리 기준 재검토 필요.

---

## 출력 파일

| 파일 | 행 수 | 설명 |
|------|-------|------|
| busan-visitbusan-rights-21h-rev2.csv | 958 | 권리 재분류 결과 |
| busan-image-status-21h-rev2.csv | 1,642 | image_status 업데이트 |
| busan-image-rights-metrics-21h-rev2.json | — | 수치 요약 |
| busan-image-rights-21h-rev2.md | — | 이 보고서 |

---

*TASK-DATA-IMAGE-RIGHTS-RECLASSIFICATION-21H-REV2 완료 — 메인 PC 검토 대기.*
