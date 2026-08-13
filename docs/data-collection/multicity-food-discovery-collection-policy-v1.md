# Multicity Food Discovery Collection Policy v1

**Status**: ACTIVE_FINAL  
**Applies to**: Seoul (applied 2026-08-11), Gyeongju (active 2026-08-11), Busan (closeout 2026-08-12)  
**FINAL_FREEZE_CONDITION_MET**: SEOUL_GYEONGJU_BUSAN_VALIDATION = COMPLETE (2026-08-12)  
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

**KTO TourAPI type39 phone 수집 경로** (경주 검증 2026-08-11):
- `detailCommon2` → `tel` 필드: 수집 API에 따라 공란일 수 있음
- `detailIntro2` → **`infocenterfood`**: type39(식당) 전화번호의 실제 source
- 먼저 `detailCommon2`로 `tel` 확인, 없으면 반드시 `detailIntro2` → `infocenterfood` 확인
- `detailIntro2` type39 추가 유용 필드: `opentimefood`(영업시간), `restdatefood`(휴무일), `firstmenu`(대표메뉴), `treatmenu`(취급메뉴), `packing`(포장), `parkingfood`(주차)

**KTO type39 anti-pattern 규칙** (경주 V2 오류 교훈, 2026-08-11):

```
KTO_TYPE39_PHONE_PRIMARY_DETAIL_FIELD = detailIntro2.infocenterfood
TYPE39_DETAILINTRO2_MUST_BE_CHECKED = YES
KTO_DETAILCOMMON2_TEL_EMPTY != RESTAURANT_PHONE_NOT_AVAILABLE
KTO_LIST_TEL_EMPTY != RESTAURANT_PHONE_NOT_AVAILABLE
```

- `getAreaBasedList2.tel` 또는 `detailCommon2.tel` 공란만 보고 "type39 전화 없음" 판정 금지
- 반드시 `detailIntro2.infocenterfood` 까지 확인 후 phone 없음 결론 가능
- `detailIntro2` 호출 시 `infocenterfood` 외 유용 필드 동시 수집 (→ §6.1 `ONE_FETCH_COLLECT_ALL_USEFUL_FACTS` 원칙 적용)

**도시별 검증 결과 (FINAL 기준):**

### 부산 (Busan) — 검증 완료 2026-08-12

```
PRIMARY_LOCAL_SOURCE   = FoodService (VisitBusan API, UC_SEQ 기반)
MULTILINGUAL_COMMON_ID = UC_SEQ  (KO/EN/JA/ZHS/ZHT 공통; 99.8% 일치)
KTO_UNIVERSE           = SEPARATE (KorService2 contentId ≠ FoodService UC_SEQ)
EN_INVENTORY           = EngService2 (별도 contentId; 부산 FD=9건만 food)
IMAGE_SOURCE           = VisitBusan(usable) + KTO detailImage2(usable)
```

- FoodService와 KorService2는 완전히 별개의 venue universe — phone_exact=0, 50m latlng 매칭도 false positive
- UC_SEQ로 KO/EN/JA/ZHS/ZHT 다국어 연결 바로 가능
- KorService2 contentId ≠ EngService2 contentId — EN 수집은 별도 EngService2 수집 후 identity 매칭 필수

### 경주 (Gyeongju) — 검증 완료 2026-08-11

```
PRIMARY_LOCAL_SOURCE   = gyeongju.go.kr/tour (최우선)
FOOD_SPECIFIC_SOURCE   = VisitGyeongju
KTO_DETAIL_CRITICAL    = detailIntro2 (infocenterfood for phone)
```

- gyeongju.go.kr/tour = 경주 최신 관광 source 우선
- KTO type39 phone은 반드시 `detailIntro2.infocenterfood` 확인

### 서울 (Seoul) — 검증 완료 2026-08-11

```
PRIMARY_LOCAL_SOURCE   = VisitSeoul 공식 API (POST /api/v1/contents/info)
MULTILINGUAL_SUPPORT   = 단일 cid + multi_lang_list
```

- VisitSeoul API 상세 구조는 §5 참조

지역 source와 KTO가 같은 장소 universe라고 가정 금지.

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

### 8.1 Reservation / Payment 의미론 확정 규칙 (2026-08-12)

```
RESERVATION_AVAILABILITY_IS_NOT_RECOMMENDATION = YES
PAYMENT_LIST_SEMANTICS = CONFIRMED_SUPPORTED_METHODS_NON_EXHAUSTIVE
PAYMENT_METHOD_ABSENT_FROM_LIST != NOT_ACCEPTED
```

**Reservation 규칙:**

KTO `reservationfood` 값 (`가능`, `예약 가능`, `전화 예약 가능`, `불가`, `전화 문의` 등)을
Food V1 `reservation` enum (`required / recommended / not_needed`)으로 변환 금지.

`예약 가능` (availability) ≠ `recommended` (recommendation)  
`불가` (not available) ≠ `not_needed` (walk-in semantics)

원본 evidence는 `field_provenance._kto_detailIntro2_raw`에 보존. 새 enum 생성 금지.

**Payment 규칙:**

`payment = ["credit_card"]` 의미: "신용카드 사용이 확인됨" (비포괄적 목록)

- 목록에 없는 결제수단 = 지원 불가 추론 금지
- 부정 사실 (`없음`) = 목록 구조에 표현 불가 → 미반영
- 새 vocabulary는 기존 활성 Food V1 vocabulary에 없으면 생성 금지

이 규칙은 서울/경주/부산/제주 공통이며 향후 메인 핸드오프에도 유지.

---

## 9. Signature Dishes

공식 소스 명시 시만 수집:

```json
[{"ko": "칼국수"}, {"ko": "닭곰탕"}]
```

- 영문명: 공식 영문 제공 시만 → `{"ko": "...", "en": "..."}`
- 임의 영문 번역 생성 금지
- 소스: `restaurant.fd_reprsnt_menu` (VisitSeoul), KTO `firstmenu`/`treatmenu` (detailIntro2), 공식 메뉴 페이지

---

## 10. Images

- `image_main_url`, `image_additional_urls`: VisitSeoul API URL 보존
- **권리 상태 미확인 상태로 product에 직접 사용 금지**
- `review_flags` + `RIGHTS_CLEARANCE_REQUIRED` 항상 설정
- 레코드당 최대 5장 (relate_img)

---

## 11. Opening Hours

- `extra.cmmn_use_time` (VisitSeoul) = raw text, `\r\n` → ` | ` normalize 후 보존
- KTO `opentimefood` (detailIntro2 type39) = raw text, `<br>` → ` | ` normalize 후 보존
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

### 14.2 부산 (Busan) — CLOSEOUT COMPLETE 2026-08-12

- TOTAL=721 (INDIVIDUAL=684, COLLECTIVE=3, EXCLUDED=4, DUPLICATE=30)
- JSONL: `data/tourapi/enriched/busan/busan-food-discovery-candidates-v1.jsonl`
- FINAL SHA: `f3af0c8f112afaa66f63d2cd0ac14b225ef80621ef421c3746719c0acc193b3e`
- Phone: 677/684 verified, 7 OPEN_PHONE_VERIFICATION (Naver blocked)
- Image: 601/684 present, 83 empty (KTO 44 NO_IMAGE_ITEM + 39 source exhausted)
- EN: 266건 NO_OFFICIAL_EN_MATCH_FOUND_IN_CURRENT_INVENTORY
- 상세: `docs/data-collection/busan-food-discovery-v1-closeout-handoff.md`

### 14.3 규칙

- 서울 branch에서 경주/부산 작업 시작 금지
- 도시별 별도 branch

---

## 15.1 Source Field Semantics Preservation (R1 추가 — 2026-08-11)

**SOURCE_FIELD_SEMANTICS_MUST_BE_PRESERVED = YES**

source에 특정 field가 존재한다고 해서 그 field가 인증(certification), 공식 분류, 검증된 속성을 의미한다고 자동 단정하지 않는다.

### 적용 예시 (서울 R1 교훈)

VisitSeoul `restaurant.halal` 필드:
- 필드가 존재함 → OK
- 비어있지 않음 → OK
- **필드명이 "halal"이라고 해서 공식 Halal 인증 = NO**

올바른 처리:
```
restaurant.halal (비어있지 않음)
  → halal_evidence (또는 halal_declared)
  + review_flag: HALAL_CERTIFICATION_STATUS_UNVERIFIED
```

금지:
```
restaurant.halal → halal_certification (자동 인증 선언)
```

동일 원칙 적용:
- `restaurant.dietary` → `dietary_evidence` (not `dietary_certification`)
- `restaurant.muslim` → `muslim_evidence`
- `restaurant.salam` → `salam_evidence`
- source `recommended` field → fact로 승격 금지
- source `friendly` tag → fact로 승격 금지

> **서울 R1 현황**: CANDIDATES_R1에서 이미 `halal_certification` 명칭 사용됨.
> MAIN 임포트 전 → `halal_evidence`로 rename + HALAL_CERTIFICATION_STATUS_UNVERIFIED flag 추가 필요.

---

## 15.2 Opening Hours — Raw Text vs Normalized Structure (R1 추가 — 2026-08-11)

**RAW_OPENING_HOURS_IS_WEEKLY_STRUCTURE = NO**

source에서 가져온 raw text는 `opening_hours_weekly`가 아니다.

### 올바른 필드 구분

| 필드명 | 설명 | 허용 값 |
|---|---|---|
| `opening_hours_raw_text` | source 원문 그대로 보존 | 문자열 (예: "평일 11:00~22:00\r\n주말 12:00~22:00") |
| `opening_hours_weekly` | 구조화 완료된 요일별 시간 | `{"mon": [{"open": "11:00", "close": "22:00"}], ...}` |

raw text가 있다고 `opening_hours_weekly` = 완료로 취급 금지.

### 구조화 방식

raw text → `opening_hours_weekly` 변환:
- deterministic rule 기반 파싱만 허용 (AI 해석 금지)
- 변환 실패 시: `opening_hours_weekly` 부재, `opening_hours_raw_text` 보존 + flag

### Gyeongju 특이사항

경주 데이터의 `opening_hours` 필드:
"대표메뉴 : 파스타, 오믈렛 영업시간 : 11:00-20:50 (Break Time 15:00-17:00) 휴무일 : 매주 월,화요일 주차 : ..."

이 string은 단일 source 필드에 **대표메뉴 + 영업시간 + 휴무일 + 주차** 혼합.
→ `opening_hours_raw_text`로 보존 (전체)
→ 파싱 시 `signature_dishes` / `opening_hours_weekly` / `closed_days`로 분리 가능하나, 파싱 정확도 검증 필수

> **서울 R1 현황**: `opening_hours_weekly`에 VisitSeoul `extra.cmmn_use_time` raw text 저장됨.
> MAIN 임포트 전 → `opening_hours_raw_text`로 rename 필요.
> `opening_hours_weekly` 구조화는 별도 parsing 스텝.

---

## 15.3 Seoul Completion Meaning (확정 — 2026-08-11)

`SEOUL_FOOD_ENRICHMENT_COMPLETE = YES`의 정확한 의미:

**의미 O**: "현재 접근 가능한 공식/공공 source에서 대량 factual enrichment와 source audit을 완료했다."

**의미 X** (이 의미가 아님):
- ALL_FIELDS_KNOWN = YES
- language/payment/seating/accessibility/reservation 등 모든 utility field가 채워짐

서울에서 이 필드들이 UNKNOWN인 것 = 정상.

**UNKNOWN_IS_NOT_DATA_FAILURE = YES**

---

## 15.4 Image Rights (확정 — 2026-08-11)

```
IMAGE_URL_PRESENT != PRODUCT_USABLE_IMAGE
```

image URL이 있더라도:
- 권리 확인 전 product에서 사용 금지
- `image_rights_status` 추적 필요
- 서울 R1: VisitSeoul 이미지 URL 1259건 → 권리 미확인 상태

허용 image_rights_status 값:
- `VG_RESTAURANT_OFFICIAL` (경주 gyeongju.go.kr)
- `VISITSEOUL_UNCLEARED` (서울 R1)
- `RIGHTS_VERIFIED` (공식 확인)

---

## 15. FINAL_FREEZE 조건

```
FOOD_DISCOVERY_SPEC_STATUS = ACTIVE_FINAL
FINAL_FREEZE_CONDITION = SEOUL_GYEONGJU_BUSAN_VALIDATION
FINAL_FREEZE_DATE = 2026-08-12
FINAL_FREEZE_COMMIT = TASK-MULTICITY-FOOD-COLLECTION-SPEC-FINAL-FREEZE-R1
```

서울 + 경주 + 부산 검증 완료 → FINAL FREEZE 조건 충족.

이 상태에서:
- 새 도시에서 단순히 다른 데이터 형태가 나왔다는 이유만으로 공통 규칙 즉시 변경 금지
- 실제 공통 계약 결함 발견 시에만 메인에서 변경 승인
- 변경 시 반드시 변경이력 기록 + 이유 명시

---

## 16. Phone Gate 정책 (경주 검증 추가 — 2026-08-11)

### 16.1 전화번호 필수 원칙

```
RESTAURANT_SERVICE_PHONE_REQUIRED = YES
FINAL_RETAINED_CANDIDATES_WITHOUT_PHONE = 0
```

- 서비스 노출 후보(service candidate)는 반드시 검증된 전화번호를 가져야 한다.
- 전화번호가 없으면 서비스 풀에서 제외(EXCLUDED_NO_VERIFIABLE_PHONE)한다.
- **단**: 제외 ≠ 폐업 확정(`MISSING_PHONE_EQUALS_CLOSED_CONFIRMED = NO`)

### 16.2 전화번호 수집 순서 (공식 소스 우선)

1. **기존 source/list record 재사용** — `getAreaBasedList2.tel` 등 이미 수집된 값 확인
2. **KTO detailIntro2** (contentTypeId=39) — `infocenterfood` 필드 (`detailCommon2.tel` 공란이어도 여기서 별도 확인 필수)
3. **기타 KTO detail** — `detailCommon2`, `detailInfo2` 등 승인된 상세 endpoint
4. **VisitSeoul** → `extra.cmmn_telno`
5. **지자체 공식 관광 사이트**
6. **그래도 phone 없음 → Naver Place** (외부 최종 검증)
7. **Naver phone 있음** → retain + same-pass factual enrichment
8. **Naver phone 없음** → `EXCLUDED_NO_VERIFIABLE_PHONE`

`TYPE39_DETAILINTRO2_MUST_BE_CHECKED = YES` — STEP 6(Naver)로 이동 전 STEP 2 완료가 전제조건.

### 16.3 Naver 단독 최종 검증

```
NAVER_FINAL_VERIFICATION_ONLY = YES
GOOGLE_MAPS_VERIFICATION = FORBIDDEN
KAKAO_VERIFICATION = FORBIDDEN
```

- Naver Place = 한국 식당 전화번호의 유일한 외부 최종 검증 소스
- Google Maps: 데이터 스테일 가능성 → **사용 금지**
- Kakao Map: 폐업·이전 정보 반영 지연 → **사용 금지**

### 16.4 Naver same-pass enrichment

전화번호 확인 시 같은 Naver Place 페이지에서 명시적 factual field를 동시에 수집.
추론/AI 요약 금지. phone 없으면 그 즉시 수집 STOP.

### 16.5 제외 원칙

| 상태 | 의미 |
|---|---|
| `EXCLUDED_NO_VERIFIABLE_PHONE` | 공식 + Naver 확인 후 phone 없음 |
| `EXCLUDED_NOT_SINGLE_RESTAURANT_ENTITY` | 시장 집합형 구역 등 단일 식당이 아님 |
| `CLOSED_CONFIRMED` | 폐업 직접 증거 있음 (phone 없음만으로는 불가) |
| `VERIFICATION_BLOCKED` | Naver 접근 차단으로 검증 미완료 |

제외된 레코드도 원본 facts 삭제 금지. audit에 전건 기록.

### 16.6 시장 집합형 특수 케이스

- 시장 대표전화 ≠ 개별 식당 전화 (`MARKET_MAIN_PHONE_EQUALS_RESTAURANT_PHONE = NO`)
- 집합 구역이 단일 식당 identity가 아니면: `EXCLUDED_NOT_SINGLE_RESTAURANT_ENTITY`
- Naver 확인 없이도 entity type 판정 가능

### 16.7 Naver 접근 불가 STOP 조건

Naver 전 도메인 차단 시:
- 공식 소스로 확인한 phone은 적용 가능
- Naver 필요 건: `VERIFICATION_BLOCKED` 상태 유지 (제거 금지)
- candidate pool 변경 최소화
- `PHONE_GATE_STATUS = OPEN_PHONE_VERIFICATION` 유지

### 16.9 다음 도시 Food Precheck 체크리스트 (Busan 우선)

부산·서울·제주 등 다음 도시 Food 수집 시작 전 반드시 확인:

```
BUSAN_FOOD_PRECHECK_MUST_CHECK:
1.  기존 Busan phone 값 provenance — legacy/default utility field 신뢰 금지
2.  KTO contentTypeId=39 여부 확인
3.  type39이면 detailIntro2.infocenterfood 필수 (TYPE39_DETAILINTRO2_MUST_BE_CHECKED = YES)
4.  detailCommon2.tel empty → phone 없음으로 판정 금지
5.  opentimefood = opening_hours_raw_text 의미 (weekly structure 아님)
6.  firstmenu / treatmenu = source factual menu evidence (AI 해석 금지)
7.  restdatefood = 휴무일 factual source
8.  detailIntro2 1회 호출에서 유용 필드 전량 수집 (§6.1 원칙)
9.  official/direct source 모두 확인 후 → Naver Place only
10. Naver phone 확인 → same-pass 누락 factual 수집
11. Naver phone 없음 → EXCLUDED_NO_VERIFIABLE_PHONE
12. Google Maps / Kakao 전화 검증 금지
13. phone missing != CLOSED_CONFIRMED
14. unknown → no 변환 금지 (UNKNOWN_DISTINCT_FROM_NO)
15. AI 추론 사실 입력 금지 (AI_INFERRED_RESTAURANT_FACT = FORBIDDEN)
```

### 16.8 도시별 Phone Gate 상태 (최종 2026-08-12)

| 도시 | 상태 | 비고 |
|---|---|---|
| 경주 | NEAR_COMPLETE | detailIntro2 68/69 phone 복구. No Words 1건 Naver 차단 대기. 성동시장 2건 entity 제외. |
| 부산 | **CLOSEOUT** | 677/684 verified. 7건 OPEN_PHONE_VERIFICATION (Naver blocked). |
| 서울 | NOT_STARTED | Phone Gate 적용 예정 |

---

## 17. Official/Public Source Use Policy (2026-08-12 확정)

### 17.1 이미지 권리 원칙

```
OFFICIAL_PUBLIC_IMAGE_USE = ALLOWED_WITH_REQUIRED_ATTRIBUTION
PRIVATE_IDENTIFIABLE_PERSON_IMAGE = EXCLUDE
OFFICIAL_PROMOTIONAL_PUBLIC_FIGURE_IMAGE = ALLOWED
REOPEN_APPROVED_SOURCE_RIGHTS_REVIEW = NO
FUTURE_MAIN_HANDOFF_MUST_INCLUDE_THIS_RULE = YES
CONCRETE_RIGHTS_OBJECTION_ACTION = HIDE_OR_REMOVE_AFFECTED_CONTENT_AND_REVIEW
```

#### 허용 이미지 소스

| 소스 | 도메인 예시 | 상태 |
|---|---|---|
| KTO 공식 | tong.visitkorea.or.kr | `rights: "usable"` |
| VisitBusan 공식 | www.visitbusan.net | `rights: "usable"` (2026-08-12 확정) |
| 부산시 공식 관광 | visitbusan.net 계열 | `rights: "usable"` |
| 지자체 공식 사이트 | 공식 관광 도메인 | `rights: "usable"` |
| 공공 API 이미지 | FoodService / TourAPI | `rights: "usable"` |

#### 제외 대상

- 일반 개인이 식별 가능하게 나온 사진 (사적 촬영 추정) → `rights: "excluded"`
- 출처 불명 이미지 URL → `rights: "review_required"` (usable 승격 금지)
- 블로그·SNS 임의 사진 → 수집 자체 금지

#### 공인 행사·홍보 자료의 공인인사 사진

- 공식 관광 홍보 자료에 공인이 등장하는 경우 → ALLOWED
- 단, 개인 명의 초상권 계약이 별도 존재하는 경우 → 별도 검토 필요

### 17.2 Fact 권리 원칙

```
OFFICIAL_PUBLIC_FACT_USE = ALLOWED_WITH_PROVENANCE
```

- KTO, VisitBusan, 지자체, 공공 API에서 수집된 factual field → 사용 허용
- 출처(source)는 반드시 `field_provenance`에 보존
- source 미기재 fact 승격 금지 (`FIELD_PROVENANCE = REQUIRED` 절대 고정 원칙과 동일)

### 17.3 visitbusan.net 이미지 소급 적용 (2026-08-12)

- 부산 Food V1 JSONL: `rights: "review_required"` (www.visitbusan.net) → `rights: "usable"` 전환
- 대상: 415건 (TASK-BUSAN-FOOD-EXISTING-SOURCE-FIELD-RECOVERY-R2)
- 근거: VisitBusan은 부산시 공식 관광 플랫폼 → Official/Public Source
- 사후 의무: 향후 실제 권리 이의 제기 또는 source 조건 변경 시 → 해당 asset 즉시 비노출 후 재검토

### 17.4 Main Handoff 시 필수 전달 항목

```
FUTURE_MAIN_HANDOFF_MUST_INCLUDE_THIS_RULE = YES
```

부산 Food V1 MAIN 임포트 시 반드시 포함:
1. image_urls[].rights = "usable" (KTO, VisitBusan) vs "excluded" (private person)
2. source attribution (field_provenance, image source) 전달
3. 이의 제기 대응 절차: HIDE_OR_REMOVE_AFFECTED_CONTENT → REVIEW

---

---

## 18. Collective Food Destination (부산 검증 추가 — 2026-08-12)

모든 도시에서 individual restaurant와 collective food destination을 명확히 구분한다.

### 18.1 Collective Food Destination 정의

**복합 식음료 관광지** 예:

| 유형 | 부산 예시 |
|---|---|
| 해산물 복합 공간 | 영도해녀촌, 광안리 민락회타운 |
| 전통시장 내 식당군 | 해운대시장 |
| 먹거리 거리 | 도시별 음식 특화 거리 |

### 18.2 규칙

```
COLLECTIVE_FOOD_DESTINATION_POLICY = YES

PHONE_GATE_APPLY = NO
EXCLUDE_ON_MISSING_PHONE = NO
GENERIC_ENTITY_QA_BULK_EXCLUSION = FORBIDDEN
```

- Food/tourism destination으로 유지 가능
- Individual restaurant Phone Gate 적용 금지 — phone 없음으로 제거 금지
- `ENTITY_QA: NOT_SINGLE_RESTAURANT_ENTITY` 플래그 → generic `ENTITY_QA:*` 전체 제외 필터 적용 금지
- `ENTITY_QA: FOOD_SCOPE_EXCLUDED`(쿠킹클래스 등)와 반드시 구분
- 새 city-specific schema 생성 금지

---

## 19. Cooking Class / Experience (부산 검증 추가 — 2026-08-12)

쿠킹클래스·학원형 체험은 current Food/Place individual restaurant 후보에 자동 포함하지 않는다.

```
COOKING_CLASS_FOOD_SCOPE_EXCLUSION = CONDITIONAL
BLANKET_EXPERIENCE_EXCLUSION = FORBIDDEN
```

- 실제 restaurant/food destination인지 product scope로 판단
- 부산에서 확정한 4개 cooking class (코리아쿠킹클래스, 부산 오키친 쿠킹하우스, 배로모디 쿠킹클래스, 부산 로컬푸드 쿠킹클래스)는 Food candidate에서 제외
- 이를 모든 도시의 모든 체험에 blanket exclusion 규칙으로 확대하지 않는다
- 향후 Experience 카테고리 검토 가능

---

## 20. Multilingual 규칙 (3도시 검증 통합 — 2026-08-12)

### 20.1 Identity 검증 우선순위

지역 공식 multilingual source가 stable language ID를 제공하면 ID 우선 연결.

이름 fuzzy match보다:

1. stable ID (UC_SEQ, contentId 등)
2. 공식 relation (연결 테이블)
3. phone exact match
4. address/coordinates
5. name + location exact evidence

### 20.2 KTO 언어 시스템 분리

```
KORSERVICE2_CONTENTID != ENGSERVICE2_CONTENTID
KTO_SAME_CONTENTID_DIFFERENT_LANGUAGE = FORBIDDEN_ASSUMPTION
```

- 동일 장소도 KorService2와 EngService2의 contentId가 다름
- "같은 contentId + language 파라미터"로 다국어 회수 불가
- EN 수집은 EngService2 별도 수집 후 lat/lng + 이름 identity 매칭 필수

### 20.3 FoodService UC_SEQ 다국어 공통 ID (부산 검증)

```
FOODSERVICE_UC_SEQ_IS_MULTILINGUAL_ID = YES
UC_SEQ_CONSISTENCY = 99.8%  (KO/EN/JA/ZHS/ZHT 동일)
```

- 부산 VisitBusan FoodService: UC_SEQ = KO/EN/JA/ZHS/ZHT 공통 ID
- 파서 키: `getFoodZhs` (소문자 s) — `getFoodZhS` (대문자 S) 아님 주의

### 20.4 EN 미매칭 표현

공식 EN exact match를 찾지 못한 경우 반드시 이 표현 사용:

```
NO_OFFICIAL_EN_MATCH_FOUND_IN_CURRENT_INVENTORY
```

이를 절대로 아래 의미로 해석하지 않는다:
- "영어가 존재하지 않는다" → ❌
- "폐업했다" → ❌
- "비활성 장소다" → ❌
- "잘못된 장소다" → ❌

```
AI_TRANSLATION_AS_SOURCE_RECOVERY = FORBIDDEN
```

---

## 21. Source-State Audit 선행 (3도시 검증 통합 — 2026-08-12)

새 도시 또는 오래된 도시 재수집 전 **Source State Audit 먼저** 실행.

```
EXISTING_SOURCE_RECOVERY_BEFORE_NEW_API = YES
```

### 21.1 Audit 확인 항목

| 항목 | 내용 |
|---|---|
| endpoint 현재 상태 | 응답 가능 여부, URL 변경 여부 |
| 기존 raw 존재 여부 | 이미 수집된 파일 확인 |
| 기존 수집 완료 여부 | pagination completeness |
| language availability | 언어별 endpoint 상태 (ZHS/ZHT parser key 포함) |
| stored source에서 회수 가능한 gap | detailIntro2, detailImage2 등 미수집 상세 endpoint |

기존 raw가 있는데 API부터 재호출 금지.

### 21.2 다음 도시 handoff 시 필수 포함 항목

향후 모든 도시 Food handoff에 반드시 포함:

- candidate 총계/분류 (individual / collective / excluded / duplicate / unresolved)
- source inventory (사용한 source 목록, raw 위치)
- provenance/freshness
- multilingual linking 방식
- open verification blocker (NAVER_BLOCKED 건수)
- UNKNOWN 종료 항목 목록
- 공식/공공 정보·이미지 사용 규칙
- downstream에서 보호해야 할 특수 candidate (collective 등)
- main import 미실행 여부 확인 (`MAIN_IMPORT = 0`)

보조컴퓨터는 product schema/DB/import를 임의 설계하지 않는다.

---

## 변경 이력

| 날짜 | 변경 | SHA |
|---|---|---|
| 2026-08-11 | 초안 작성 (서울 R1 수집 기반) | _(FOOD-DISCOVERY-R1 커밋)_ |
| 2026-08-11 | Section 16 Phone Gate 추가 (경주 V2 검증 기반). Section 4 KTO detailIntro2 infocenterfood 경로 추가. Section 9 KTO firstmenu 참조 추가. Section 11 KTO opentimefood 참조 추가. Applies to 업데이트. | 8dedbfe → bfcf495 |
| 2026-08-11 | Section 4 KTO type39 anti-pattern 규칙 추가 (KTO_DETAILCOMMON2_TEL_EMPTY≠NO_PHONE, TYPE39_DETAILINTRO2_MUST_BE_CHECKED). Section 16.2 phone 수집 8단계 chain 확장. Section 16.9 다음 도시 precheck 체크리스트 추가(15항목). | TASK-GYEONGJU-FOOD-NAVER-CLOSEOUT-R1 |
| 2026-08-12 | Section 17 Official/Public Source Use Policy 추가. visitbusan.net 이미지 usable 확정(2026-08-12). PRIVATE_IDENTIFIABLE_PERSON_IMAGE = EXCLUDE. FUTURE_MAIN_HANDOFF_MUST_INCLUDE_THIS_RULE = YES. | TASK-BUSAN-FOOD-EXISTING-SOURCE-FIELD-RECOVERY-R2 |
| 2026-08-12 | Section 8.1 추가. RESERVATION_AVAILABILITY_IS_NOT_RECOMMENDATION = YES. PAYMENT_LIST_SEMANTICS = CONFIRMED_SUPPORTED_METHODS_NON_EXHAUSTIVE. PAYMENT_METHOD_ABSENT_FROM_LIST != NOT_ACCEPTED. 서울/경주/부산/제주 공통 규칙. | TASK-BUSAN-FOOD-RESERVATION-PAYMENT-RECOVERY-CORRECTION-R2 |
| 2026-08-12 | **FINAL FREEZE.** Section 4 도시별 검증 결과(Busan/Gyeongju/Seoul) 추가. Section 14.2 Busan CLOSEOUT 업데이트(721건). Section 15 ACTIVE_FINAL 변경. Section 16.8 부산 Phone Gate CLOSEOUT. Section 18 Collective Food Destination 신규. Section 19 Cooking Class/Experience 신규. Section 20 Multilingual 규칙 신규(KTO 언어 분리·UC_SEQ·NO_OFFICIAL_EN_MATCH). Section 21 Source-State Audit 선행 신규(EXISTING_SOURCE_RECOVERY_BEFORE_NEW_API=YES). | TASK-MULTICITY-FOOD-COLLECTION-SPEC-FINAL-FREEZE-R1 |

---

*FOOD_DISCOVERY_SPEC_STATUS = ACTIVE_FINAL*  
*FINAL_FREEZE_DATE = 2026-08-12*  
*FINAL_FREEZE_CONDITION = SEOUL_GYEONGJU_BUSAN_VALIDATION = COMPLETE*
