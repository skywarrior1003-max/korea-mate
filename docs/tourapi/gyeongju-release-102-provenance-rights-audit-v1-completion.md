# TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1 — 완료 보고서

**완료일**: 2026-08-06  
**브랜치**: `research/gyeongju-release-102-provenance-rights-audit-v1`  
**기준 HEAD**: `ca64e5c` (TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION-V1)  
**스크립트 버전**: v1.0.0  
**감사 대상**: RELEASE 102건 (경주 GJ08 API 기반)

---

## 1. 태스크 개요

RELEASE-HOLD 분류(ca64e5c)로 결정된 RELEASE 102건의 이미지·설명 원천 계보 및 사용 권리를 분류 스크립트와 독립적으로 감사한다.

**검증 이전 세션 (1차 제출)**:
- 5개 개선 항목(IMP-01~IMP-05) 식별
- IMP-01(normalize.py 미참조), IMP-02(raw empty fallback 부재)를 HIGH 블로커로 초기 판정
- 실행 보류 → 검증보고서만 작성

**2차 제출 (본 세션) 재검토 결과**:
- IMP-01 재검토: `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT`는 raw 필드명 없이도 달성 가능
  (`candidate.source + source_fact_id + source_contract COLLECTION_ALLOWED` 충분)
- IMP-02 재검토: `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` 자체가 raw 미보존 상황의 올바른 fallback
- 따라서 IMP-01·IMP-02는 블로커 아님 → **EXECUTE 결정**

---

## 2. 입력 검증

| 항목 | 값 |
|---|---|
| RELEASE 후보 | 102건 |
| 중복 ID | 0건 |
| source_fact 유효 | 102/102 |
| 이미지 있음 | 102/102 |
| 설명 있음 | 102/102 |
| source_fact namespace | GJ08 전부 (102/102) |
| v1_source | baseline_831 전부 |
| 입력 무결성 | **PASS** |

---

## 3. 원천 계보 분석 (S2)

| 계보 판정 | 건수 |
|---|---|
| GJ_API_PRIMARY_ONLY | 68건 (GJ08만, 보조 없음) |
| GJ_API_PRIMARY_MULTISOURCE | 29건 (GJ08 + GJ09 or KTO39) |
| GJ_API_PRIMARY_VG_IDENTITY_LINKED | 5건 (GJ08 + VG identity link) |

- **전체 102건**: GJ08 API 기반 (`gyeongju-city/menuRstrtService`, `provenance.operation=getMenuRstrt`)
- VG identity linked 5건: `_web_source_facts_linked` = VG-REST SF (identity reconciliation 목적); image_url은 전부 `www.gyeongju.go.kr` (GJ08 CDN)

---

## 4. VG 조정 (S3)

| 항목 | 값 |
|---|---|
| VG 레스토랑 identity audit | 84건 |
| VG souvenir audit | 8건 |
| multilingual entity link | 92건 |
| attraction identity audit | 159건 |
| RELEASE 102 중 VG identity audit 매칭 | 5건 |
| RELEASE 102 중 VG web 이미지·설명 사용 | **0건** |
| 조정 판정 | **RELEASE_102_RECONCILED** |

**설명**: VG 84건 = VG 웹 레스토랑 ↔ GJ08 API 후보 identity link audit. RELEASE 102건 = GJ08 API 품질 통과 풀. 두 집합은 독립적이다. VG identity 링크가 있는 5건도 이미지·설명은 GJ08 API에서 가져온다.

---

## 5. 이미지 권리 감사 (S4)

| 권리 판정 | 건수 |
|---|---|
| VERIFIED_ALLOWED_BY_SOURCE_CONTRACT | **102** |
| RIGHTS_REVIEW_REQUIRED | 0 |
| RIGHTS_EVIDENCE_MISSING | 0 |
| NO_IMAGE | 0 |

**근거**:
- source_fact_id: GJ08-xxx (102/102 유효)
- source contract: `rights_status=COLLECTION_ALLOWED`, `usage_rights=이용허락범위: 제한 없음`
- image_url: 전부 `www.gyeongju.go.kr` (GJ08 CDN, VG 도메인 아님)
- raw 미보존 → `data_gap=raw_source_record_not_retained` (기록됨)
- 판정 근거: `["source_fact", "source_contract", "candidate_provenance"]`

---

## 6. 설명 권리 감사 (S5)

| 권리 판정 | 건수 |
|---|---|
| VERIFIED_ALLOWED_BY_SOURCE_CONTRACT | **102** |
| NO_DESCRIPTION | 0 |

**근거**: GJ08 API 응답(CON_CONTENT 필드, `gyeongju_normalize.py` 기록) + GJ08 source contract COLLECTION_ALLOWED. raw 미보존이지만 `candidate.source + provenance.operation(getMenuRstrt) + source contract`로 충분.

---

## 7. Domain-only 탐지 (S6)

| 항목 | 결과 |
|---|---|
| 탐지 대상 | `scripts/gyeongju_release_hold_classification_v1.py` |
| OFFICIAL_IMG_DOMAINS | `{"tong.visitkorea.or.kr", "www.gyeongju.go.kr"}` |
| domain-only 권리 결정 탐지 | **DOMAIN_ONLY_RIGHTS_DECISION_FOUND** |
| 본 감사 스크립트의 domain-only 사용 | false |
| 결함 코드 | **DEF-AUD-H01 (HIGH)** |

**설명**: RELEASE-HOLD 분류 스크립트가 `OFFICIAL_IMG_DOMAINS` allowlist로 이미지 권리를 판정한다. 이는 방법 결함이나, 결론(RELEASE)은 GJ08 source contract COLLECTION_ALLOWED로 사후 확인됨.

---

## 8. 최종 판정 (S7)

| 감사 판정 | 건수 |
|---|---|
| RELEASE_CONFIRMED_METADATA_LIMITED | **102** |
| RELEASE_CONFIRMED | 0 |
| RIGHTS_REVIEW_REQUIRED | 0 |
| RELEASE_BLOCKED_RIGHTS_EVIDENCE_MISSING | 0 |

**RELEASE_CONFIRMED_METADATA_LIMITED 정의**: 이미지·설명 권리 확인 (source contract 기반), raw 원본 미보존으로 필드 수준 검증 불가 → 활용 범위 제한 있음.

**재분류 필요**: 0건. HOLD 전환 없음.

---

## 9. 결함 등록부 (S11)

| 결함 ID | 등급 | 내용 |
|---|---|---|
| **DEF-AUD-H01** | HIGH | RELEASE-HOLD 분류 스크립트의 domain-only 권리 판정 방법 |
| **DEF-AUD-M01** | MEDIUM | GJ08·GJ09·KTO39 SF raw 전체 미보존 |
| **DEF-AUD-M02** | MEDIUM | image_rights_status 필드 = RIGHTS_UNKNOWN (파이프라인 갱신 미이행) |
| **DEF-AUD-L01** | LOW | VG 84 vs RELEASE 102 레이블 혼동 위험 |

### DEF-AUD-H01 조치 방안
`derive_image_rights()` 함수를 `source_fact + source_contract` 기반으로 교체. `OFFICIAL_IMG_DOMAINS` 허용목록 제거. 본 감사 스크립트 `determine_image_rights()` 참조.

---

## 10. Run1=Run2 검증

| 항목 | 결과 |
|---|---|
| 비교 파일 수 | 12 |
| BYTE_IDENTICAL | **12/12** |
| 불일치 | 0 |
| 최종 판정 | **BYTE_IDENTICAL_PASS** |

비결정적 요소 제거: `Path(__file__).resolve()` 사용, as_of 고정, sort_keys=True, 후보 정렬 고정, datetime.now() 미사용.

---

## 11. 종합 감사 결과

| 항목 | 결과 |
|---|---|
| 입력 무결성 | PASS |
| 이미지 권리 | 102건 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT |
| 설명 권리 | 102건 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT |
| VG 조정 | RELEASE_102_RECONCILED |
| domain-only 탐지 | DOMAIN_ONLY_RIGHTS_DECISION_FOUND (분류 스크립트) |
| 최종 판정 | 102건 RELEASE_CONFIRMED_METADATA_LIMITED |
| 재분류 필요 | 0건 |
| 결함 (HIGH/MEDIUM/LOW) | 1 / 2 / 1 |
| **종합 판정** | **CONDITIONAL_PASS** |
| **감사 상태** | **GYEONGJU_RELEASE_102_RIGHTS_AUDIT_COMPLETE** |

---

## 12. 생성 파일 목록

### 스크립트
- `scripts/gyeongju_release_102_provenance_rights_audit_v1.py` (v1.0.0)

### 검증 보고서 (1차 제출)
- `docs/tourapi/gyeongju-release-102-provenance-rights-audit-verification-report-v1.md`

### 감사 출력 (`data/tourapi/validation/gyeongju/`)
- `gyeongju-release-102-input-audit-v1.json`
- `gyeongju-release-102-source-lineage-v1.jsonl` (102건)
- `gyeongju-release-102-vg-reconciliation-v1.json`
- `gyeongju-release-102-image-rights-audit-v1.jsonl` (102건)
- `gyeongju-release-102-description-rights-audit-v1.jsonl` (102건)
- `gyeongju-release-102-domain-decision-audit-v1.json`
- `gyeongju-release-102-final-verdict-v1.jsonl` (102건)
- `gyeongju-release-102-rights-missing-queue-v1.jsonl` (0건)
- `gyeongju-release-102-reclassification-queue-v1.jsonl` (0건)
- `gyeongju-release-102-audit-defects-v1.jsonl` (4건)
- `gyeongju-release-102-audit-summary-v1.json`
- `gyeongju-release-102-sha-audit-v1.json`

### 정책 문서
- `docs/tourapi/multicity-release-provenance-rights-gate-v1.md`

---

## 13. 다음 단계

1. **DEF-AUD-H01 수정**: `gyeongju_release_hold_classification_v1.py`의 domain-only → contract-based 권리 판정 교체
2. **DEF-AUD-M01 수정**: 정규화 파이프라인에서 SF.raw 보존 구현
3. **DEF-AUD-M02 수정**: 파이프라인에서 image_rights_status 필드 갱신 단계 추가
4. **운영 DB 반영**: RELEASE 102건 중 `RELEASE_CONFIRMED_METADATA_LIMITED` 상태 명시 후 별도 승인 절차
5. **부산 적용**: `multicity-release-provenance-rights-gate-v1.md` 기준으로 부산 RELEASE 감사 적용
