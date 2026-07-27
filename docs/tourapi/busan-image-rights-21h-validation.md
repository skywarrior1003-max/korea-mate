# TASK-DATA-IMAGE-RIGHTS-RISK-RECLASSIFICATION-21H 검증 보고서

**검증일**: 2026-07-27  
**판정**: REVISE_REQUIRED  
**실행 여부**: 미실행 — 아래 결함 해소 후 재지시 필요

---

## 검증 요약

| 항목 | 판정 | 설명 |
|------|------|------|
| Preflight #5 모집단 단일성 | PASS | 21G busan-visitbusan-rights-21g.csv 958건 명확 |
| Preflight #6 분류 기준 완전성 | **FAIL** | 25건에서 규칙 충돌, 감지 불가 기준 포함 |
| Preflight #7 Validation Gate 실현 가능성 | **FAIL** | image_status 연동 조건 미정의 |
| 기존 파일 read-only 준수 | PASS | 입력 변경 없음 |
| 결정성 | 미검증 (미실행) | — |

---

## 결함 상세

### [결함 1] 분류 규칙 충돌 — 25건 판정 불가 (Preflight #6 FAIL)

**충돌 구간**: `restaurant × rights_restricted` 25건

| 규칙 | 내용 | 적용 시 결과 |
|------|------|------------|
| 프롬프트 Rule #4 | "특정 사진에 명시된 all rights reserved → blocked" | 25건 → **blocked** |
| 카테고리 분류 지침 | "일반 음식·매장 홍보 사진은 operational_low_risk 우선 검토" | 25건 → **operational_low_risk** |

두 규칙의 우선순위가 정의되지 않았다. 실행할 경우 구현자의 해석에 따라 결과가 달라지며, 어느 쪽도 "정답"이라 할 수 없다. 이 25건이 실제로 operational_low_risk인지 blocked인지는 VisitBusan의 사용 조건을 외부에서 확인해야 판단 가능하다.

**현황 (category × vb_rights_class 교차표)**:

| category | rights_unknown | rights_restricted |
|----------|---------------|-----------------|
| restaurant | 390 | **25** ← 충돌 |
| attraction | 212 | 265 |
| event | 38 | 3 |
| nature | 0 | 21 |
| accommodation | 0 | 4 |

---

### [결함 2] image_status 연동 미정의 (Preflight #7 FAIL)

Rule 1: "이미지 충분성과 권리 위험도는 별도 관리한다."

**문제**: 21G에서 958 `image_partial` 상태의 원인은 "VB 권리 미확인"이다. 21H 이후 동일 장소가 `operational_low_risk`로 분류되면:

- 권리 측면: `operational_low_risk` (운영 가능)
- 이미지 충분성: `image_partial` (유지?)
- 운영자 관점: "이미지 있음 + 저위험인데 왜 image_partial인가?"

세 가지 처리 방안이 가능하며 어느 것을 선택할지 미정의다:

| 방안 | 설명 | 다음 작업 |
|------|------|---------|
| A — 완전 별도 관리 | image_status 불변, 권리 클래스만 기록 | 운영 시스템에서 두 필드를 AND 조건으로 조회 |
| B — 조건부 상향 | operational_low_risk → image_sufficient 자동 전환 별도 TASK | 21G image_status 재판정 TASK 추가 필요 |
| C — 단일 통합 상태 | 권리 + 충분성을 하나의 operational_status로 통합 | 기존 21F·21G 스키마 재설계 필요 |

21H 실행 결과를 어떻게 활용할지 결정되지 않은 상태에서 산출물을 생성해도 실질 효과가 없다.

---

### [결함 3] 감지 불가 기준 포함 — 분류 정확도 과장 위험

Rule #4에 명시된 자동 차단 조건:

| 조건 | 현재 데이터 감지 가능 여부 |
|------|--------------------------|
| 작가·스튜디오·언론·회사 저작권 명시 | **불가** — 이미지 URL만 있고 EXIF·캡션 메타데이터 없음 |
| 공모전·수상작·작품 사진 | **불가** |
| 워터마크 | **불가** — 이미지 내용 분석 없음 |
| 인물·초상권 위험 | **불가** |
| 특정 사진의 all rights reserved 명시 | **부분 가능** — rights audit의 `decision_reason`에 기록된 경우만 |

실행 시 분류는 실제로 **category 기반 추론**이 전부다. "작가·워터마크 감지 후 blocked 처리"를 수행했다고 기록되면 사실과 다른 분류 근거가 된다. 결과물에 "category 추론, 이미지 수준 미검토"를 명기해야 하며, 이는 Rule #4의 취지와 다소 어긋난다.

---

### [결함 4] image-curation-rules.md 수정 범위 미명세

프롬프트는 7개 규칙을 image-curation-rules.md에 추가하도록 요구한다. 문제점:

1. **적용 원천 범위 불명확**: "공식 관광·음식 정보 원천"이 `image_source_type: editorial_tourism`에만 해당하는지, 공공API (TourAPI)에도 적용되는지 미정의. 두 원천의 권리 체계가 다르다 (TourAPI = KOGL, VB = 불명).
2. **기존 `usable` 개념과 중복**: 기존 권리 감사의 `usable`(=KOGL 확인)과 신규 `rights_confirmed` 개념이 어떻게 대응되는지 미명세. 향후 혼용 가능성.
3. **"향후 다른 도시에도 적용"** 전제로 추가하지만, 도시별 원천의 권리 체계가 다를 수 있다. 일반 규칙으로 고정하기 전 최소 2개 도시 검증이 필요.

---

## 개선 제안

### 제안 1 — 충돌 해소 규칙 확정 후 재실행

다음 중 하나를 명시한 뒤 재지시한다:

- **방안 α**: `rights_restricted`(ARR 명시)는 category와 무관하게 항상 `blocked` 처리. 25건 restaurant → blocked. (Rule #4 우선)
- **방안 β**: 관광청 공식 사이트(visitbusan.net)의 ARR 표기는 사이트 전체 저작권 고지로 해석하고, 개별 이미지 ARR로 보지 않음 → 25건도 operational_low_risk 허용. (별도 정책 결정 필요)

방안 선택 후 25건의 처리가 확정되면 실행 가능하다.

### 제안 2 — image_status 연동 방안 결정 후 통합 TASK

21H와 동시에 또는 직후에:
- **방안 A 선택 시**: 21H 결과 CSV에 `operational_status` 컬럼 추가, 운영 시스템 조회 조건 문서화
- **방안 B 선택 시**: 21H 완료 후 21G image_status 재판정 TASK(21I)를 별도 지시

### 제안 3 — image-curation-rules.md 수정 시 적용 범위 한정

추가 규칙에 다음 헤더를 붙인다:

```
### 편집 관광 원천 위험도 기준 (image_source_type: editorial_tourism)
> 이 규칙은 image_source_type이 editorial_tourism인 원천에만 적용한다.
> KOGL·공공데이터포털 API 원천에는 적용하지 않는다.
```

### 제안 4 — 분류 근거 컬럼 명시

출력 CSV에 `classification_method` 컬럼을 추가한다:
- `category_inferred`: category 필드 기반 추론 (이미지 수준 미확인)
- `rights_record_detected`: rights audit의 decision_reason 기록 기반

이를 통해 "자동 감지"와 "추론"을 구분하고 분류 정확도를 과장하지 않는다.

---

## 실행 가능 조건

아래 사항이 결정되면 즉시 실행 가능하다:

- [ ] 결함 1: rights_restricted × restaurant 25건 — Rule #4 우선 (blocked) vs 방안 β (허용) 결정
- [ ] 결함 2: image_status 연동 — 방안 A·B·C 중 선택
- [ ] 결함 4: image-curation-rules.md 수정 범위 — editorial_tourism 한정 여부 확인

결함 3 (감지 불가 기준)은 classification_method 컬럼으로 한계를 명기하는 것으로 해소 가능하며, 실행 결정 조건에 포함하지 않아도 된다.

---

*TASK-DATA-IMAGE-RIGHTS-RISK-RECLASSIFICATION-21H 검증 완료 — 결함 해소 후 재지시 필요.*
