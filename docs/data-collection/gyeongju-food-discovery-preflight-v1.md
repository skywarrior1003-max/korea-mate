# Gyeongju Food Discovery Preflight v1

**Task**: TASK-FOOD-DISCOVERY-PROVISIONAL-RULES-AND-GYEONGJU-PREFLIGHT-V1  
**Date**: 2026-08-11  
**Type**: Read-only audit — GYEONGJU_DATA_CHANGE = 0  
**Status**: PREFLIGHT_COMPLETE  

---

## 1. Branch & SHA

```
GYEONGJU_RECOMMENDED_BRANCH = data/gyeongju-release-hold-classification-v1
GYEONGJU_START_SHA = ca64e5c
```

근거:
- ca64e5c "data(gyeongju): classify candidates for release and hold"
- 74a484d (POST-LINK-QA PASS) 포함
- 781417b (VG-KTO-LINK-FIX) 포함
- 가장 진행된 Gyeongju 파이프라인 상태

---

## 2. Food 파일 Inventory

```
data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl
  총: 302건 (attraction: 200, restaurant: 102)
  
data/gyeongju-final-release/gyeongju-city-spots-import-v1.jsonl
  총: 302건 (restaurant: 102)
  
data/gyeongju-final-release/gyeongju-final-ready-302-v1.jsonl
  총: 302건 (restaurant: 102) — index/summary only
  
data/gyeongju-official-travel-content/gyeongju-official-food-final-relations-v1.jsonl
  총: 292건
    EXISTING_RESTAURANT_LINK: 102 (canonical과 연결됨)
    NEW_PLACE_PROPOSAL: 190 (미처리 신규 제안)
```

**GYEONGJU_FOOD_RECORDS = 102 (canonical) + 190 (new proposals, 미처리)**

---

## 3. Source Breakdown

```
SOURCE_TIER: RESTAURANT_RELEASE_102 (전체 102건)
SOURCE_SET: A_BASELINE_235 (전체 102건)
SOURCE_BASE: data/gyeongju-final-closeout-handoff-v1@f7d6f44
COLLECTION_DATE: 2026-08-08
PARSER: gyeongju_official_travel_content_layer_v2.py v2.0.0
PRIMARY_SOURCE: gyeongju.go.kr/tour (official tourism portal)
```

---

## 4. Field Coverage (canonical 102건 기준)

| 필드 | 건수 | % |
|---|---|---|
| address | 102/102 | 100% |
| lat/lng | 102/102 | 100% |
| phone | 100/102 | 98% |
| opening_hours (raw) | 102/102 | 100% |
| official_url | 102/102 | 100% |
| image_url | 102/102 | 100% |
| description_ko | 102/102 | 100% |
| subcategory | 102/102 | 100% |
| image_rights_status | 102/102 | 100% |
| image_display_eligible | 102/102 | 100% |
| publishability | 102/102 | 100% |
| district | 0/102 | 0% (address에서 파싱 가능) |
| official_en_title/description | 0/102 | 0% |
| cuisine (structured) | 0/102 | 0% (subcategory에서 파생 가능) |
| signature_dishes (structured) | 0/102 | 0% (opening_hours raw에 混재) |

---

## 5. Gyeongju Opening Hours 구조 특이사항

경주 `opening_hours` 필드는 단일 string에 복합 정보 포함:

```
"대표메뉴 : 파스타, 오믈렛 영업시간 : 11:00-20:50 (Break Time 15:00-17:00) 휴무일 : 매주 월,화요일 주차 : ..."
```

포함 정보:
1. 대표메뉴 (signature dishes)
2. 영업시간 (operating hours)
3. 브레이크타임 (break time)
4. 휴무일 (closed days)
5. 주차 (parking)

Food V1 처리:
- 전체 → `opening_hours_raw_text` (보존)
- `signature_dishes`: "대표메뉴 : " prefix 뒤 내용 deterministic 파싱 가능
- `opening_hours_weekly`: 파싱 후 구조화 (AI 아닌 rule-based만)
- `closed_days`: "휴무일 : " 뒤 내용

---

## 6. Utility Field Provenance 유형 분류 (Section 14)

경주 기존 데이터에서 utility 정보의 성격:

| 항목 | 발견 건수 | 위치 | 유형 | 식 Food V1 처리 |
|---|---|---|---|---|
| solo dining 힌트 | 7건 | description_ko 텍스트 | A. 공식 소스 텍스트 | 텍스트 보존. 구조화 금지. |
| vegetarian 힌트 | 1건 | description_ko 텍스트 | A. 공식 소스 텍스트 | 텍스트 보존. 구조화 금지. |
| halal 힌트 | 1건 | description_ko 텍스트 | A. 공식 소스 텍스트 | 텍스트 보존. 구조화 금지. |
| reservation 힌트 | 9건 | description_ko 텍스트 | A. 공식 소스 텍스트 | 텍스트 보존. 구조화 금지. |
| child policy | 2건 | description_ko 텍스트 | A. 공식 소스 텍스트 | 텍스트 보존. 구조화 금지. |
| breakfast | 2건 | description_ko 텍스트 | A. 공식 소스 텍스트 | 텍스트 보존. 구조화 금지. |
| accessibility | 0건 | - | - | UNKNOWN |
| language | 0건 | - | - | UNKNOWN |
| payment | 0건 | - | - | UNKNOWN |

**유형 C (AI/manual interpretation) = 발견 없음**

모든 utility 정보는 gyeongju.go.kr 공식 소스 텍스트에서 비롯됨(Type A).
단, **자유 형식 텍스트**이므로 자동 구조화 금지. `description_ko` 보존이 정답.

---

## 7. Image Rights

```
image_rights_status: VG_RESTAURANT_OFFICIAL (102/102)
image_display_eligible: True (102/102)
publishability: pending_review (102/102)
```

`VG_RESTAURANT_OFFICIAL` = gyeongju.go.kr 공식 관광 이미지
- `image_display_eligible = True` 이나 `publishability = pending_review`
- MAIN 임포트 전 최종 rights 확인 필요

---

## 8. Provenance 현황

canonical-places의 `provenance` 필드: `source` key 부재 (UNKNOWN 102건)

원본 소스는 gyeongju.go.kr (food-relations 파일에서 확인):
```json
"provenance": {
  "source": "gyeongju.go.kr/tour",
  "mnu_uid": "...",
  "collected_date": "2026-08-08"
}
```

Food V1 migration 시 provenance 보완 필요:
```json
"field_provenance": {
  "name": {"source": "gyeongju.go.kr/tour", "collected_at": "2026-08-08", "field": "food_name"},
  "address": {"source": "gyeongju.go.kr/tour", "collected_at": "2026-08-08"},
  ...
}
```

---

## 9. Lossless Mapping Audit (Seoul Food V1 → Gyeongju)

| Food V1 필드 | 경주 데이터 | 상태 |
|---|---|---|
| city | "gyeongju" | PRESERVED |
| category | "restaurant" | PRESERVED |
| subcategory | 102/102 (한식/양식/etc.) | PRESERVED |
| name | 102/102 (title_ko) | PRESERVED |
| cuisine | 0 structured (subcategory에서 파생) | REQUIRES_MAPPING |
| address | 102/102 | PRESERVED |
| lat/lng | 102/102 (35.8x, 129.2x — 경주 좌표) | PRESERVED |
| district | 0 (address에서 파싱 가능) | REQUIRES_MAPPING |
| phone | 100/102 | PRESERVED |
| official_url | 102/102 (gyeongju.go.kr) | PRESERVED |
| opening_hours_raw_text | 102/102 (rename 필요) | PRESERVED + rename |
| opening_hours_weekly | 0 (파싱 스텝 필요) | REQUIRES_PARSING |
| signature_dishes | 0 structured (raw에 혼재) | REQUIRES_PARSING |
| closed_days | 0 structured (raw에 혼재) | REQUIRES_PARSING |
| description | 102/102 (description_ko) | PRESERVED |
| image_main_url | 102/102 | PRESERVED |
| image_rights_status | 102/102 (VG_RESTAURANT_OFFICIAL) | PRESERVED |
| provenance | 102/102 (source key 보완 필요) | REQUIRES_ENHANCEMENT |
| dietary/halal/vegan | 0 structured (description에 極소수) | UNKNOWN by design |
| language/payment/seating | 0 | UNKNOWN by design |
| accessibility/reservation | 0 | UNKNOWN by design |

**LOSSLESS_MAPPING = PASS_WITH_GAPS**

데이터 손실 없음. gaps:
1. cuisine: subcategory → controlled vocabulary 매핑 필요
2. opening_hours_weekly: raw text parsing 필요
3. signature_dishes: raw text에서 "대표메뉴" 추출 필요
4. provenance: source key 보완 필요

---

## 10. Proposed Spec Changes

이번 Task에서 변경 금지. 제안만:

| 제안 | 이유 |
|---|---|
| `opening_hours_raw_text` 필드 표준화 | Seoul R1/Gyeongju 모두 raw text 보존 필요 |
| `image_rights_status` Food V1 schema 추가 | 경주에 기존 rights 추적 시스템 존재 |
| `publishability` 필드 검토 | 경주에는 이미 MAIN-ready 판단 기준 존재 |
| `candidate_id` 연속성 | 경주 GJ08-xxx ID 체계 보존 필요 |

**PROPOSED_SPEC_CHANGE = REVIEW_BEFORE_MIGRATION**

---

## 11. 190건 NEW_PLACE_PROPOSAL

gyeongju-official-food-final-relations-v1.jsonl의 190건:
- EXISTING_RESTAURANT_LINK: 102건만 canonical에 연결됨
- NEW_PLACE_PROPOSAL: 190건 — 아직 canonical에 없는 신규 gyeongju.go.kr 음식점 제안
- hours: 0/292 (모두 비어있음)
- phone: 287/292 (96% 있음)
- address: 292/292 (100%)

다음 Task에서 검토 대상.

---

## 12. 다음 Task

```
NEXT_TASK = GYEONGJU_FOOD_DISCOVERY_MIGRATION_AND_TARGETED_GAPFILL

Branch: data/gyeongju-release-hold-classification-v1 (별도 branch 생성 필요)
START_SHA: ca64e5c
BASE_FILES:
  gyeongju-canonical-places-v1.jsonl (102 restaurants)
  gyeongju-official-food-final-relations-v1.jsonl (190 NEW_PLACE_PROPOSALS)
  
주요 작업:
  1. 102건 → Food V1 envelope wrap (lossless)
  2. provenance 보완
  3. subcategory → cuisine 매핑
  4. opening_hours raw 파싱 (deterministic)
  5. 190건 NEW_PLACE_PROPOSAL 처리 여부 결정
  6. coverage metric 산출
```

---

*GYEONGJU_DATA_CHANGE = 0*  
*GYEONGJU_API_CALLS = 0*
