# 검증보고서 — TASK-GYEONGJU-RELEASE-102-PROVENANCE-RIGHTS-AUDIT-V1

**검증 결론: 실행 보류 — 3개 HIGH 구현 개선 사항 발견**

실행 조건 미충족: 데이터 실제 구조와 GPT 프롬프트의 권리 판정 규칙 사이에  
심각한 불일치가 있어, 스크립트를 그대로 실행하면 RELEASE 102건 전체에 대해  
잘못된 `RIGHTS_EVIDENCE_MISSING` 판정이 생성된다.

---

## 1. 검증 수행 내용

검증 스크립트 3종을 작성해 실제 데이터를 독립적으로 읽었다.

### 1-1. 검증 대상 파일

| 파일 | 내용 |
|------|------|
| `data/tourapi/normalized/gyeongju/gyeongju-full-v1-candidates.jsonl` | 910 candidates |
| `data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl` | 1,158 SFs |
| `data/tourapi/validation/gyeongju/gyeongju-candidate-release-hold-v1.jsonl` | 분류 결과 |
| `data/tourapi/enriched/gyeongju/gyeongju-enriched-candidates-v1.jsonl` | 831 enriched |
| `data/tourapi/contracts/gyeongju/*.json` | 5개 source contract |
| `scripts/gyeongju_normalize.py` | 정규화 스크립트 |
| `docs/media-license-policy.md` | 미디어 라이선스 정책 |

---

## 2. 검증 발견사항 — 실제 데이터 구조

### 2-1. RELEASE 102건 전체 특성 (실측)

| 항목 | 값 |
|------|-----|
| RELEASE 건수 | 102 |
| `_v1_source` | `baseline_831` 100% |
| `source_fact_id` namespace | `GJ08` 100% |
| `image_url` 도메인 | `www.gyeongju.go.kr` 100% |
| `has description_ko` | 102/102 (100%) |
| `enriched_at` | 102/102 (모두 `2026-08-03T12:59:10Z`) |
| `image_rights_status` 필드 | `RIGHTS_UNKNOWN` 100% |
| `linked_source_facts` | GJ09(15개), KTO39(19개), 없음(72개) |

### 2-2. Source Fact raw 상태 (실측)

| Namespace | SF 수 | raw 비어있는 SF | raw 있는 SF |
|-----------|-------|----------------|-------------|
| GJ08 | 108 | **108 (100%)** | 0 |
| GJ09 | 61 | **61 (100%)** | 0 |
| KTO39 | 182 | **182 (100%)** | 0 |

**모든 source fact의 raw 필드가 비어있다.** API 응답 원본이 SF에 보존되지 않았다.

### 2-3. Description 출처 (실측 + 스크립트 분석)

`scripts/gyeongju_normalize.py`를 분석해 다음을 확인했다:

```python
# GJ08 (menuRstrtService) 정규화 (L261-286)
img = f'https://www.gyeongju.go.kr/upload/{img}'  # img 경로를 CDN URL로 조합
add_sf({
    'source_fact_id': f'gyeongju-GJ08-{uid}',
    'source': 'gyeongju-city/menuRstrtService',
    'description_ko': strip_html(it.get('CON_CONTENT')),   # GJ08 API 응답 필드
    'image_url': img or None,                               # GJ08 API 응답 img 경로 → CDN
    'image_rights_status': 'RIGHTS_UNKNOWN',               # 권리 판정 미완료 마킹
})
```

즉:
- **description_ko**: GJ08 API 응답의 `CON_CONTENT` 필드에서 추출
- **image_url**: GJ08 API 응답의 이미지 경로를 `https://www.gyeongju.go.kr/upload/` + 경로로 조합

두 값 모두 GJ08 API에서 왔다. GJ09도 동일 패턴 사용.  
단, API 원본 응답(raw)이 SF에 보존되지 않아 필드명 참조 불가.

### 2-4. Source Contract 권리 상태 (실측)

| 계약 | rights_status | usage_rights |
|------|--------------|--------------|
| GJ08 (menuRstrtService) | `COLLECTION_ALLOWED` | 이용허락범위: 제한 없음 |
| GJ09 (eatHtpService) | `COLLECTION_ALLOWED` | 이용허락범위: 제한 없음 |
| KTO KorService2 | `COLLECTION_ALLOWED` | 이용허락범위: 제한 없음 |
| VisitGyeongju (v1) | `RIGHTS_REVIEW_REQUIRED` | 구조화 메타데이터만 허용 |

**GJ08 계약은 이미지 및 설명 사용을 명시적으로 허용한다.**  
VG 계약은 이미지·설명 모두 `RIGHTS_REVIEW_REQUIRED`이다.

### 2-5. VG 84건 vs RELEASE 102건 실제 관계 (실측)

| 항목 | 값 | 비고 |
|------|-----|------|
| VG restaurant identity audit 건수 | 84 | `gyeongju-restaurant-identity-audit-v1.jsonl` |
| VG-linked RELEASE candidates | **5** | `_web_source_facts_linked` 또는 VG linked_sf 보유 |
| VG-linked HOLD candidates | 242 | — |
| RELEASE 102에서 GJ08-only (VG 미연결) | ~97 | — |

즉, VG 84건은 VG 웹 레스토랑을 GJ08 baseline에 연결한 **identity audit 레코드** 수이지,  
RELEASE 102건의 subset이 아니다. RELEASE 102는 GJ08 API 기반 candidates이며  
VG와 직접 연결된 RELEASE는 5건뿐이다.

---

## 3. 발견된 구현 개선 사항

### [IMP-01] HIGH — 정규화 스크립트가 허용 읽기 목록에 없음

**문제:**  
이미지·설명의 API 원본 필드명(`CON_CONTENT`, 이미지 경로 조합 로직)은  
오직 `scripts/gyeongju_normalize.py`에만 문서화되어 있다.  
현재 프롬프트의 "읽기만 허용" 목록에 scripts/ 는 포함되지 않았다.

**영향:**  
감사 스크립트가 정규화 스크립트를 읽지 못하면 description과 image의  
API 필드 원점을 확인할 수 없다. 이로 인해:
- description: SF에 description_ko 없음 → `RIGHTS_EVIDENCE_MISSING` (오판)
- image: SF raw 없음 → `RIGHTS_EVIDENCE_MISSING` (오판)

실제로는 GJ08 API `CON_CONTENT` → `VERIFIED_PUBLIC_API_FIELD_ALLOWED`이어야 한다.

**개선 방향:**  
허용 읽기 목록에 다음 추가:
```
- scripts/gyeongju_normalize.py  (이미지·설명 API 원본 필드 문서화)
- scripts/gyeongju_normalize_full_v1.py  (v1 정규화 로직)
```
또는 source contract에 `image_source_field: CON_CONTENT`, `description_source_field: CON_CONTENT` 항목 추가.

---

### [IMP-02] HIGH — SF raw 비어있을 때의 권리 판정 규칙 부재

**문제:**  
프롬프트 Section 4는 다음을 요구한다:
> "해당 이미지가 실제 API 응답 필드에서 제공됐는지 확인"
> "raw source record" 검증

그러나 GJ08/GJ09/KTO39 SF의 raw 필드가 100% 비어있다.  
프롬프트에는 "raw 없을 때" 처리 규칙이 없다.

**영향:**  
스크립트가 raw 확인을 시도하면 모든 검사가 실패하고  
RELEASE 102건 전체에 대해 `RIGHTS_EVIDENCE_MISSING` 판정이 생성된다.  
이는 오판이다 — GJ08 계약은 `이용허락범위: 제한 없음`이다.

**실제 provenance 체인:**
```
candidate.source = gyeongju-city/menuRstrtService
candidate.provenance.operation = getMenuRstrt
→ SF: gyeongju-GJ08-{uid} (COLLECTION_ALLOWED, 이용허락범위: 제한 없음)
→ normalize.py: CON_CONTENT → description_ko
→ normalize.py: 이미지경로 → https://www.gyeongju.go.kr/upload/...
→ raw: 없음 (데이터 보존 정책 미비)
```

**개선 방향:**  
Section 4에 다음 판정 규칙 추가:

```
SF raw 비어있는 경우의 fallback 판정 규칙:
  조건: candidate.source/provenance.operation으로 API 원점 확인
      + source contract COLLECTION_ALLOWED
      + 정규화 스크립트에서 해당 API 필드명 문서화
  → 권리 판정: VERIFIED_PUBLIC_API_FIELD_ALLOWED
    (raw 보존 불가 → METADATA_ONLY 표기 병행 가능)

SF raw 비어있고 위 조건 불충족:
  → 권리 판정: RIGHTS_EVIDENCE_MISSING
```

---

### [IMP-03] MEDIUM — enriched candidates 파일 허용 목록 누락

**문제:**  
`data/tourapi/enriched/gyeongju/gyeongju-enriched-candidates-v1.jsonl` (831건)은  
enrichment 단계의 provenance 정보를 담고 있으나  
허용 읽기 목록에 없다.

**실제 내용:**
- 831 enriched candidates, 모두 `enriched_at: 2026-08-03T12:59:10Z`
- description_ko, image_url 보유 (GJ08 candidates만)
- description 출처 추적에 필요

**개선 방향:**  
허용 읽기 목록에 추가:
```
- data/tourapi/enriched/gyeongju/  (enrichment provenance)
```

---

### [IMP-04] MEDIUM — media-license-policy.md 미참조

**문제:**  
`docs/media-license-policy.md` (6990 bytes)에는 다음 내용이 있다:
```
공식 홈페이지에 이미지가 있다는 것이 상업적 재사용 허가를 의미하지 않는다.
관광 API (재사용 허용 명시): ✔ 조건부 허용 (api-kto-tourapi)
```
그러나 경주시 GJ API에 대한 license_id가 정책 문서에 없다.  
이 정책 문서를 참조해야 GJ API 이미지의 실제 허용 근거 체계를 확인할 수 있다.

**개선 방향:**  
Section 9 (다음 지역 공통 Rights Gate)에 `docs/media-license-policy.md` 참조 명시.  
또한 GJ API (gyeongju-city-api)를 해당 정책에 등록 권고.

---

### [IMP-05] LOW — VG 84 vs RELEASE 102 차이의 프레임 수정

**문제:**  
Section 3의 "비지트경주 식당 84건과 RELEASE 102건 차이" 설명이  
두 집합이 subset 관계라고 암시한다.  
그러나 실측 결과:
- VG 84건 = VG 웹 레스토랑 identity audit 레코드 수
- RELEASE 102건 = GJ08 API 기반 candidates (VG 연결 5건만 포함)
- 두 집합은 다른 기준으로 만들어졌다

**개선 방향:**  
Section 3 reconciliation 결과를 미리 예상:
- `RELEASE_102_RECONCILED`: VG 84는 identity audit 레코드, RELEASE 102는 GJ08 질 기준 통과 candidates — 다른 집합
- VG 연결 RELEASE 5건 / VG 연결 HOLD 242건을 reconciliation에 명시

---

## 4. 개선 사항 영향도 요약

| ID | 심각도 | 영향 | 스크립트 실행 블로커 |
|----|--------|------|---------------------|
| IMP-01 | HIGH | 감사 스크립트가 image/description API 원점 미확인 → 잘못된 RIGHTS_EVIDENCE_MISSING 102건 | **Yes** |
| IMP-02 | HIGH | SF raw 없을 때 판정 규칙 부재 → RIGHTS_EVIDENCE_MISSING 오판 102건 전체 | **Yes** |
| IMP-03 | MEDIUM | enriched file 미읽기 → provenance 추적 불완전 | 부분적 |
| IMP-04 | MEDIUM | media-license-policy.md 미참조 → GJ API license_id 체계 연결 누락 | 아니오 |
| IMP-05 | LOW | VG 84 reconciliation 프레임 수정 | 아니오 |

IMP-01과 IMP-02가 동시에 미반영되면 감사 스크립트는 RELEASE 102건 전체에  
`RELEASE_REQUIRES_RIGHTS_REVIEW` 또는 `RELEASE_CLASSIFICATION_INVALID`를 생성한다.  
이는 GJ08 API 이미지·설명이 `이용허락범위: 제한 없음`으로 명시적으로 허용된 사실과 모순된다.

---

## 5. 권리 판정 바른 결론 (검증 과정에서 확인)

개선 사항 반영 후 예상되는 실제 감사 결과:

| 항목 | 예상 verdict | 근거 |
|------|-------------|------|
| RELEASE 102건 이미지 | `VERIFIED_PUBLIC_API_FIELD_ALLOWED` | GJ08 `CON_CONTENT` 기반 CDN URL + COLLECTION_ALLOWED |
| RELEASE 102건 설명 | `VERIFIED_PUBLIC_API_FIELD_ALLOWED` | GJ08 `CON_CONTENT` 필드 + COLLECTION_ALLOWED |
| RELEASE-HOLD 분류 스크립트 | `DOMAIN_ONLY_RIGHTS_DECISION_FOUND` | URL 도메인 기반 판정 로직 사용 |
| 최종 candidate 판정 | `RELEASE_CONFIRMED_METADATA_LIMITED` | 권리 확인됨, raw 미보존 |
| 분류 스크립트 수정 필요 | Yes (다음 태스크) | 도메인 대신 SF+contract 기반 판정으로 |

**도메인 기반 METHOD는 틀렸으나 CONCLUSION(RELEASE)은 실질적으로 옳다.**  
감사의 올바른 역할은 이 구분을 명확히 하는 것이다.

---

## 6. 개선된 프롬프트 추가 항목

기존 프롬프트에 다음 항목을 추가해야 한다.

### Section 2 추가: "허용 읽기 목록"
```diff
+ scripts/gyeongju_normalize.py  (이미지·설명 원본 API 필드명 문서화)
+ scripts/gyeongju_normalize_full_v1.py  (v1 필드 선택 로직)
+ data/tourapi/enriched/gyeongju/  (enrichment provenance)
+ docs/media-license-policy.md  (라이선스 정책)
```

### Section 4 추가: "SF raw 비어있을 때 fallback 규칙"
```
SF raw 필드가 비어있는 경우:
  candidate.source + provenance.operation으로 API 원점 확인
  + source contract COLLECTION_ALLOWED
  + 정규화 스크립트에서 API 필드명 문서화
  → VERIFIED_PUBLIC_API_FIELD_ALLOWED (raw 미보존 주석 포함)

위 3개 조건 중 하나라도 미충족:
  → RIGHTS_EVIDENCE_MISSING
```

### Section 5 추가: "정규화 스크립트 기반 description 추적"
```
description 출처 추적 순서:
  1. candidate.source_fact_id → SF.description_ko 확인
  2. candidate.linked_source_facts → 각 SF.description_ko 확인
  3. 정규화 스크립트에서 해당 source namespace의 description 필드명 확인
     (예: GJ08/GJ09 → CON_CONTENT, KTO → overview)
  4. source contract 권리 확인
  → 권리 verdict 생성
```

---

## 7. 기존 데이터 무변경 확인

이 검증 과정에서 다음은 수정하지 않았다:
- frozen raw: 0건 수정
- normalized candidates: 0건 수정
- Release/HOLD classification: 0건 수정
- source facts: 0건 수정

검증 스크립트는 scratchpad에만 작성됐으며 커밋하지 않는다.

---

## 8. 결론 및 권고

**현재 프롬프트를 그대로 실행하면 안 된다.**

IMP-01(정규화 스크립트 미허용)과 IMP-02(SF raw 없을 때 규칙 부재)가  
동시에 작용해, 실제로는 `COLLECTION_ALLOWED`인 GJ08 API 이미지·설명 전체를  
`RIGHTS_EVIDENCE_MISSING`으로 판정하는 false positive가 발생한다.

**다음 단계:**
1. 프롬프트에 IMP-01~IMP-05 개선 사항 반영
2. 반영된 프롬프트 재제출
3. Claude가 재검증 후 문제없으면 실행

---

*검증일: 2026-08-06*  
*기반 HEAD: `ca64e5c` (TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION-V1)*  
*이 보고서는 검증보고서이며, 실행 및 커밋 없음*
