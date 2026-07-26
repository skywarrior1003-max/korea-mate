# TASK-DATA-BUSAN-RESTAURANT-IMAGE-RIGHTS-20A-9 검증보고서

**작성일**: 2026-07-26  
**상태**: 실행 보류 — 개선 사항 4건 (사용자 확인 필요)

---

## 1. 데이터 사전 확인 결과

### 1-1. 음식점 후보 전수 집계

| 항목 | 건수 |
|------|------|
| VB 958건 중 category=restaurant | **415건** (busan-F-*) |
| KTO 543 usable 중 category=restaurant | **222건** (busan-K-*, 잠재 대체 후보) |
| restaurant VB 415 ↔ KTO 222 이름 겹침 추정 | **0건** (정규화 이름 비교, 좌표 매칭 미시도) |

### 1-2. linked_source_keys 패턴 분포

| 패턴 | 건수 | candidate_status | source_detail_url |
|------|------|-----------------|-------------------|
| `VisitBusanContent:food:NNN:ko\|FoodService:NNN:ko` | 325 | existing_enriched | visitbusan.net ✓ |
| `FoodService:NNN:ko` | 72 | api_only_existing | **없음** |
| `VisitBusanContent:food:NNN:ko` | 18 | web_only_new | visitbusan.net ✓ |

> 415건 전부 VisitBusan FoodService API 또는 VisitBusan Content에서 유래. 외부(음식점 공식 홈페이지, 부산관광아카이브 등) 소스는 **현재 데이터 내에 없음**.

### 1-3. subcategory 분포 (VB 415건)

| subcategory | 건수 |
|-------------|------|
| other_restaurant | 235 |
| korean_food | 76 |
| seafood | 50 |
| bar | 15 |
| international_food | 17 |
| cafe | 11 |
| dessert_shop | 4 |
| cooking_class | 4 |
| bakery | 3 |

### 1-4. KTO 222건 restaurant 상세

- **kogl_3** (수정 금지): 217건
- **kogl_1** (수정 허용): 5건
- 단순 이름 정규화 매칭 시 VB 415건과 겹침: **0건**
- 좌표 기반(100m) 추가 매칭 가능성: 미확인 (별도 시도 필요)

---

## 2. 이슈 목록

### 이슈 1 ― `owner_promotional_image_likely` 허용값 미명시 (영향: 415건 전체)

프롬프트에 `owner_promotional_image_likely` 컬럼이 명시되어 있으나 **허용값이 정의되지 않음**.

가능한 해석:
- `true` / `false` (boolean형 문자열)
- `yes` / `no` / `unknown` (3값 열거형)
- `추정됨` / `아님` / `불명확` (한글)

FoodService API 이미지의 경우 이미지 제공 주체가 음식점인지, API 운영 기관(부산관광공사)인지 알 수 없으므로 기본값 설정이 불명확.

**제안**: `yes` / `no` / `unknown` 3값 사용. 기준:
- `yes` — 이미지 파일명 또는 URL 패턴이 업체 직접 업로드 이미지임을 추정할 근거가 있는 경우
- `no` — 전문 촬영·미디어 이미지로 추정
- `unknown` — 판단 불가 (기본값, 현 데이터에서 대다수)

---

### 이슈 2 ― `source_type` 허용값 미명시 (영향: 415건 전체)

프롬프트에서 출처 유형 5종을 예시로 나열했으나 **표준 허용값 목록 없음**. 실제 데이터를 확인한 결과, 현재 데이터 내에 존재하는 소스 유형은 다음 3가지뿐:

| 실제 소스 패턴 | 건수 | 제안 source_type 값 |
|----------------|------|---------------------|
| FoodService + VisitBusanContent (기존 enriched) | 325 | `visitbusan_food_api` |
| FoodService 단독 (소스 페이지 없음) | 72 | `food_service_api_only` |
| VisitBusanContent 단독 (web only) | 18 | `visitbusan_web_content` |

프롬프트에 열거된 "음식점 공식 홈페이지·SNS", "부산관광아카이브" 등은 현재 데이터에 존재하지 않음.

**제안**: 위 3가지 값으로 고정하거나, 사용자가 원하는 체계를 명시 후 재실행.

---

### 이슈 3 ― FoodService API 이미지 `operational_risk` 기본값 기준 부재 (영향: 전체 415건, **가장 중요**)

415건 중 397건이 FoodService API 소스 포함. 이 이미지들의 위험도 기준이 불명확.

**문제**: 프롬프트에서 "공식 출처, 동일 업체 사진이라는 근거가 충분하면 low/medium 가능"이라고 했지만, FoodService API가 "공식 출처"에 해당하는지 정의되지 않음.

실제 상황:
- FoodService API = VisitBusan(부산관광공사)에서 제공하는 공식 관광 API
- 이 API의 이미지 저작권 귀속이 불명확: 부산관광공사 소유(KOGL 가능) vs 음식점이 제공한 사진(업체 소유) vs 제3자 촬영(작가 소유)
- VisitBusan 이용약관이나 FoodService API 이용허락 범위 정보가 현재 데이터에 없음

기준이 없으면 415건 전부 `operational_risk=unknown, recommended_action=keep_review_required`가 되어 이번 TASK의 차별 가치가 없음.

**제안**: 다음 3단계 기본값 체계를 승인 받아 적용:

| 소스 패턴 | 기본 operational_risk | 근거 |
|----------|-----------------------|------|
| FoodService+VisitBusanContent (enriched) | `medium` | 공식 관광 API 소스이나 개별 저작권 귀속 불명확. 업체 공식 채널과 교차 확인 필요. |
| FoodService 단독 (api_only, 소스 페이지 없음) | `medium` | 동상. 소스 페이지 추적 불가. |
| VisitBusanContent 단독 (web_only_new) | `high` | 공식 API 연결 없음, 출처 불명확 |

> 단, 개별 음식점에서 공식 제공 정황(이미지 파일명에 업체명 포함 등)이 확인되면 `low`로 하향 조정 가능.

---

### 이슈 4 ― 대체 이미지 탐색 방법 미명시 (영향: 중)

"동일 음식점의 권리 확인 이미지를 찾을 수 있으면 대체 후보로 기록"이라고 했으나, 탐색 범위·방법이 명시되지 않음.

**실제 상황**:
- KTO 543 usable 풀에 restaurant = **222건** (kogl_3: 217, kogl_1: 5)
- VB restaurant 415건 ↔ KTO restaurant 222건 이름 정규화 겹침: **0건**
- 좌표 100m 기반 매칭 가능성: 미시도

단순 이름 일치로는 대체 후보를 찾을 수 없음. 좌표 기반 매칭을 시도해야 하는지, 또는 별도 탐색 방법이 있는지 불명확.

**제안**: TASK-20A-8와 동일한 방식(Method 2: 이름+주소, Method 3: 좌표 100m)을 적용. 예상 결과: 이름 완전 불일치(0건)이므로 좌표 매칭에만 의존. 결과 건수는 실행 전 예측 어려움.

또는 대체 이미지 탐색 자체를 이번 TASK 범위에서 제외하고 `replacement_image_candidate` 컬럼을 blank 처리하는 것도 합리적 옵션.

---

## 3. 개선 방향 요약

| 이슈 | 현재 문제 | 제안 |
|------|-----------|------|
| `owner_promotional_image_likely` 허용값 | 미명시 | `yes`/`no`/`unknown` 3값 |
| `source_type` 허용값 | 미명시 | 3값 고정 (위 표 참조) |
| FoodService API risk 기준 | 전 415건 미정 | `medium` 기본값 + 개별 조정 |
| 대체 이미지 탐색 방법 | 범위 미명시 | KTO 222건과 좌표 매칭 또는 탐색 제외 중 선택 |

---

## 4. 참고: 실행 시 예상 결과 미리보기

위 이슈 3의 제안(medium 기본값)을 적용할 경우 예상 수치:

| operational_risk | 예상 건수 | 근거 |
|-----------------|-----------|------|
| medium | ~397 | FoodService 소스 (기본값) |
| high | ~18 | VisitBusanContent 단독 (web_only_new) |
| low | 0 (초기) | 명시적 허락 없음 |
| unknown | 0 | 기본값 medium 적용 시 |

| recommended_action | 예상 건수 |
|--------------------|-----------|
| keep_review_required | ~18 (high risk) |
| request_permission | ~397 (medium risk) |

대체 이미지 (KTO 매칭): 0~수건 (좌표 매칭 시도 필요)

---

이슈 1~4에 대한 승인(또는 수정) 후 재실행 예정.
