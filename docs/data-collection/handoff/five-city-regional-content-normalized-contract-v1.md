# Five-City Regional Content Normalized Contract v1

> Task: `TASK-FIVE-CITY-REGIONAL-CONTENT-NORMALIZED-CONTRACT-V1`  
> Schema Version: `normalized-v1`  
> Source Branch: `data/five-city-regional-content-handoff-v1` (HEAD: `cf681ea`)  
> Generated: 2026-08-22

---

## 1. 목적

부산·경주·서울·제주·전주 5개 도시의 지역 추천 콘텐츠 artifact는 서로 다른 JSON 스키마를 사용한다. 본 계약서는 메인 노트북이 도시별 분기 없이 동일한 구조로 5개 도시 데이터를 읽을 수 있는 **공통 소비 형식(normalized-v1)**을 정의한다.

**원본 파일은 수정하지 않는다.** 정규화 결과는 별도 파일로 생성된다.

---

## 2. 정규화 파일 경로

```
data/regional-recommendations/normalized/
  busan-regional-content-normalized-v1.json
  gyeongju-regional-content-normalized-v1.json
  seoul-regional-content-normalized-v1.json
  jeju-regional-content-normalized-v1.json
  jeonju-regional-content-normalized-v1.json
  five-city-regional-content-normalized-manifest-v1.json
  normalize_regional_content.py       ← 재현 가능 normalization helper
```

원본 소스 파일:
```
data/regional-recommendations/{city}/{city}-recommended-courses-v1.json
data/regional-recommendations/{city}/{city}-recommended-now-v1.json
data/regional-recommendations/{city}/{city}-official-guides-v1.json
data/regional-recommendations/{city}/{city}-travel-utility-v1.json
```

---

## 3. 정규화 대상 스키마 차이 (발견된 실제 차이)

| 항목 | 부산 | 경주 | 서울 | 제주 | 전주 |
|------|------|------|------|------|------|
| 코스 최상위 키 | `final_courses` | `final_courses` | `final_recommended_courses` | `final_recommended_courses` | `final_recommended_courses` |
| Stops 구조 | dict by day | **혼합** (C-001=dict, C-002/003=list) | list | list | list |
| Stop canonical_id 필드 | `existing_city_spots_id` | `existing_canonical_id` | `existing_canonical_id` | `existing_canonical_id` | `canonical_id` |
| Stop `linkage_type` 필드 | 없음 | 없음 | 없음 | 없음 | **있음** |
| Stale 키 | `expired_excluded` | `stale_or_excluded` | `stale_or_excluded` | `stale_or_excluded` | `stale_or_excluded` |
| RN canonical 필드 | `existing_city_spots_id` (단일, 없는 항목도 있음) | `existing_canonical_id` (단일) | `existing_canonical_id` (단일) | `existing_canonical_ids` (리스트) | `existing_canonical_ids` (리스트) |
| Locale 가용 형식 | list `["ko","en"]` | list `["ko","en"]` | dict `{"ko": true}` | dict `{"ko": true}` | dict `{"ko": true}` |
| Guide locale 요약 키 | `guides_count_by_locale` | `guide_count_summary` | `guide_count_summary` | `guide_count_summary` | `guide_count_summary` |

---

## 4. Normalized Top-Level Schema

```json
{
  "schema_version": "normalized-v1",
  "city": "string",
  "as_of": "YYYY-MM-DD",
  "source_branch": "string",
  "recommended_courses": [ /* 아래 §5 */ ],
  "excluded_stale_recommended_now": [ /* stale 제외 항목 */ ],
  "recommended_now": [ /* 아래 §6 */ ],
  "official_guides": [ /* 아래 §7 */ ],
  "travel_utility": [ /* 아래 §8 */ ],
  "source_summary": { /* 원본 스키마 정보 */ },
  "quality_metadata": { /* QA 검증 메타데이터 */ }
}
```

---

## 5. recommended_courses 스키마

### 코스 항목

```json
{
  "id": "string",
  "title": "string | null",
  "title_en": "string | null",
  "theme": "string | null",
  "traveler_fit": "string | null",
  "recommended_reason": "string | null",
  "duration": "string | null",
  "days": "number | null",
  "seasonality": "string | null",
  "difficulty": "string | null",
  "is_reserve": "boolean",
  "stops": [ /* 아래 §5-A */ ],
  "source": "string | null",
  "as_of": "string | null"
}
```

### 5-A. 코스 Stop 항목

```json
{
  "sequence": "number",
  "name": "string",
  "name_en": "string | null",
  "canonical_id": "string | null",
  "linkage_type": "string (enum)",
  "relation_note": "string | null",
  "stop_role": "string | null"
}
```

**Linkage enum 값:** §9 참조.

**정규화 규칙:**
- `canonical_id`: `canonical_id` → `existing_canonical_id` → `existing_city_spots_id` 순으로 첫 번째 non-null 값. 없으면 null.
- `linkage_type`: Jeonju는 `linkage_type` 필드 직접 사용. 나머지 도시는 §9 추론 규칙 적용.
- `sequence`: 원본 `order` 필드 그대로 사용. 없으면 리스트 인덱스+1.
- dict-by-day stops는 day1 → day2 → ... 순서로 평탄화.
- `is_reserve`: `reserve_courses`에 속하면 true, `final_*courses`에 속하면 false.
- 신규 place 생성 없음. canonical_id null → 그대로 null.

---

## 6. recommended_now 스키마

```json
{
  "id": "string",
  "name": "string | null",
  "name_en": "string | null",
  "category": "string | null",
  "why_now": "string | null",
  "valid_from": "string | null",
  "valid_to": "string | null",
  "review_by": "string | null",
  "canonical_id": "string | null",
  "canonical_ids_all": "array | null",
  "linkage_type": "string (enum)",
  "is_reserve": "boolean",
  "source": "string | null",
  "as_of": "string | null"
}
```

**정규화 규칙:**
- `canonical_id`: 단일 필드 (`existing_canonical_id` / `existing_city_spots_id`) 또는 리스트 (`existing_canonical_ids[0].canonical_id`) — 첫 번째 non-null. null → null.
- `canonical_ids_all`: 항목에 `existing_canonical_ids` 리스트가 있고 길이가 2 이상인 경우만 채움 (여러 canonical 연결 보존). `[{canonical_id, id_note}]` 형식.
- `is_reserve`: `reserve_recommended_now`이면 true.
- stale/expired 항목은 `excluded_stale_recommended_now`로 분리 — `recommended_now`에 포함하지 않음.

---

## 7. official_guides 스키마

```json
{
  "id": "string",
  "title": "string | null",
  "type": "string | null",
  "locales": ["string"],
  "edition": "string | null",
  "issue_date": "string | null",
  "provider": "string | null",
  "source_url": "string | null",
  "download_url": "string | null",
  "review_by": "string | null"
}
```

**정규화 규칙:**
- `locales`: `locale="multi"` → `locale_coverage` 리스트 그대로. 단일 locale → `[locale]`. 항상 list.
- `provider`: 가이드 항목 `provider` 필드 → 없으면 상위 `source_portal` 필드 fallback.

---

## 8. travel_utility 스키마

```json
{
  "id": "string",
  "category": "string | null",
  "title": "string | null",
  "summary": {
    "ko": "string | null",
    "en": "string | null",
    "ja": "string | null",
    "zh-CN": "string | null"
  },
  "eligibility": "string | null",
  "locales": ["string"],
  "provider": "string | null",
  "source_url": "string | null",
  "as_of": "string | null",
  "review_by": "string | null",
  "freshness_note": "string | null"
}
```

**정규화 규칙:**
- `summary`: `summary_ko`, `summary_en`, `summary_ja`, `summary_zh-CN` (또는 `summary_zh_CN`) 필드를 dict로 통합. null 값은 생략.
- `locales`: `locale_availability` dict → `{k: v if v}` 키 리스트. list → 그대로.
- `eligibility`: 일부 도시 utility에 `eligibility` 필드가 없음 → null.

---

## 9. Linkage Type Enum

모든 도시에서 동일한 enum을 사용한다.

| Enum 값 | 의미 |
|---------|------|
| `EXACT_CANONICAL_LINK` | canonical_id 필드가 not null. 직접 연결 확인. |
| `STRONG_CANONICAL_LINK` | canonical_id 확인됐으나 약한 불확실성 존재. |
| `RELATION_OR_AREA_ONLY` | 지역·구역 단위 참조. 개별 canonical 없음. |
| `EVENT_OR_TEMPORARY_CONTENT` | 이벤트·임시 콘텐츠. canonical null 가능. |
| `TRUE_NEW_PLACE_CANDIDATE` | canonical 미연결 신규 장소 후보. 실제 place 생성 없음. |
| `UNCERTAIN` | 좌표 불일치 등 검증 실패. 수동 재확인 필요. |

### 도시별 추론 규칙

**Jeonju:** `linkage_type` 필드 직접 사용 (유일하게 explicit field 존재).

**Gyeongju:** `existing_canonical_id` not null → EXACT. `new_place_candidate=True` → TRUE_NEW_PLACE_CANDIDATE. 이름에 '불국사' 포함 → UNCERTAIN. 나머지 → RELATION_OR_AREA_ONLY.

**Busan:** `existing_city_spots_id` not null → EXACT. null + 이름이 `id_linkage_summary.new_place_candidates` 리스트에 포함 → TRUE_NEW_PLACE_CANDIDATE. null + 미포함 → RELATION_OR_AREA_ONLY.

**Seoul/Jeju:** `existing_canonical_id` not null → EXACT. `id_note`에 'EVENT' 포함 → EVENT_OR_TEMPORARY_CONTENT. 나머지 → RELATION_OR_AREA_ONLY.

**RN 항목:** `existing_canonical_id` / `existing_city_spots_id` / `existing_canonical_ids[0].canonical_id` 중 not null → EXACT. `new_place_candidate=True` → TRUE_NEW_PLACE_CANDIDATE. `id_note`에 'EVENT' → EVENT_OR_TEMPORARY_CONTENT. 나머지 → RELATION_OR_AREA_ONLY.

---

## 10. 정규화 QA 결과

| 도시 | C(F+R) src | C norm | RN(F+R) src | RN norm | G src | G norm | U src | U norm | DROPPED |
|------|-----------|--------|------------|---------|-------|--------|-------|--------|---------|
| 부산 | 3+1=4 | 4 | 2+1=3 | 3 | 25 | 25 | 7 | 7 | 0 |
| 경주 | 3+1=4 | 4 | 3+2=5 | 5 | 5 | 5 | 8 | 8 | 0 |
| 서울 | 3+1=4 | 4 | 3+2=5 | 5 | 34 | 34 | 13 | 13 | 0 |
| 제주 | 3+2=5 | 5 | 3+2=5 | 5 | 8 | 8 | 12 | 12 | 0 |
| 전주 | 3+2=5 | 5 | 3+2=5 | 5 | 7 | 7 | 10 | 10 | 0 |

`SOURCE_RECORDS_DROPPED=0` / `RECOMMENDATION_RECORDS_DROPPED=0` / `PROVENANCE_DROPPED=0`

### 코스 Stop 정규화 Linkage 산술

| 도시 | STOPS_TOTAL | EXACT | REL | EVT | NEW | UNC | SUM |
|------|------------|-------|-----|-----|-----|-----|-----|
| 부산 | 43(39F+4R) | 21 | 4 | 0 | 18 | 0 | 43 ✓ |
| 경주 | 31(21F+10R) | 24 | 4 | 0 | 2 | 1 | 31 ✓ |
| 서울 | 11(11F+0R) | 1 | 10 | 0 | 0 | 0 | 11 ✓ |
| 제주 | 15(11F+4R) | 9 | 6 | 0 | 0 | 0 | 15 ✓ |
| 전주 | 18(14F+4R) | 17 | 1 | 0 | 0 | 0 | 18 ✓ |
| **합계** | **118** | **72** | **25** | **0** | **20** | **1** | **118 ✓** |

> 부산 FINAL 코스 stops 물리 수 39 vs id_linkage_summary.stops_total=30:  
> id_linkage_summary는 링키지 QA 당시 집계값(일부 transit stop 제외 가능). 정규화는 실제 JSON 물리 stops 기준.

> 경주 id_linkage_summary.total_stops_final_courses=14 vs 물리 21:  
> id_linkage_summary는 고유 장소 수 기준 집계. 정규화는 코스별 등장 수(물리) 기준.

### RN Linkage 산술

| 도시 | RN_TOTAL | EXACT | REL | EVT | NEW | SUM |
|------|---------|-------|-----|-----|-----|-----|
| 부산 | 3 | 1 | 2 | 0 | 0 | 3 ✓ |
| 경주 | 5 | 2 | 3 | 0 | 0 | 5 ✓ |
| 서울 | 5 | 2 | 2 | 1 | 0 | 5 ✓ |
| 제주 | 5 | 4 | 0 | 1 | 0 | 5 ✓ |
| 전주 | 5 | 4 | 0 | 1 | 0 | 5 ✓ |
| **합계** | **23** | **13** | **7** | **3** | **0** | **23 ✓** |

> RN은 항목 수(per-item) 기준. Jeju/Jeonju의 `existing_canonical_ids` 리스트 내 개별 canonical_id 수 기준(8/6) 아님.

---

## 11. Known Issues 보존

| KI | 도시 | 원본 Known Issue | 정규화 처리 |
|----|------|----------------|------------|
| KI-001 | 부산 | NEW_CANDIDATE 18건 미연결 | `linkage_type=TRUE_NEW_PLACE_CANDIDATE` + `quality_metadata.known_issues` |
| KI-002 | 경주 | 불국사 UNCERTAIN 1건 | reserve stop에 `linkage_type=UNCERTAIN` 적용 + known_issues 기록 |
| KI-003 | 경주 | 가이드 EN/JA/ZH=0 | `official_guides` 5건 모두 `locales=["ko"]`. 의도적 공백 유지. |
| KI-004 | 전주 | utility_count_summary.locale_ja 오타 | 정규화에서 per-item 실측값 반영(JA=7 actual). |
| KI-005 | 전주 | 남부시장 FUTURE_MERGE_REQUIRED | OFF-16084/OFF-16085 별도 entity 유지. `known_issues` 기록. |

---

## 12. 정책 준수

| 정책 | 확인 |
|------|------|
| 원본 artifact 수정 없음 | ✓ |
| 신규 place 생성 없음 | ✓ (canonical_id null → null 유지) |
| canonical 수정·삭제 없음 | ✓ |
| 실제 source에 없는 값 추론 채우기 없음 | ✓ (null 허용) |
| 링크 타입 원본 의미 변경 없음 | ✓ |
| UI/app 코드 수정 없음 | ✓ |
| DB/migration 없음 | ✓ |
| git add . / force push 없음 | ✓ |

---

## 13. 재현 방법

```bash
cd korea-mate
python3 data/regional-recommendations/normalized/normalize_regional_content.py
# Reads: data/regional-recommendations/{city}/{city}-*.json
# Writes: data/regional-recommendations/normalized/{city}-regional-content-normalized-v1.json
# Writes: data/regional-recommendations/normalized/five-city-regional-content-normalized-manifest-v1.json
```

재실행 시 동일 결과 보장 (결정론적 처리). 날짜 필드는 원본 파일 기준.

---

## 14. 사용 방법 (메인 노트북)

```python
import json

cities = ['busan', 'gyeongju', 'seoul', 'jeju', 'jeonju']
for city in cities:
    with open(f'data/regional-recommendations/normalized/{city}-regional-content-normalized-v1.json') as f:
        data = json.load(f)
    # 동일한 구조로 접근 가능 — 도시별 분기 불필요
    for course in data['recommended_courses']:
        if not course['is_reserve']:
            for stop in course['stops']:
                # stop['canonical_id'] — null 허용
                # stop['linkage_type'] — 공통 enum
                pass
    for item in data['recommended_now']:
        if not item['is_reserve']:
            # item['canonical_id'], item['linkage_type']
            pass
```

---

## 15. 다음 단계

`NEXT_RECOMMENDED_STEP=MAIN_LAPTOP_REGIONAL_CONTENT_PRODUCT_REVIEW`

메인 노트북에서 이 normalized contract를 소비하여:
1. 5개 도시 City Travel Essentials 페이지 IA 검토
2. 카드 디자인·노출 방식 결정
3. affiliate 배치 방침 결정
4. 서비스 연동 전 최종 제품 검토
