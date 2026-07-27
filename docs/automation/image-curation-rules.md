# 운영 사진 큐레이션 원칙

> **적용 범위**: 장소 정보·일정·공유 화면에 실제 노출할 운영 사진 선정·관리.  
> **우선순위 1순위**: 장소 일치도 — 데이터 원천 비교 기준(최신성 우선)과 다름.  
> 데이터 원천 비교 기준은 `data-source-priority.md` 참조.

---

## 원천 풀과 운영 사진 분리

| 개념 | 설명 |
|------|------|
| `source_pool` | API에서 수집한 원천·재매칭용 자료 전체. 운영 노출 불가. |
| `curated_images` | 역할·품질·권리·장소 일치도를 검토해 선정한 운영 후보. |

- `source_pool` 전체를 운영 데이터로 자동 승격하면 **HARD_STOP**.
- `curated_images`는 아래 기준에 따라 별도 선정 단계에서 확정한다.

## 카테고리별 운영 사진 수량

| 카테고리 | 권장 | 최대 |
|----------|------|------|
| attraction / nature | 3–4장 | 5장 |
| restaurant | 3장 | 4장 |
| event | 2–3장 | 4장 |
| accommodation | 2–3장 (기준 확정 전) | 4장 |

- 권장 수량은 목표이며 필수 최소치가 아니다.
- 권장 수량 미달이어도 아래 최소 운영 가능 기준이 충족되면 운영 종료한다.
- 수량을 채우기 위해 유사하거나 가치가 낮은 사진을 반복 선정하지 않는다.
- 최대 수량을 초과한 후보는 `source_pool`에만 유지하고 `curated_images`에 포함하지 않는다.

## 최소 운영 가능 기준

| 카테고리 | 최소 조건 | image_sufficient 조건 |
|----------|----------|----------------------|
| restaurant | 대표 음식 1장 **또는** 외관 1장 | 대표 음식 + 외관 |
| attraction / nature | 대표 전경 1장 | — |
| event | 대표 행사 이미지 1장 | — |
| accommodation | 외관 또는 대표 객실 1장 | — |

restaurant 내부 사진은 보완 가치가 있을 때만 추가한다.

## 사진 역할 정의

| 역할 | 설명 |
|------|------|
| `primary` | 대표 전경 또는 대표 음식 |
| `context` | 외관·입구·내부·접근 정보 |
| `experience` | 전망·주요 체험·대표 메뉴·행사 장면 |
| `seasonal_optional` | 계절·야간 등 추가 정보 가치가 있을 때만 |

동일 역할과 유사 구도의 사진으로 권장 수량을 채우지 않는다.

## 선정 우선순위

1. 장소 일치도
2. 최신성
3. 권리·사용 가능 상태
4. URL 접근 가능성
5. 사진 역할의 다양성
6. 이미지 품질
7. 메타데이터 완전성
8. 결정성 tie-breaker (galContentId 또는 asset_id 오름차순)

## 이미지 상태값

| 상태값 | 의미 |
|--------|------|
| `image_complete` | 권장 수량 충족 |
| `image_sufficient` | 권장 수량 미달이나 운영에 충분 |
| `image_partial` | 최소 운영 가능하나 보강 가치 있음 |
| `image_missing` | 사용 가능한 이미지 없음 |
| `source_exhausted` | 허용 원천 탐색 완료, 추가 이미지 없음 |
| `do_not_retry_until_source_update` | 원천 갱신 전 자동 재탐색 금지 |

## 자동화 종료·재시도 규칙

- `image_complete` 또는 `image_sufficient` 상태에 도달하면 추가 수집·매칭을 중단한다.
- 허용 원천 탐색 후 후보가 없으면 `source_exhausted`로 종료한다.
- `source_exhausted` 대상은 원천 갱신 없이 다음 야간 배치에서 반복 탐색하지 않는다.
- 사진 부족만을 이유로 매 배치마다 전체 재검색하지 않는다.

재시도가 허용되는 경우:

- 원천 수정일(galModifiedtime 등) 갱신이 확인된 경우
- 새로운 공식 원천이 추가된 경우
- 기존 이미지 URL이 깨지거나 삭제된 경우
- 권리 상태가 변경된 경우
- 수동 재탐색 승인이 있는 경우

## 우선 보완 대상

아래 조건을 만족하는 장소를 우선 대상으로 삼는다.

- `image_missing`
- `image_partial` 중 역할 다양성 부족
- 깨진 URL 또는 접근 불가 이미지
- 권리 문제
- 기존 사진과 장소 일치도가 낮은 경우

이미 `image_complete` 또는 `image_sufficient`인 장소는 기본 탐색 대상에서 제외한다.

## 화면 활용 기준

| 화면 | 사용 범위 |
|------|----------|
| 탐색 카드·일정 카드 | `primary` 역할 1장 |
| 장소 상세 | `curated_images` 전체 |
| 공유 일정·Trip Cover | `curated_images` 중 목적에 맞는 1장 |
| 사용자 추억 사진 | 공식 장소 이미지와 별도 관리 |

## Preflight·Validation Gate 추가 판정

기존 Preflight·Validation Gate 규칙에 더해 아래를 적용한다.

| 조건 | 판정 |
|------|------|
| `image_complete` 또는 `image_sufficient` 장소를 이유 없이 재수집 대상으로 지정 | `REVISE_REQUIRED` |
| `curated_images` 최대 수량 초과 | `FAIL` |
| 유사 사진만으로 권장 수량 충족 시도 | `review_required` 마킹 |
| `source_pool` 전체를 운영 데이터로 직접 연결 | `HARD_STOP` |
| `source_exhausted` 대상을 원천 갱신 없이 재호출 | `REVISE_REQUIRED` |

---

## 이미지 권리 운영 기준

> **적용 범위**: `image_source_type: editorial_tourism` 등 공식 관광·음식·행사 원천.  
> 공공데이터포털·TourAPI 원천(KOGL 등)은 해당 라이선스 조건이 우선한다.  
> 이미지 권리 상태는 이미지 충분성(`image_status`)과 별도로 관리한다.

### 권리 상태값

| 상태 | 의미 |
|------|------|
| `rights_confirmed` | 공공누리·명시적 라이선스 확인 완료 |
| `operational_assumed` | 권리 문서화 불가. 공식 원천의 일반 홍보 이미지로 판단하여 운영 후보 포함 |

- 공공누리 유형이 확인되면 해당 조건을 우선 적용한다.
- `rights_confirmed`와 `operational_assumed`는 `image_status`(충분성)와 독립적으로 기록한다.

### 운영 허용 기준

공식 관광·음식·행사 원천 이미지에 명확한 사용 금지·재배포 금지·제3자 권리 표시가 없으면 정보 제공 목적의 운영 후보(`operational_assumed`)로 허용한다.

자동 제외(`blocked`) 대상:

- 스튜디오·언론·회사 저작권이 개별 이미지에 직접 명시된 경우
- 공모전·수상작·작품 사진
- 워터마크 포함
- 개별 이미지 또는 해당 상세 자료에 직접 연결된 사용 금지·재배포 금지·별도 허가 필요 표시
  - 사이트 공통 푸터의 "All Rights Reserved" 문구만으로는 자동 제외하지 않는다

검토 필요(`review_required`) 대상:

- 작가명이 있고 이용 조건이 불명확한 경우
  - 공공누리·명시적 라이선스가 확인되면 해당 조건을 우선 적용하고 가능한 경우 출처에 작가명을 포함한다
- 특정 개인 중심 인물 사진 — 연예인·홍보모델·미성년자·사적 인물 등 고위험 가능성이 있는 경우
  - 일반 행사 현장·군중 사진과 행사 포스터는 명시적 제한이 없으면 운영 후보로 허용한다
  - 현재 데이터로 시각 감지가 불가능하면 인물 존재 여부를 추정하지 않는다

자동 제외·검토 필요 조건 감지는 이미지 수준 수동 검토가 필요하다. 메타데이터로 직접 확인한 경우 `classification_method: metadata_confirmed`로 기록한다. 카테고리만으로 권리 제한을 추정하여 `blocked` 처리하지 않는다. `classification_method: category_inferred`는 참고 분류에만 사용하며 권리 확정 근거로 사용하지 않는다.

### 운영 관리 조건

- 출처 도메인·원본 URL·수집일을 반드시 보존한다.
- 삭제 요청 수신 시 즉시 비노출 처리가 가능한 구조로 관리한다.
- 광고 소재·이미지 판매·예약 상품 직접 홍보 등 직접 수익 활용 시 권리 기준을 재검토한다.
- 공식 출처라는 이유만으로 `rights_confirmed`로 표시하지 않는다.

### Validation Gate 추가 (권리)

| 조건 | 판정 |
|------|------|
| 제3자 권리가 명시된 이미지를 `operational_assumed`로 분류 | `FAIL` |
| 출처 URL·수집일 누락 | `FAIL` |
| 직접 수익 연결 용도로 `operational_assumed` 이미지 사용 | `REVISE_REQUIRED` |
| `classification_method` 필드 누락 | `PASS_WITH_WARNINGS` |
