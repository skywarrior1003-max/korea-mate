# TASK-GYEONGJU-RELEASE-RIGHTS-RESOLUTION-OVERLAY-V1 — 완료 보고서

**작성일**: 2026-08-06  
**버전**: v1.0.0  
**브랜치**: `data/gyeongju-release-rights-resolution-overlay-v1`  
**기반 커밋**: `5d79839` (TASK-GYEONGJU-RELEASE-RIGHTS-GATE-FIX-V1 검증보고서)  
**결정**: **실행 완료 — Run1=Run2 15/15 BYTE_IDENTICAL_PASS**

---

## 1. 검증 결과

### 1.1 프롬프트 검증 (실행 전)

| 항목 | 상태 | 비고 |
|------|------|------|
| 프롬프트 완정성 | ✅ COMPLETE | 전 섹션 존재 (허용경로·산출물·브랜치·Run1=Run2·커밋 포함) |
| 개선 아이디어 | ✅ 없음 | 이전 태스크 IMP-03 개선방향 이미 반영됨 |
| 이전 태스크 충돌 | ✅ 없음 | 기존 classification 동결, 새 파일만 추가 |
| 실행 결정 | **EXECUTE** | |

### 1.2 사전 검증 (preflight)

| 항목 | 결과 |
|------|------|
| 동결 파일 SHA 확인 (6건) | ✅ 모두 존재 및 SHA 기록 |
| RELEASE 후보 수 | 102건 |
| VG-linked RELEASE | 5건 (이미지: www.gyeongju.go.kr → GJ08 계약 적용) |
| 이미지 URL host 분포 | 전건 `www.gyeongju.go.kr` |
| 설명 보유 | 102/102건 |
| Source NS 분포 | 전건 `GJ08` |
| GJ08 계약 | `COLLECTION_ALLOWED`, `이용허락범위: 제한 없음` |
| 기존 overlay 파일 | NOT EXISTS (충돌 없음) |

---

## 2. 실행 결과

### 2.1 회귀 테스트 (Regression Fixtures)

| Fixture | 시나리오 | 결과 |
|---------|---------|------|
| F01 | 공식 도메인 + SF 없음 → RIGHTS_EVIDENCE_MISSING | ✅ PASS |
| F02 | 외부 CDN + 유효 SF + 허용 계약 → VERIFIED | ✅ PASS |
| F03 | 계약 존재 + 유효하지 않은 SF → RIGHTS_EVIDENCE_MISSING | ✅ PASS |
| F04 | normalized RIGHTS_UNKNOWN + 유효 계약 → overlay 허용 | ✅ PASS |
| F05 | VisitGyeongju 웹 이미지 → RIGHTS_REVIEW_REQUIRED | ✅ PASS |
| F06 | VG 웹 + SF 없음 description → RIGHTS_EVIDENCE_MISSING | ✅ PASS |
| F07 | GJ08 SF + 허용 계약 → 이미지 VERIFIED | ✅ PASS |
| F08 | GJ08 SF + 허용 계약 → 설명 VERIFIED | ✅ PASS |
| F09 | 이미지 허용 + description SF 없음 → HOLD | ✅ PASS |
| F10 | domain allowlist만 → positive verdict 0 | ✅ PASS |
| **합계** | | **10/10 PASS** |

### 2.2 권리 판정 결과 (RELEASE 102건)

| 항목 | 수치 |
|------|------|
| 이미지 권리 판정 | 102건 `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` |
| 설명 권리 판정 | 102건 `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` |
| domain_only_positive | **0건** (ZERO_CONFIRMED) |
| 최종 overlay 판정 | 102건 `RELEASE_CONFIRMED_METADATA_LIMITED` |
| 종합 판정 | **CONDITIONAL_PASS** |
| VG 이미지 자동 허용 | 0건 |

### 2.3 Run1=Run2 BYTE_IDENTICAL

| 파일 | Run1 SHA | Run2 SHA | 결과 |
|------|----------|----------|------|
| gyeongju-release-rights-frozen-baseline-v1.json | 752060a47ea8... | 동일 | ✅ PASS |
| gyeongju-release-rights-regression-fixtures-v1.json | fcbb398d648c... | 동일 | ✅ PASS |
| gyeongju-release-rights-input-integrity-v1.json | 241c90b278b7... | 동일 | ✅ PASS |
| gyeongju-release-source-contract-evidence-v1.jsonl | 57353c81ab11... | 동일 | ✅ PASS |
| gyeongju-release-image-rights-resolution-v1.jsonl | 6714f6a0a74e... | 동일 | ✅ PASS |
| gyeongju-release-description-rights-resolution-v1.jsonl | 0c52364ee18e... | 동일 | ✅ PASS |
| gyeongju-release-rights-status-overlay-v1.jsonl | a1a763a0518b... | 동일 | ✅ PASS |
| gyeongju-release-final-rights-overlay-v1.jsonl | 776e5206dbad... | 동일 | ✅ PASS |
| gyeongju-release-vg-linked-source-audit-v1.jsonl | 635c067d6155... | 동일 | ✅ PASS |
| gyeongju-release-domain-only-decision-audit-v1.json | b57201241b6f... | 동일 | ✅ PASS |
| gyeongju-release-classification-authority-audit-v1.json | fe1e0984f9ed... | 동일 | ✅ PASS |
| gyeongju-release-rights-defect-closure-v1.json | c9ca73d6995d... | 동일 | ✅ PASS |
| gyeongju-release-rights-summary-v1.json | ec75eccc9aeb... | 동일 | ✅ PASS |
| gyeongju-release-rights-missing-queue-v1.jsonl | 7eb70257593d... | 동일 | ✅ PASS |
| gyeongju-release-rights-reproducibility-v1.json | — | — | ✅ PASS |
| **합계** | | | **15/15 BYTE_IDENTICAL_PASS** |

### 2.4 동결 파일 postflight SHA

| 파일 | 결과 |
|------|------|
| scripts/gyeongju_release_hold_classification_v1.py | ✅ 변경 없음 |
| gyeongju-candidate-release-hold-v1.jsonl | ✅ 변경 없음 |
| gyeongju-event-release-hold-v1.jsonl | ✅ 변경 없음 |
| gyeongju-relation-release-usage-v1.jsonl | ✅ 변경 없음 |
| gyeongju-full-v1-candidates.jsonl | ✅ 변경 없음 |
| source-facts-full-v1.jsonl | ✅ 변경 없음 |

---

## 3. 결함(DEF) 클로저

| DEF ID | 등급 | 상태 | 처리 방법 |
|--------|------|------|----------|
| DEF-AUD-H01 | HIGH | **CLOSED_BY_SUPERSEDING_RIGHTS_OVERLAY** | overlay가 domain-only 판정을 대체; classification 스크립트는 동결 |
| DEF-AUD-M01 | MEDIUM | **CLOSED_AS_DOCUMENTED_PROVENANCE_LIMITATION** | 소급 불가; 다음 도시부터 raw_field_name 필수 적용 |
| DEF-AUD-M02 | MEDIUM | **RESOLVED_BY_RIGHTS_OVERLAY** | normalized 직접 수정 없이 overlay에서 해소 |
| DEF-AUD-L01 | LOW | **RESOLVED_REPORT_LABEL** | VG 84건 vs RELEASE 102건 구분 명시 |

---

## 4. 산출물 목록

### 신규 생성 파일 (18종)

| 파일 | 설명 |
|------|------|
| `scripts/gyeongju_release_rights_resolution_v1.py` | 권리 판정 스크립트 v1.0.0 |
| `gyeongju-release-rights-frozen-baseline-v1.json` | 동결 파일 SHA baseline |
| `gyeongju-release-rights-regression-fixtures-v1.json` | 10개 회귀 테스트 fixture |
| `gyeongju-release-rights-input-integrity-v1.json` | 입력 무결성 검사 결과 |
| `gyeongju-release-source-contract-evidence-v1.jsonl` | 후보별 source-contract 증거 (102건) |
| `gyeongju-release-image-rights-resolution-v1.jsonl` | 이미지 권리 판정 (102건) |
| `gyeongju-release-description-rights-resolution-v1.jsonl` | 설명 권리 판정 (102건) |
| `gyeongju-release-rights-status-overlay-v1.jsonl` | RIGHTS_UNKNOWN overlay (204건: 후보×2) |
| `gyeongju-release-final-rights-overlay-v1.jsonl` | 최종 권리 overlay (102건) |
| `gyeongju-release-vg-linked-source-audit-v1.jsonl` | VG-linked 5건 상세 감사 |
| `gyeongju-release-domain-only-decision-audit-v1.json` | domain-only positive 0건 확인 |
| `gyeongju-release-classification-authority-audit-v1.json` | 기존 분류 권한 현황 |
| `gyeongju-release-rights-defect-closure-v1.json` | 결함 클로저 상태 |
| `gyeongju-release-rights-summary-v1.json` | 권리 판정 종합 요약 |
| `gyeongju-release-rights-missing-queue-v1.jsonl` | 권리 미확인 대기열 (0건) |
| `gyeongju-release-rights-reproducibility-v1.json` | Run1=Run2 SHA 감사 (15/15 PASS) |
| `docs/tourapi/multicity-source-provenance-required-fields-v1.md` | 멀티시티 출처 필수 필드 가이드 |
| `docs/tourapi/gyeongju-release-rights-resolution-overlay-v1-completion.md` | 이 파일 |

### 업데이트 파일

| 파일 | 변경 내용 |
|------|----------|
| `data/tourapi/manifests/gyeongju/gyeongju-manifest-v1.json` | files_count 236 → 254 (+18건) |

---

## 5. 권한 구조 (Authority Structure)

```
[기존 분류 스크립트 — ca64e5c, 동결]
  scripts/gyeongju_release_hold_classification_v1.py
  → identity·위치·시간 정보: RETAINED_AUTHORITATIVE
  → 이미지·설명 권리: HISTORICAL_NON_AUTHORITATIVE (domain-only DEF-AUD-H01)

[이번 overlay — 이 커밋, AUTHORITATIVE]
  scripts/gyeongju_release_rights_resolution_v1.py
  data/tourapi/validation/gyeongju/gyeongju-release-final-rights-overlay-v1.jsonl
  → 이미지·설명 권리: AUTHORITATIVE_RIGHTS_RESOLUTION
  → domain-only positive: 0건 보장
  → source fact + GJ08 contract 체인 기반
```

---

## 6. 주요 원칙 준수 확인

| 원칙 | 확인 |
|------|------|
| domain 단독 positive verdict 금지 | ✅ 0건 |
| source fact + contract 체인 필수 | ✅ 전건 GJ08 계약 적용 |
| normalized RIGHTS_UNKNOWN 직접 수정 금지 | ✅ overlay만 생성 |
| 동결 파일 무결성 | ✅ postflight SHA 전건 일치 |
| frozen raw 수정 금지 | ✅ 0건 |
| HTTP·API 호출 금지 | ✅ 0건 |
| 기존 classification 스크립트 동결 | ✅ 수정 없음 |
| Run1=Run2 BYTE_IDENTICAL | ✅ 15/15 |

---

## 7. 다음 단계

1. **수동 push** (auto-classifier 제한):
   ```bash
   git push origin data/gyeongju-release-rights-resolution-overlay-v1
   git push origin research/gyeongju-release-102-provenance-rights-audit-v1
   git push origin data/gyeongju-release-hold-classification-v1
   ```

2. **RELEASE 102건 운영 DB 반영 여부** 별도 승인 필요 (`RELEASE_CONFIRMED_METADATA_LIMITED` 상태 명시)

3. **다음 도시** 파이프라인에 `multicity-source-provenance-required-fields-v1.md` 적용

4. **HOLD 보강** 태스크 (별도 태스크 설계 필요):
   - HOLD_ENRICHMENT_REQUIRED: 538건 description·이미지 보강
   - HOLD_LOCATION_INCOMPLETE: 231건 좌표·주소
   - MRQ: 15건 수동 identity 검토

---

*이전 검증보고서*: [gyeongju-release-rights-gate-fix-v1-verification-report.md](gyeongju-release-rights-gate-fix-v1-verification-report.md)  
*감사 완료보고서*: [gyeongju-release-102-provenance-rights-audit-v1-completion.md](gyeongju-release-102-provenance-rights-audit-v1-completion.md)
