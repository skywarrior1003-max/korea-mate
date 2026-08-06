# 멀티시티 소스 출처(Provenance) 필수 필드 가이드 v1

**문서 번호**: multicity-source-provenance-required-fields-v1  
**작성일**: 2026-08-06  
**기반 태스크**: TASK-GYEONGJU-RELEASE-RIGHTS-RESOLUTION-OVERLAY-V1  
**관련 문서**: [multicity-release-provenance-rights-gate-v1.md](multicity-release-provenance-rights-gate-v1.md)  
**상태**: ACTIVE — 다음 도시 파이프라인 구현에 필수 적용

---

## 1. 목적

경주(GJ) 파이프라인 사후 감사에서 식별된 출처 데이터 누락(DEF-AUD-M01)을 다음 도시부터 사전 예방한다.  
이 문서는 source fact 생성 단계에서 **반드시 캡처·저장**해야 하는 필드를 규정한다.

경주 사례 교훈:
- `image_rights_status = RIGHTS_UNKNOWN` → overlay 없이는 권리 판정 불가
- `raw_field_name` 미보존 → 어느 API 필드에서 이미지·설명이 왔는지 추적 불가
- domain 기반 판정을 사용했다가 `DEF-AUD-H01` 발생 → overlay 필요

---

## 2. Source Fact 필수 필드

| 필드명 | 타입 | 설명 | 예시 | 필수 여부 |
|--------|------|------|------|----------|
| `source_fact_id` | string | `{city}-{NS}-{record_id}` 형식 | `gyeongju-GJ08-123456` | **필수** |
| `api_id` | string | NS → API ID 매핑된 값 | `GJ08`, `KTO_KorService2` | **필수** |
| `source_endpoint` | string | 데이터 수집 API endpoint | `menuRstrtService` | **필수** |
| `raw_field_name_image` | string | 이미지 URL을 담은 원본 API 필드명 | `firstimage`, `image1` | **필수** |
| `raw_field_name_description` | string | 설명을 담은 원본 API 필드명 | `overview`, `infotext` | **필수** |
| `raw_image_url` | string | 수집 시점 원본 이미지 URL | `https://...` | **권장** |
| `raw_description_text` | string | 수집 시점 원본 설명 텍스트 | (전문) | **권장** |
| `collection_timestamp` | ISO8601 | 수집 일시 | `2026-01-15T12:34:56Z` | **필수** |
| `contract_id` | string | 적용 계약 ID | `gyeongju-culture-tourism-source-contract-v1` | **필수** |
| `rights_status_at_collection` | string | 수집 시점 계약 상 권리 상태 | `COLLECTION_ALLOWED` | **필수** |
| `usage_rights_at_collection` | string | 수집 시점 이용허락범위 | `이용허락범위: 제한 없음` | **필수** |

---

## 3. Normalized Candidate 필수 필드 (image/description 권리)

| 필드명 | 타입 | 설명 | 필수 여부 |
|--------|------|------|----------|
| `image_rights_status` | string | 이미지 권리 상태 | **필수** (RIGHTS_UNKNOWN 허용 안 함) |
| `image_rights_basis` | string | 권리 판정 근거 | **필수** |
| `image_source_fact_id` | string | 이미지 출처 source fact ID | **필수** |
| `description_rights_status` | string | 설명 권리 상태 | **필수** |
| `description_rights_basis` | string | 설명 권리 판정 근거 | **필수** |
| `description_source_fact_id` | string | 설명 출처 source fact ID | **필수** |
| `provenance_completeness` | enum | `COMPLETE` \| `PARTIAL` \| `INSUFFICIENT` | **필수** |

### `image_rights_status` 허용 값

| 값 | 의미 | 사용 조건 |
|----|------|----------|
| `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` | source fact + contract 확인 | source fact 존재 + contract COLLECTION_ALLOWED + 이용허락범위: 제한 없음 |
| `VERIFIED_PUBLIC_API_FIELD_ALLOWED` | 공개 API 필드 + contract 확인 | 위 조건 + raw_field_name 확인 |
| `FACTUAL_METADATA_ALLOWED` | 사실 메타데이터 (법적 보호 제외) | 좌표·주소·전화번호 등 |
| `RIGHTS_REVIEW_REQUIRED` | 권리 검토 필요 | VG, 제3자 저작권 이미지 |
| `RIGHTS_EVIDENCE_MISSING` | 권리 증거 없음 | source fact 미연결 또는 contract 없음 |
| `DISALLOWED_FOR_RELEASE` | 릴리스 불가 | 명시적 금지 계약 또는 저작권 경고 |
| `NO_IMAGE` | 이미지 없음 | image_url 필드 없음 |

**금지 값**: `RIGHTS_UNKNOWN` — 정규화 단계에서 사용 금지. 권리 판정이 불가능하면 `RIGHTS_EVIDENCE_MISSING` 사용.

---

## 4. Source Contract 참조 구조

모든 source fact는 반드시 `contract_id`로 계약 파일을 참조해야 한다.

```json
{
  "source_fact_id": "{city}-{NS}-{record_id}",
  "api_id": "GJ08",
  "contract_id": "{city}-culture-tourism-source-contract-v1",
  "contract_path": "data/tourapi/contracts/{city}/{city}-culture-tourism-source-contract-v1.json",
  "raw_field_name_image": "firstimage",
  "raw_field_name_description": "overview",
  "rights_status_at_collection": "COLLECTION_ALLOWED",
  "usage_rights_at_collection": "이용허락범위: 제한 없음"
}
```

---

## 5. Rights Gate 자동 검증 체크리스트

신규 도시 파이프라인 구현 전 확인 항목:

- [ ] `raw_field_name_image` 전 후보 100% 채움
- [ ] `raw_field_name_description` 전 후보 100% 채움
- [ ] `image_rights_status = RIGHTS_UNKNOWN` 후보 수 = 0
- [ ] `description_rights_status = RIGHTS_UNKNOWN` 후보 수 = 0
- [ ] domain 단독 positive verdict 수 = 0
- [ ] `source_fact_id` → contract 연결 100% 확인
- [ ] 계약서 파일 존재 및 `rights_status`, `usage_rights` 필드 채움

---

## 6. Domain-Only Positive Verdict 금지

> **절대 금지**: URL 도메인만을 근거로 `VERIFIED_ALLOWED_BY_SOURCE_CONTRACT` 또는 `VERIFIED_PUBLIC_API_FIELD_ALLOWED` 판정 불가

공식 도메인(`www.gyeongju.go.kr`, `tong.visitkorea.or.kr` 등)도 단독으로는 권리 허가 근거가 되지 않는다.  
항상 `source_fact_id` → `contract` 체인이 존재해야 positive verdict 가능.

**예외 없음**: 도메인은 host_consistency 보조 검사에만 사용.

경주 DEF-AUD-H01 사례:
```python
# 금지 패턴 (경주 classification script 방식)
OFFICIAL_IMG_DOMAINS = {"tong.visitkorea.or.kr", "www.gyeongju.go.kr"}
if dom in OFFICIAL_IMG_DOMAINS:
    return "OFFICIAL_API_IMAGE_USABLE", dom  # ← domain만으로 허용 판정 — 금지

# 올바른 패턴
if not sfid or sfid not in sf_index:
    return "RIGHTS_EVIDENCE_MISSING", "no_source_fact"
api_c = get_api_contract(ns)
if api_c["rights_status"] == "COLLECTION_ALLOWED" and "제한 없음" in api_c["usage_rights"]:
    return "VERIFIED_ALLOWED_BY_SOURCE_CONTRACT", "source_fact+contract"
```

---

## 7. VG(Visit Gyeongju) 웹 연결 출처 처리

VG 웹 소스 팩트(`_web_source_facts_linked`)는 **identity 일치 증거**로만 사용한다.  
이미지·설명 출처로 선택되면 `RIGHTS_REVIEW_REQUIRED` 처리 (자동 허용 불가).

| 상황 | 처리 |
|------|------|
| VG 도메인 이미지 URL | `RIGHTS_REVIEW_REQUIRED` |
| GJ API SF + VG 링크 존재 | GJ API 계약 기반 판정 (VG 무관) |
| VG SF가 primary이고 이미지 출처 | `RIGHTS_REVIEW_REQUIRED` |

---

## 8. 다음 도시 적용 순서

1. **계약 파일 작성**: `data/tourapi/contracts/{city}/{city}-source-contract-v1.json`
2. **수집 스크립트에 raw_field_name 캡처 추가**
3. **정규화 스크립트에서 RIGHTS_UNKNOWN 사용 금지**
4. **분류 스크립트에서 domain-only 로직 사용 금지** — source fact + contract 체인 사용
5. **rights resolution overlay 스크립트 실행** (이 체계 참조)
6. **Run1=Run2 BYTE_IDENTICAL 검증** 필수

---

*관련*: [multicity-release-provenance-rights-gate-v1.md](multicity-release-provenance-rights-gate-v1.md) — 상위 정책  
*참조 구현*: `scripts/gyeongju_release_rights_resolution_v1.py` (v1.0.0)
