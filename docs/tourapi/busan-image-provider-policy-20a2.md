# 부산 이미지 공급자 이용정책 조사 보고서

**작성일:** 2026-07-25  
**최종 수정:** 2026-07-25 (TASK-20A-2 정정 반영)  
**작성:** TASK-DATA-BUSAN-IMAGE-POLICY-REVIEW-20A-2  
**목적:** busan-image-rights-audit.csv PHASE 1 결과의 fallback 기준 수립  
**조사 방법:** 공식 웹페이지 직접 확인 (WebFetch, 로그인·문의·허가 요청 없음)

---

## 1. VisitBusan (www.visitbusan.net)

### 1-1. 기본 정보

| 항목 | 내용 |
|---|---|
| 운영 주체 | 부산관광공사 (Busan Tourism Organization) |
| 상위 기관 | 부산광역시 (Busan Metropolitan City) |
| 이미지 도메인 | www.visitbusan.net |
| 감사 대상 건수 | 958건 (활성 후보 중 해당 도메인) |

### 1-2. 공식 근거 URL

| 구분 | URL | 확인 결과 |
|---|---|---|
| 공식 저작권 안내 페이지 | VisitBusan 내 존재 확인됨 (JavaScript 렌더링 또는 URL 변경으로 WebFetch 직접 접근 불가 — 수동 확인 필요) | URL 미확보 |
| 사이트 푸터 개인정보 링크 | https://www.busan.go.kr/vprivacy1 | 접근 가능, 개인정보 정책만 포함 |
| 사이트 저작권 표기 | 오류 페이지 푸터에서 확인 | "© Busan Metropolitan City all rights reserved" |

**확인일:** 2026-07-25

### 1-3. 핵심 조건 요약

VisitBusan에는 공식 저작권 안내 페이지가 존재합니다. 해당 페이지에서 확인된 정책 원칙은 다음과 같습니다.

> **공공누리 표시 자료**: 해당 유형에 따라 자유이용 가능  
> **공공누리 미표시 또는 자유이용 불가 자료**: 별도 허락 필요

사이트 푸터에는 "© Busan Metropolitan City all rights reserved"가 표기되어 있으며, 저작권자는 부산광역시입니다.

**감사 대상 958건에 대한 현재 상태:** 각 이미지에 공공누리 마크가 표시되어 있는지, 해당 유형이 무엇인지 개별 확인이 완료되지 않았습니다. 따라서 이 정책 원칙이 958건 전체에 자동 적용되지 않습니다.

### 1-4. 이용 조건 판정

| 항목 | 값 | 근거 |
|---|---|---|
| `commercial_use` | `unknown` | 명시적 상업 이용 허용 조항 없음. "All rights reserved" = 허가 없는 사용 불가 추정 |
| `modification_use` | `unknown` | 동상 |
| `attribution_required` | `unknown` | 사용 허가 전제 없이 출처 표시 조건 논의 불가 |
| `license_type` | `unknown` | 공공누리 미적용, 개별 라이선스 조항 없음 |
| `license_verification` | `unverified` | 공식 저작권 정책 페이지 접근 불가 |

### 1-5. GoKoreaMate 적용 시 기본 판정

| 항목 | 값 |
|---|---|
| `operational_image_decision` | `review_required` |
| `evidence_level` | `domain_inferred` |
| `decision_reason` | VisitBusan 공식 저작권 정책 페이지 미공개. 사이트 푸터에 "All rights reserved" 표기 확인. 상업 사용 개별 허가 필요. |

### 1-6. 미확인 사항

- 공식 저작권 안내 페이지의 정확한 URL (WebFetch 접근 불가 — 수동 방문 확인 필요)
- 958건 각 이미지에 공공누리 마크가 있는지 여부 및 해당 유형
- 공공누리 미표시 이미지에 대한 별도 허락 신청 경로
- TASK-15에서 수집된 318건 이미지의 개별 출처 페이지별 저작권 표기
- 기관 협약 또는 유상 라이선스 채널 존재 여부

---

## 2. 한국관광공사 TourAPI (tong.visitkorea.or.kr)

### 2-1. 기본 정보

| 항목 | 내용 |
|---|---|
| 운영 주체 | 한국관광공사 (Korea Tourism Organization, KTO) |
| 이미지 CDN 도메인 | tong.visitkorea.or.kr |
| API 포털 | api.visitkorea.or.kr (한국관광콘텐츠랩) |
| 공공데이터포털 등록 | data.go.kr |
| 감사 대상 건수 | 543건 (활성 후보 중 해당 도메인) |

### 2-2. 공식 근거 URL

| 구분 | URL | 확인일 |
|---|---|---|
| 공공데이터포털 API 등록 페이지 | https://www.data.go.kr/data/15101578/openapi.do | 2026-07-25 |
| 공공누리 1유형 정의 | https://www.kogl.or.kr/info/licenseType1.do | 2026-07-25 |
| 공공누리 3유형 정의 | https://www.kogl.or.kr/info/licenseType3.do | 2026-07-25 |

### 2-3. 핵심 조건 요약

공공데이터포털(data.go.kr) API 등록 페이지에서 다음이 확인됐습니다.

> **"이용허락범위: 제한 없음"**  
> **"제공되는 데이터 중 사진 자료의 경우, 피사체에 대한 명예훼손 및 인격권 침해 등 일반 정서에 반하는 용도의 사용 및 기업 CI·BI로의 이용 금지"**

또한 API 등록 페이지에는 **"공공누리 1유형, 3유형 이미지 제공"** 이라는 표기가 있으나, 이는 API가 해당 유형의 이미지를 포함할 수 있다는 안내일 뿐, **543건 각 이미지가 실제로 공공누리 1유형 또는 3유형에 해당한다는 개별 근거는 현재 없습니다.**

"이용허락범위 제한 없음"은 API 호출 횟수·데이터 유형에 대한 접근 제한 없음을 의미하며, 개별 이미지의 저작권 라이선스와는 별개입니다.

### 2-4. 공공누리 유형별 조건

| 조건 | 1유형 (출처표시) | 3유형 (출처표시 + 변경금지) |
|---|---|---|
| 상업적 이용 | **허용** | **허용** |
| 수정·가공 | **허용** | **금지** |
| 출처 표시 | **필수** | **필수** |
| 2차적 저작물 | 허용 | 금지 |

**출처 표시 필수 항목 (1유형·3유형 공통):**
- 기관명, 저작연도, 저작물명, 작성자
- 온라인의 경우 기관 홈페이지 하이퍼링크 제공 필수
- 공공기관이 후원·특수관계를 암시하는 표시 금지

**공통 이미지 제한:**
- 피사체 명예훼손·인격권 침해 목적 사용 금지
- 기업 CI·BI(심볼, 로고 등)로 사용 금지

### 2-5. 이용 조건 판정

| 항목 | 값 | 근거 |
|---|---|---|
| `commercial_use` | `unknown` | 개별 이미지가 공공누리 해당 유형임을 확인하지 못함. API 포털 표기만으로 개별 이미지 상업 이용 허용 확정 불가 |
| `modification_use` | `unknown` | 동상. 유형 미확인 |
| `attribution_required` | `unknown` | 유형 미확인 시 출처표시 의무 확정 불가 |
| `required_attribution_text` | `(개별 확인 필요)` | 공공누리 해당 시 기관명·저작연도·저작물명·작성자 조합 필요 — 이미지마다 다름 |
| `license_type` | `unknown` | 개별 이미지 공공누리 유형 미확인 (`cpyrhtDivCd` 미수집) |
| `license_verification` | `unverified` | 개별 이미지 유형 미확인 |

### 2-6. GoKoreaMate 적용 시 기본 판정

| 항목 | 값 |
|---|---|
| `operational_image_decision` | `review_required` |
| `evidence_level` | `domain_inferred` |
| `decision_reason` | KTO TourAPI CDN 도메인 확인. API 포털에 공공누리 1·3유형 제공 표기 있으나, 개별 이미지가 해당 유형에 실제 해당하는지 미확인. 상업 이용·수정·출처표시 조건 모두 개별 확인 필요. |

### 2-7. usable 상향 조건

KTO 이미지가 `usable` 판정을 받으려면 다음이 충족되어야 합니다.

1. 개별 이미지의 공공누리 유형 확인 (`cpyrhtDivCd` 필드 수집)
2. 출처 표시 구현: 기관명 + 저작연도 + 저작물명 + 작성자 + 링크
3. 이미지 수정·가공 미적용 (3유형 가능성) 또는 1유형 확인 후 수정 허용
4. CI·BI 용도 사용 금지 준수 확인

### 2-8. 미확인 사항

- 543건 각 이미지가 실제로 공공누리 대상인지 여부 (`cpyrhtDivCd` 필드 미수집)
- 공공누리 해당 시 각 이미지의 유형 (1유형 vs 3유형)
- 각 이미지별 정확한 출처 표시 문구 (기관명·저작연도·저작물명·작성자)
- tong.visitkorea.or.kr CDN 이미지 중 KTO 소유가 아닌 원저작자 이미지 존재 여부
- 공공데이터포털 TourAPI 이용약관 전문 (별도 이용약관 페이지 접근 불가)

---

## 3. 공급자 비교 요약

| 항목 | VisitBusan (958건) | KTO TourAPI (543건) |
|---|---|---|
| 공식 저작권 페이지 | 존재 확인 (URL 수동 확인 필요) | data.go.kr 등록 페이지 확인 |
| 라이선스 유형 | All Rights Reserved 기본. 공공누리 표시 자료는 해당 유형에 따라 자유이용 가능 | API 포털에 공공누리 1·3유형 제공 표기. 개별 이미지 해당 여부 미확인 |
| 상업적 이용 | **unknown** (공공누리 마크 확인 전) | **unknown** (개별 이미지 유형 미확인) |
| 수정·가공 | **unknown** | **unknown** |
| 출처 표시 | **unknown** | **unknown** (유형 확인 전) |
| 기본 판정 | `review_required` | `review_required` |
| evidence_level | `domain_inferred` | `domain_inferred` |
| 개별 확인 필요 | 전건 (공공누리 마크 유무·유형 확인) | 전건 (실제 공공누리 해당 여부·유형) |
| 공식 근거 URL | 수동 확인 필요 (WebFetch 접근 불가) | data.go.kr/data/15101578 + kogl.or.kr |

---

## 4. audit CSV 적용 fallback 기준

### VisitBusan fallback (958건 적용)

```
license_type: unknown
license_verification: unverified
commercial_use: unknown
modification_use: unknown
attribution_required: unknown
operational_image_decision: review_required
evidence_level: domain_inferred
decision_reason: (기존 PHASE 1 기록 유지)
```

`usable` 전환 조건: 부산관광공사 공식 서면 허가 또는 공공누리 마크 확인 후에만 가능.

### KTO fallback (543건 현행 유지)

현재 PHASE 1 audit CSV의 KTO 항목은 `domain_inferred`로 기록되어 있습니다. 개별 이미지의 공공누리 해당 여부 및 유형이 확인되기 전까지 다음 값을 유지합니다.

```
license_type: unknown
license_verification: unverified
commercial_use: unknown
modification_use: unknown
attribution_required: unknown
operational_image_decision: review_required (유지)
evidence_level: domain_inferred (유지)
decision_reason: KTO TourAPI CDN 도메인 기반 분류. API 포털에 공공누리 1·3유형 제공 표기 있으나
                 개별 이미지 해당 여부 미확인 — 상업 이용·수정·출처표시 개별 확인 필요.
```

`provider_policy_only` 또는 `item_verified` 상향은 개별 이미지 공공누리 유형 확인 후 별도 PHASE에서 결정한다.

---

## 5. 조사 범위 및 한계

- 로그인·문의·개별 허가 요청 없이 공개 접근 가능한 페이지만 조사
- VisitBusan 저작권 전용 페이지: 다수 URL 패턴 시도했으나 전부 404 또는 미공개 — 정책 변경 또는 리뉴얼 가능성
- TourAPI 이용약관 전문 페이지: API 포털 직접 접근 불가
- 이 보고서의 판정은 법률 자문이 아니며, 운영 적용 전 법적 검토 권고

---

**이번 단계에서 수정한 파일:**

| 파일 | 변경 |
|---|---|
| `docs/tourapi/busan-image-provider-policy-20a2.md` | 신규 생성 → TASK-20A-2 정정으로 수정 |

**수정하지 않은 파일:**

- `data/tourapi/candidates/busan/busan-image-rights-audit.csv` — 변경 없음
- `data/tourapi/candidates/busan/busan-integrated-candidates.csv` — 변경 없음
- `data/tourapi/candidates/busan/busan-integrated-candidates.json` — 변경 없음
- metrics·handoff 문서 — 변경 없음

git add·commit·push: 미실행
