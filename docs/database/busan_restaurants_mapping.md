# Busan Restaurants → places 테이블 마이그레이션 매핑

## 개요

`public/data/restaurants.json`의 194개 레코드를 `places` 테이블로 적재할 때 적용하는 필드 매핑·변환 규칙입니다.

- 원본 레코드 수: **194건**
- 출처 구분: `busan-mat-2026` 119건, `michelin-2026` 55건, `taegshlang-2025` 20건
- 수상 구분: 없음 139건, `selected` 31건, `1star` 4건, `bib-gourmand` 20건

---

## 필드 매핑 테이블

| places 컬럼 | restaurants.json 필드 | 변환 규칙 |
|---|---|---|
| `place_id` | `id` | `rest-001` → `busan_food_001` (접두사 변경, 숫자 3자리 유지) |
| `name` | `name_ko` | 한국어명을 대표 이름으로 사용 |
| `name_ko` | `name_ko` | 그대로 |
| `name_en` | `name_en` | 그대로 (없으면 NULL) |
| `category` | — | 고정값: `"restaurant"` |
| `subcategory` | `category_ko` | 한국어 카테고리 그대로 (예: "한식", "일식") |
| `description` | `description_ko` | 한국어 설명을 대표 description으로 |
| `description_ko` | `description_ko` | 그대로 |
| `description_en` | `description_en` | 그대로 (없으면 NULL) |
| `address` | `address_ko` | 한국어 지번/도로명 주소 |
| `road_address` | — | NULL (원본 데이터에 구분 없음) |
| `district` | `district_en` | 영문 구/군 (예: `"Haeundae-gu"`) |
| `district_ko` | `district_ko` | 한국어 구/군 (예: `"해운대구"`) |
| `city` | — | 고정값: `"Busan"` |
| `phone` | `phone` | 그대로 (192건 보유, 2건 NULL) |
| `lat` | `latitude` | 부동소수점 그대로 |
| `lng` | `longitude` | 부동소수점 그대로 |
| `google_maps_url` | — | NULL (원본 없음 — 향후 검색 키워드로 생성) |
| `naver_maps_url` | — | NULL (원본 없음) |
| `naver_search_keyword` | `naverSearchKeyword` | 그대로 |
| `image_url` | `image` | NULL (194건 모두 image 필드 비어 있음) |
| `images` | — | `'[]'` (기본값) |
| `source` | `source` | 출처별 분류 — 아래 source/source_ref 매핑 참조 |
| `source_url` | — | NULL (원본 출처 URL 없음) |
| `source_ref` | `source` | 원본 source 필드 그대로 (예: `"busan-mat-2026"`) |
| `award` | `award` | 그대로 (예: `"1star"`, `"bib-gourmand"`, `"none"`) |
| `price_range` | `price_range` | 그대로 (없으면 NULL) |
| `coordinate_quality` | `latitude` / `longitude` | 소수점 자릿수 기준 — 아래 규칙 참조 |
| `detail_quality` | — | 조건부 계산 — 아래 규칙 참조 |
| `is_active` | `visible` | `visible === true → TRUE`, 나머지 → `FALSE` |
| `is_map_usable` | `coordinate_quality` | `approximate` 이상이면 `TRUE` — 아래 참조 |
| `is_route_usable` | — | 고정값: `FALSE` (exact 좌표 없음) |
| `is_ai_usable` | — | 고정값: `TRUE` (공식 큐레이션 전체 포함) |
| `admin_status` | — | 고정값: `"approved"` |
| `tags` | `tags` | JSON 배열 → TEXT[] (없으면 `'{}'`) |
| `extra` | `reservation_required`, `googleSearchKeyword` | `{ "reservation_required": ..., "googleSearchKeyword": ... }` |

---

## is_ai_usable / is_route_usable 의미

| 플래그 | 현재 값 | 의미 |
|---|---|---|
| `is_ai_usable` | `TRUE` (전체 194건) | AI 일정 생성 시 추천 후보로 사용할 수 있음. 설명·카테고리·이름이 충분히 갖춰진 경우 적용. |
| `is_route_usable` | `FALSE` (전체 194건) | 동선(경로) 계산에 사용하지 않음. `exact` 좌표로 검증된 경우에만 `TRUE`로 승격 가능. |

> **현재 194개 식당은 좌표가 지오코딩 결과(`approximate` 또는 `district_center`)이며, GPS 실측 등으로 `exact` 검증된 상태가 아닙니다.**
> 따라서 `is_route_usable = FALSE`가 기본값입니다.
> `is_ai_usable = TRUE`이더라도 동선 계산에는 사용하지 않으며, AI 추천 텍스트·설명 생성에만 활용합니다.

---

## coordinate_quality 결정 규칙

원본 restaurants.json의 좌표는 지오코딩 결과이며, 소수점 자릿수를 품질 지표로 사용합니다.

| 소수점 자릿수 | 건수 | coordinate_quality | is_map_usable |
|---|---|---|---|
| 4자리 이상 (예: 35.1234) | 167건 | `approximate` | `TRUE` |
| 3자리 (예: 35.123) | 24건 | `approximate` | `TRUE` |
| 2자리 이하 (예: 35.12) | 3건 | `district_center` | `FALSE` |
| 위도 또는 경도 NULL | 0건 | `address_only` | `FALSE` |

> **주의:** 2자리 이하 좌표 3건은 구 중심 좌표로 추정됩니다. 지도 핀 표시 금지, 경로 계산 금지.

**coordinate_quality 분류 기준 보충:**
- 소수점 자릿수 기준은 자동 분류를 위한 **1차 기술 기준**입니다. 실제 정확도와 다를 수 있습니다.
- 실제 매장 좌표가 현장 확인 또는 공식 출처로 검증된 경우에만 `exact`로 승격합니다.
- `district_center` 또는 의심 좌표(위치가 실제 매장과 크게 다른 경우)는 지도 핀 표시 및 동선 계산에 사용하지 않습니다.

---

## detail_quality 결정 규칙

| 조건 | detail_quality |
|---|---|
| description_ko + address_ko + phone + image_url 모두 있음 | `rich` |
| description_ko + address_ko + phone 있음 (image 없어도 OK) | `basic` |
| address_ko만 있음 | `minimal` |
| name만 있음 / 필수 필드 누락 | `invalid` |

restaurants.json 현황:
- 194건 모두 `description_ko`, `address_ko`, `phone`(192건) 보유
- `image_url` = 0건 (전체 비어 있음)
- → 대부분 **`basic`**, 전화 없는 2건은 **`minimal`**

---

## place_id 변환 규칙

```
rest-001  →  busan_food_001
rest-010  →  busan_food_010
rest-194  →  busan_food_194
```

- 접두사 `rest-` → `busan_food_`
- 숫자 부분 3자리 그대로 유지 (제로 패딩 포함)
- 한 번 결정 후 변경 금지 (즐겨찾기·일정이 이 값에 의존)

---

## source / source_ref 매핑

`source` 컬럼은 **데이터 출처의 성격**을 나타냅니다. `source_ref`는 프로젝트 내부 원본 그룹명을 원본 그대로 보존합니다.

| restaurants.json source | places.source | places.source_ref | 판단 근거 |
|---|---|---|---|
| `busan-mat-2026` | `official_public` | `busan-mat-2026` | 부산시 공식 발간 맛집 가이드 — 공공기관 데이터 |
| `michelin-2026` | `curated_manual` | `michelin-2026` | 미쉐린 가이드 기반 — 민간 외부 가이드이므로 official_public 아님 |
| `taegshlang-2025` | `curated_manual` | `taegshlang-2025` | 출처 공공기관/공식 관광 데이터 여부 미확인 — 확인 전까지 curated_manual 사용 |

> **주의:** 미쉐린 등 외부 민간 가이드 기반 데이터는 공공기관 데이터가 아니므로 `official_public`으로 단정하지 않습니다.
> `taegshlang-2025`의 출처가 공공기관/공식 관광 기관으로 확인되면 `official_public`으로 일괄 업데이트합니다.

---

## extra JSONB 구조

restaurants.json에만 있고 places 테이블에 전용 컬럼이 없는 필드는 `extra`에 보관합니다.

```json
{
  "reservation_required": true,
  "googleSearchKeyword": "부산 해운대 맛집 OO"
}
```

> `reservation_required` 전용 컬럼 추가 시 `extra`에서 꺼내 마이그레이션.

---

## 데이터 적재 시 주의 사항

1. **images 없음**: 194건 모두 `image` 필드 비어 있음. `image_url = NULL`로 적재. 이미지 추가는 별도 작업.
2. **2자리 좌표 3건**: 적재는 하되 `is_map_usable = FALSE` 필수. 지도·경로 기능 제외.
3. **전화 없는 2건**: `phone = NULL`, `detail_quality = "minimal"` 적용.
4. **visible 필드**: 원본이 `true`인 경우만 `is_active = TRUE`. `false` 또는 없는 경우 `FALSE`.
5. **중복 방지**: `place_id` UNIQUE 제약이 있으므로 `INSERT ... ON CONFLICT (place_id) DO UPDATE`로 멱등 적재 권장.
6. **DB 직접 조작 금지**: 실제 Supabase 적재는 CF Function 또는 Supabase Dashboard SQL 에디터를 통해 실행. 클라이언트 코드에서 직접 INSERT 금지.
