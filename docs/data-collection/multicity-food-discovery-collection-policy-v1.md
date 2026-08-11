# Multicity Food Discovery Collection Policy v1

**Status**: ACTIVE_PROVISIONAL  
**Applies to**: Seoul (applied 2026-08-11), Gyeongju (planned), Busan (planned)  
**FINAL_FREEZE_AFTER**: SEOUL_GYEONGJU_BUSAN_VALIDATION  
**Canonical Target**: city_spots  

---

## 1. 목적

각 도시의 식당(restaurant) 데이터를 Food Discovery V1 schema로 수집·정제하여
city_spots에 import 가능한 수준의 factual candidate pool을 구성한다.

이 문서는 서울 Food Discovery 수집 작업(2026-08-11)을 기반으로 수립한 공통 원칙이다.

---

## 2. 절대 고정 원칙 (PROVISIONAL 아님)

| 원칙 | 상태 |
|---|---|
| UNKNOWN_DISTINCT_FROM_NO = REQUIRED | 고정 |
| FACT_DERIVED_SEPARATION = REQUIRED | 고정 |
| FIELD_PROVENANCE = REQUIRED | 고정 |
| AI_INFERRED_RESTAURANT_FACT = FORBIDDEN | 고정 |
| NO_EVIDENCE_EQUALS_UNKNOWN = YES | 고정 |
| CITY_SPOTS_IS_CANONICAL_TARGET = YES | 고정 |
| LEGACY_SSOT = NO | 고정 |
| CURRENT_DATA_REUSE_FIRST = YES | 고정 |
| TARGETED_GAP_FILL = YES | 고정 |
| ACCURACY_OVER_COMPLETION = YES | 고정 |

### 2.1 UNKNOWN vs NO 구분

```
공식 증거 없음 → key absent (= UNKNOWN)
공식 소스가 명시적으로 "없음"이라고 표명 → value = "none"

"없어 보임" (외관 판단)   → FORBIDDEN
"일반적으로 그럴 것" (AI) → FORBIDDEN
```

---

## 3. Food Discovery V1 Candidate Schema

```json
{
  "candidate_id": "seoul-food-v1-NNNN",
  "source_key": "visitseoul:restaurant:<cid>",
  "facts": {
    "city": "seoul",
    "category": "restaurant",
    "subcategory": "korean_restaurant | cafe | bar_pub | ...",
    "name": "...",
    "cuisine": ["korean", "western", ...],
    "address": "서울 OO구 ...",
    "address_legacy": "...",
    "lat": "37.xxx",
    "lng": "126.xxx",
    "district": "OO구",
    "postal_code": "...",
    "phone": "...",
    "official_url": "https://...",
    "official_url_lang": "한국어 | English",
    "opening_hours_weekly": "월~금 11:00~22:00 | ...",
    "closed_days": "...",
    "business_days": "매일 | 평일 | ...",
    "description": "...",
    "transit_info": "지하철 X호선 ...",
    "signature_dishes": [{"ko": "대표메뉴명"}],
    "price_range_krw": 15000,
    "menu_evidence": {"tags": [...], "source": "visitseoul_tags"},
    "image_main_url": "https://...",
    "image_additional_urls": ["https://..."],
    "restaurant_type_codes": ["한식"],
    "restaurant_kind_codes": ["일반식당"],
    "admission_required": "no",
    "admission_fee": "...",
    "accessibility_evidence": [...],
    "multilingual_page_cids": {"ko": "KOP...", "en": "ENP..."},
    "halal_certification": ["..."],
    "dietary_certification": ["..."]
  },
  "proposed_values": {},
  "field_provenance": {
    "name": {"source": "visitseoul:full_inventory", "cid": "...", "field": "post_sj"},
    "address": {"source": "visitseoul:contents_info", "cid": "...", "field": "traffic.new_adres"},
    "lat": {"source": "visitseoul:contents_info", "cid": "...", "field_lat": "traffic.map_position_y"}
  },
  "confidence": "HIGH | MEDIUM | LOW",
  "validation_status": "DETAIL_FETCHED_PENDING_REVIEW | SHELL_PENDING_DETAIL",
  "review_flags": [
    {"flag": "OPENING_HOURS_RAW_TEXT", "reason": "..."},
    {"flag": "OFFICIAL_URL_MISSING", "reason": "..."}
  ]
}
```

---

## 4. Source Priority (공통)

| 우선순위 | 소스 | 용도 |
|---|---|---|
| 1 | 기존 공식 source (VisitSeoul, KTO 등) | 모든 factual field |
| 2 | 식당 공식 홈페이지 / SNS / 메뉴 | official_url 확인 후 targeted fetch |
| 3 | 지방자치단체 / 관광기관 공식 데이터 | 위치·영업정보 |
| 4 | 지도 API (identity/location ONLY) | 위치·전화·place id |

금지:
- 블로그 / 후기 / 검색 snippet → fact 승격 금지
- 지도 API → traveler utility fact 추론 금지
- AI 생성값 → fact 승격 금지

---

## 5. VisitSeoul API 레스토랑 응답 구조 (서울 검증 2026-08-11)

`POST /api/v1/contents/info` 응답의 실제 food-relevant key paths:

```
traffic.adres             → address (legacy; 지번)
traffic.new_adres         → address_road (도로명; 우선)
traffic.map_position_x    → lng (경도)
traffic.map_position_y    → lat (위도)
traffic.new_zip_code      → postal_code
traffic.zip_code          → postal_code (legacy)
traffic.subway_info       → transit_info

extra.cmmn_telno          → phone
extra.cmmn_hmpg_url       → official_url
extra.cmmn_hmpg_lang      → official_url_lang
extra.cmmn_use_time       → opening_hours_weekly (raw text, \r\n separator)
extra.closed_days         → closed_days
extra.business_days       → business_days
extra.usage_fee           → admission_fee
extra.trrsrt_use_chrge    → admission_required ("N"=free, "C"/"Y"=charged)
extra.disabled_facility   → accessibility_evidence (list; 비어있으면 absent)

restaurant.fd_reprsnt_menu → signature_dishes (comma-separated string → list)
restaurant.price_range     → price_range_krw (string digit → int)
restaurant.type            → restaurant_type_codes (code_id/code_nm list)
restaurant.kind            → restaurant_kind_codes
restaurant.dietary         → dietary_certification (list; 비어있으면 absent=unknown)
restaurant.halal           → halal_certification
restaurant.muslim          → muslim_certification
restaurant.salam           → salam_certification

post_sj                   → name
sumry                     → description
tag                       → menu_evidence.tags (list)
main_img                  → image_main_url
relate_img                → image_additional_urls
multi_lang_list            → multilingual_page_cids (parsed)
```

**주의**: 상위 레벨에 `addr`, `mapx`, `mapy`, `opentime`은 **존재하지 않음**.
이 key를 찾으면 항상 empty — 버그 아닌 API 설계.

---

## 6. 수집 방식 원칙

### 6.1 ONE_FETCH_COLLECT_ALL_USEFUL_FACTS

- 한 식당에 대해 한 번의 API 호출로 모든 유용한 factual field를 동시에 수집
- 같은 식당에 field별 반복 조회 금지
- 호출 당 충분한 delay 적용 (기본 1.2s)

### 6.2 Targeted, Not Bulk Web Crawl

- 전체 식당 레코드를 웹 페이지 무차별 crawl 금지
- 공식 API (VisitSeoul, TourAPI) = targeted collection 허용
- 식당 공식 홈페이지 = official_url 확인 후만 접근 고려

### 6.3 Priority-first

| 순위 | 대상 | 이유 |
|---|---|---|
| 1 | existing_detail_available=true 레코드 | 이미 data 확인됨 |
| 2 | 전체 inventory 레코드 (공식 API) | 확인된 공식 소스 |
| 3 | 외부 소스 | 공식 소스 gap만 |

---

## 7. Cuisine Mapping (VisitSeoul category_code 기반)

| category_code | category_path | cuisine | subcategory |
|---|---|---|---|
| Cz9d1h6 | 음식>한식 | ["korean"] | korean_restaurant |
| Cx0t8m5 | 음식>카페/찻집 | ["cafe"] | cafe |
| Cl9s3y9 | 음식 | [] | restaurant |
| Cl9n1c2 | 음식>외국식>서양식 | ["western"] | western_restaurant |
| Ck6n0w6 | 음식>주점 | [] | bar_pub |
| Cm1y8v1 | 음식>외국식>중식 | ["chinese"] | chinese_restaurant |
| Ch7l5i4 | 음식>외국식>일식 | ["japanese"] | japanese_restaurant |
| Cn7k2s5 | 음식>외국식>기타외국식 | [] | restaurant |
| Cx3e9k9 | 음식>외국식>퓨전음식 | ["asian"] | fusion_restaurant |
| Cx2j0n1 | 음식>외국식 | [] | restaurant |

규칙: category_path → deterministic mapping만. AI semantic guess 금지.
Generic "음식" = CUISINE_UNKNOWN (억지 할당 금지).

---

## 8. Traveler Utility 필드 원칙

아래 필드는 공식 evidence만 허용:

| 필드 | 허용 값 | Evidence 요건 |
|---|---|---|
| vegetarian | unknown / menu_items / full_menu / none | 공식 메뉴 또는 관광기관 명시 |
| vegan | unknown / menu_items / full_menu / none | 공식 메뉴 또는 관광기관 명시 |
| halal_certification | 인증 기관명 | restaurant.halal 또는 공식 인증 |
| allergy | unknown / declared / on_request / none | 공식 알레르기 안내 |
| language.menu | 언어 목록 | 실제 메뉴 언어 확인 |
| language.staff | unknown / fluent / basic / none | 공식 관광 데이터 명시 |
| seating.solo_counter | yes / no / unknown | 실제 좌석 구조 evidence |
| accessibility.step_free | yes / no / unknown | 공식 배리어프리 인증/안내 |
| reservation | required / recommended / not_needed | 공식 예약 안내 |
| payment | 지원 수단 목록 | 공식 안내 |

MAP_SOURCE_FOR_TRAVELER_UTILITY = FORBIDDEN

---

## 9. Signature Dishes

공식 소스 명시 시만 수집:

```json
[{"ko": "칼국수"}, {"ko": "닭곰탕"}]
```

- 영문명: 공식 영문 제공 시만 → `{"ko": "...", "en": "..."}`
- 임의 영문 번역 생성 금지
- 소스: `restaurant.fd_reprsnt_menu` (VisitSeoul), KTO explicit menu field, 공식 메뉴 페이지

---

## 10. Images

- `image_main_url`, `image_additional_urls`: VisitSeoul API URL 보존
- **권리 상태 미확인 상태로 product에 직접 사용 금지**
- `review_flags` + `RIGHTS_CLEARANCE_REQUIRED` 항상 설정
- 레코드당 최대 5장 (relate_img)

---

## 11. Opening Hours

- `extra.cmmn_use_time` (VisitSeoul) = raw text, `\r\n` → ` | ` normalize 후 보존
- Breakfast / Late Night 태그: service layer에서 hours 파싱으로 파생
- `OPENING_HOURS_RAW_TEXT` flag 항상 설정
- 지도 검색 snippet으로 추정 금지

---

## 12. Completion Criteria

서울 Food 완료 기준:

| 기준 | 설명 |
|---|---|
| ALL_FIELDS_100_PERCENT | REQUIRED가 아님 |
| 1259 candidate 전부 Food V1 envelope | YES |
| 기존 source 재사용 완료 | YES |
| source contract audit 완료 | YES |
| official/public targeted gap-fill 완료 | YES |
| 가능한 location matching 완료 | YES |
| unknown/no 구분 | YES |
| provenance 전체 | YES |
| ambiguity review queue | YES |
| coverage 측정 완료 | YES |
| 추가 대량 공식 gap-fill 없음 | YES |

공식 evidence 없어서 unknown인 것 = 결함이 아님.

---

## 13. Michelin (서울 검증 결과)

SEOUL_MICHELIN_REUSABLE = 0

기존 `public/data/restaurants.json` 194건 전부 부산 (address_en = "Busan").
서울 Michelin 레코드 = 0. 반복 논의 불필요.

신규 Michelin 수집은 이 Task 범위 밖. gap으로만 보고.

---

## 14. 타 도시 적용 방침

### 14.1 경주 (Gyeongju)

- 기존 gyeongju-canonical-places-v1.jsonl 등 고품질 데이터 보유
- 처음부터 재수집 금지
- Food V1 envelope으로 wrap → provenance 보존 → missing audit → targeted gap-fill

### 14.2 부산 (Busan)

- restaurants.json에 Michelin 55건 + busan-mat 119건 + taegshlang 20건 존재
- 이 데이터를 Food V1 envelope으로 wrap 가능
- 기존 canonical 구조 유지

### 14.3 규칙

- 서울 branch에서 경주/부산 작업 시작 금지
- 도시별 별도 branch

---

## 15. FINAL_FREEZE 조건

FOOD_DISCOVERY_SPEC_STATUS = ACTIVE_PROVISIONAL

서울 → 경주 → 부산 검증 완료 후:

FINAL_FREEZE_AFTER = SEOUL_GYEONGJU_BUSAN_VALIDATION

그 전까지: 수정 가능. 변경 시 이 문서에 반영 + 버전 메모 추가.

---

## 변경 이력

| 날짜 | 변경 | SHA |
|---|---|---|
| 2026-08-11 | 초안 작성 (서울 R1 수집 기반) | _(FOOD-DISCOVERY-R1 커밋)_ |

---

*FOOD_DISCOVERY_SPEC_STATUS = ACTIVE_PROVISIONAL*  
*FINAL_FREEZE_AFTER = SEOUL_GYEONGJU_BUSAN_VALIDATION*
