# Multicity Release Provenance & Rights Gate — v1

**작성일**: 2026-08-06  
**기준 감사**: TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1  
**적용 도시**: 경주(Gyeongju) — 이후 부산·제주 등 확장 예정

---

## 목적

도시별 RELEASE 후보의 이미지·설명 사용 권리 및 원천 계보를 독립 감사(independent audit)로 검증하기 위한 게이트 기준을 정의한다. 이 문서는 RELEASE-HOLD 분류 스크립트와 분리된 **별도 권리 판정 계층**으로 동작한다.

---

## 1. 원천 계보 요건 (Source Lineage Requirements)

### 1.1 필수 증거 체인

각 RELEASE 후보는 다음 체인을 완성해야 한다:

```
candidate.source_fact_id
  → source_fact (SF) 존재 확인
  → SF.source 또는 candidate.source / provenance.primary_source
  → API·데이터셋 식별자 (예: gyeongju-city/menuRstrtService)
  → source contract
  → rights_status: COLLECTION_ALLOWED + usage_rights
```

### 1.2 링크 방법 우선순위

| 우선순위 | 방법 | 권리 판정 결과 |
|---|---|---|
| 1 | source fact + raw 원본 필드 확인 | VERIFIED_PUBLIC_API_FIELD_ALLOWED |
| 2 | source fact + source contract (raw 미보존) | VERIFIED_ALLOWED_BY_SOURCE_CONTRACT |
| 3 | source fact만 존재, contract 미확인 | METADATA_ONLY |
| 4 | source fact 없음 | RIGHTS_EVIDENCE_MISSING → HOLD |

**원칙**: SF raw 필드가 비어 있더라도 candidate.source + provenance + source contract COLLECTION_ALLOWED 조합으로 `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` 판정 가능.

---

## 2. 이미지 권리 판정 기준

### 2.1 허용 판정 조건

RELEASE 이미지는 다음 중 하나를 충족해야 한다:

- **VERIFIED_PUBLIC_API_FIELD_ALLOWED**: source fact raw에 API 응답 필드 이름 기록 + contract COLLECTION_ALLOWED
- **VERIFIED_ALLOWED_BY_SOURCE_CONTRACT**: source fact 존재 + contract COLLECTION_ALLOWED + usage 제한 없음 (raw 미보존 허용)

### 2.2 금지 판정 방법

| 금지 방법 | 결함 코드 | 설명 |
|---|---|---|
| URL 도메인 단독 판정 | DEF-AUD-H01 | `www.gyeongju.go.kr` 이라는 이유만으로 허용 처리 금지 |
| VG 웹 이미지 직접 사용 | — | visitgyeongju 도메인 이미지는 RIGHTS_REVIEW_REQUIRED |
| 공식 홈페이지 이미지 추정 | — | 공식 사이트 등장이 상업적 재사용 허가를 의미하지 않음 |

### 2.3 도메인의 보조 역할

URL 도메인은 이미지 원천을 **추정**하는 2차 증거로만 사용한다. source contract 근거가 있을 때 도메인은 추가 참조 정보다.

| 도메인 | 1차 증거 필요 여부 | 결과 |
|---|---|---|
| www.gyeongju.go.kr | source fact + contract 필요 | VERIFIED_ALLOWED_BY_SOURCE_CONTRACT |
| tong.visitkorea.or.kr | source fact + KTO contract 필요 | VERIFIED_ALLOWED_BY_SOURCE_CONTRACT |
| visitgyeongju.or.kr | VG contract 확인 필요 | RIGHTS_REVIEW_REQUIRED (현재) |
| 기타 | source fact + contract 필요 | RIGHTS_EVIDENCE_MISSING (contract 없으면) |

---

## 3. 설명(Description) 권리 판정 기준

### 3.1 허용 판정 조건

- **VERIFIED_ALLOWED_BY_SOURCE_CONTRACT**: source fact 존재 + contract COLLECTION_ALLOWED + usage 제한 없음
- **VERIFIED_PUBLIC_API_FIELD_ALLOWED**: raw 필드명(예: CON_CONTENT) 확인 + contract COLLECTION_ALLOWED

### 3.2 설명 유형 분류

| 유형 코드 | 설명 | 권리 상태 |
|---|---|---|
| PUBLIC_API_DESCRIPTION | 공공데이터포털 API 응답 필드 (예: CON_CONTENT) | VERIFIED_ALLOWED_BY_SOURCE_CONTRACT |
| AI_GENERATED | Gemini 등 AI 생성 요약 | 별도 정책 (현재 비적용) |
| VG_WEB_DESCRIPTION | VG 웹 크롤링 텍스트 | RIGHTS_REVIEW_REQUIRED |
| UNKNOWN_ORIGIN | 출처 불명 | RIGHTS_EVIDENCE_MISSING |

---

## 4. Source Contract 최소 요건

감사 스크립트가 VERIFIED_ALLOWED_BY_SOURCE_CONTRACT 판정에 사용 가능한 contract 항목:

```json
{
  "api_id": "GJ08",
  "rights_status": "COLLECTION_ALLOWED",
  "usage_rights": "이용허락범위: 제한 없음"
}
```

필수 필드: `api_id`, `rights_status=COLLECTION_ALLOWED`, `usage_rights` (제한 없음 포함)

---

## 5. Raw 데이터 보존 원칙

| 상황 | 권리 판정 결과 | 최종 판정 |
|---|---|---|
| raw 보존 + API 필드 확인 | VERIFIED_PUBLIC_API_FIELD_ALLOWED | RELEASE_CONFIRMED |
| raw 미보존 + contract COLLECTION_ALLOWED | VERIFIED_ALLOWED_BY_SOURCE_CONTRACT | RELEASE_CONFIRMED_METADATA_LIMITED |
| raw 미보존 + contract 없음 | RIGHTS_EVIDENCE_MISSING | RELEASE_BLOCKED |

**권장**: 정규화 파이프라인에서 `source_fact.raw`에 API 응답 전체를 보존할 것. raw 미보존 시 METADATA_LIMITED 상태로 남아 출판 활용 범위가 제한된다.

---

## 6. VG(VisitGyeongju) 웹 콘텐츠 처리 원칙

VG 웹 콘텐츠는 현재 계약 기준:
- `image_verdict: RIGHTS_REVIEW_REQUIRED` (© 2025 VISIT GYEONGJU. All rights reserved.)
- `description_verdict: RIGHTS_REVIEW_REQUIRED`
- `structured_metadata_verdict: METADATA_ONLY_ALLOWED`

VG identity audit 기록(예: 84건 레스토랑 링크)은 **identity reconciliation 목적**이며, VG 콘텐츠를 RELEASE 이미지·설명 원천으로 사용하는 것과 다르다.

**판정 분리 원칙**: VG identity audit 존재 여부와 VG 콘텐츠 사용 여부를 분리하여 평가.

---

## 7. 감사 스크립트 최소 요건

도시별 RELEASE 감사 스크립트는 다음 섹션을 포함해야 한다:

| 섹션 | 출력 파일 패턴 |
|---|---|
| S1 입력 무결성 | `{city}-release-NNN-input-audit-v1.json` |
| S2 원천 계보 | `{city}-release-NNN-source-lineage-v1.jsonl` |
| S3 VG/외부 조정 | `{city}-release-NNN-vg-reconciliation-v1.json` |
| S4 이미지 권리 | `{city}-release-NNN-image-rights-audit-v1.jsonl` |
| S5 설명 권리 | `{city}-release-NNN-description-rights-audit-v1.jsonl` |
| S6 domain-only 탐지 | `{city}-release-NNN-domain-decision-audit-v1.json` |
| S7 최종 판정 | `{city}-release-NNN-final-verdict-v1.jsonl` |
| S8 집계 | summary에 포함 |
| S9 권리 근거 누락 큐 | `{city}-release-NNN-rights-missing-queue-v1.jsonl` |
| S10 재분류 큐 | `{city}-release-NNN-reclassification-queue-v1.jsonl` |
| S11 결함 등록부 | `{city}-release-NNN-audit-defects-v1.jsonl` |
| S12 종합 요약 | `{city}-release-NNN-audit-summary-v1.json` |
| SHA 감사 | `{city}-release-NNN-sha-audit-v1.json` |

**Run1=Run2 BYTE_IDENTICAL 의무**: as_of 고정, sort_keys=True, 후보 정렬 고정, datetime.now() 금지.

---

## 8. 전체 판정 기준

| 판정 결과 | 의미 | RELEASE 가능 여부 |
|---|---|---|
| RELEASE_CONFIRMED | 권리 확인, raw 보존 | ✅ 즉시 |
| RELEASE_CONFIRMED_METADATA_LIMITED | 권리 확인(contract 기반), raw 미보존 | ✅ 활용 제한 있음 |
| RIGHTS_REVIEW_REQUIRED | 권리 검토 필요 (VG 등) | ⏸ 검토 후 결정 |
| RELEASE_BLOCKED_RIGHTS_EVIDENCE_MISSING | 권리 근거 없음 | ❌ HOLD 유지 |

감사 종합 판정:

| 종합 판정 | 의미 |
|---|---|
| PASS | 전체 확인, 방법 결함 없음 |
| CONDITIONAL_PASS | 전체 확인, 방법 결함 존재 (결론은 유효) |
| FAIL | 재분류 필요 또는 권리 누락 |

---

## 9. 경주 적용 결과 요약 (v1)

- **감사 대상**: RELEASE 102건 (GJ08 API 기반)
- **이미지 권리**: 102건 전부 `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` (GJ08 계약 `이용허락범위: 제한 없음`)
- **설명 권리**: 102건 전부 `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT`
- **최종 판정**: 102건 `RELEASE_CONFIRMED_METADATA_LIMITED`
- **종합**: `CONDITIONAL_PASS`
- **DEF-AUD-H01**: RELEASE-HOLD 분류 스크립트의 domain-only 판정 방법 결함 (결론은 계약으로 사후 확인)

---

*이 문서는 TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1 완료 결과에서 도출한 멀티시티 공통 기준을 담는다. 도시 추가 시 city-specific source contract와 VG/외부 contract를 각각 등록 후 동일 게이트를 적용한다.*
