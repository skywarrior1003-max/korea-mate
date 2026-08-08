# 경주 메인 Clean Import Manifest v1

> **Candidate Branch**: `data/gyeongju-final-security-relations-handoff-v1`
> **GYEONGJU_MAIN_HANDOFF_CANDIDATE_SHA**: `1b7806c1494d0518d06cd31212b5acf6eba27817`
> **작성일**: 2026-08-08
> **Machine-readable allowlist**: `docs/data-collection/gyeongju-main-clean-import-allowlist-v1.json`

---

## 1. DATASET INVENTORY (최종 확정 수치)

| 항목 | 파일 | 수량 |
|---|---|---|
| READY places | gyeongju-final-ready-302-v1.jsonl | 302 (attraction/nature 200, restaurant 102) |
| Detailed place data | gyeongju-enriched-candidates-v1.jsonl | 831 (READY 302는 subset; candidate_id로 필터) |
| Events | gyeongju-official-events-final-v1.jsonl | 87 (ACTIVE=4, UPCOMING=4, PAST=76, DATE_INCOMPLETE=3) |
| Official courses | gyeongju-official-courses-v2.jsonl | 57 |
| Course stops (final relation) | gyeongju-official-course-place-links-final-v1.jsonl | 132 |
| Experiences | gyeongju-official-experiences-v2.jsonl | 23 |
| Applications | gyeongju-official-application-programs-final-v1.jsonl | 6 |
| Travel essential info | gyeongju-official-travel-info-v2.jsonl | 54 |
| Tour/program info | gyeongju-official-tour-program-info-v1.jsonl | 133 |
| Official food universe | gyeongju-official-food-final-relations-v1.jsonl | 292 (EXISTING=102, PROPOSAL=190) |
| AI scheduler graph | gyeongju-official-ai-scheduler-graph-final-v1.jsonl | 350 (HARD=222, SOFT=32, UNRESOLVED=96) |
| EN coverage 302 | gyeongju-final-en-coverage-302-v1.jsonl | 302 |
| Image rights 302 | gyeongju-final-image-rights-302-v1.jsonl | 302 |
| Quality tier 302 | gyeongju-final-quality-tier-v1.jsonl | 302 |
| HOLD freeze | gyeongju-final-hold-freeze-v1.jsonl | 123 |

---

## 2. MASTER_CLEAN_IMPORT_ALLOWLIST

### IMPORT_REQUIRED (메인 통합에 필수)

| # | 경로 | 유형 | 건수 | 역할 |
|---|---|---|---|---|
| 1 | `data/gyeongju-final-release/gyeongju-final-ready-302-v1.jsonl` | data | 302 | READY places JOIN key. candidate_id/category/source_tier/has_*. **summary only** |
| 2 | `data/tourapi/enriched/gyeongju/gyeongju-enriched-candidates-v1.jsonl` | data | 831 | **Full place detail**: description_ko, lat/lng, address, phone. candidate_id로 302 subset |
| 3 | `data/gyeongju-final-release/gyeongju-final-en-coverage-302-v1.jsonl` | data | 302 | EN coverage: en_coverage, has_en_title, has_en_overview |
| 4 | `data/gyeongju-final-release/gyeongju-final-image-rights-302-v1.jsonl` | data | 302 | Image rights: image_rights type, rights_note |
| 5 | `data/gyeongju-final-release/gyeongju-final-quality-tier-v1.jsonl` | data | 302 | Quality tier: TIER_A=193, TIER_B=109 |
| 6 | `data/tourapi/contracts/gyeongju/gyeongju-source-priority-matrix-v1.json` | doc | — | Source priority matrix |
| 7 | `data/gyeongju-official-travel-content/gyeongju-official-events-final-v1.jsonl` | data | 87 | Events final (full fields with dates, venue, status) |
| 8 | `data/gyeongju-official-travel-content/gyeongju-official-courses-v2.jsonl` | data | 57 | Official courses |
| 9 | `data/gyeongju-official-travel-content/gyeongju-official-course-place-links-final-v1.jsonl` | data | 132 | Course stop final relation (match_status, existing_candidate_id) |
| 10 | `data/gyeongju-official-travel-content/gyeongju-official-experiences-v2.jsonl` | data | 23 | Experiences |
| 11 | `data/gyeongju-official-travel-content/gyeongju-official-application-programs-final-v1.jsonl` | data | 6 | Applications with eligibility |
| 12 | `data/gyeongju-official-travel-content/gyeongju-official-travel-info-v2.jsonl` | data | 54 | Travel essential info |
| 13 | `data/gyeongju-official-travel-content/gyeongju-official-food-final-relations-v1.jsonl` | data | 292 | Food 292 final (EXISTING=102, PROPOSAL=190) |
| 14 | `data/gyeongju-official-travel-content/gyeongju-official-event-place-relations-v1.jsonl` | data | 87 | Event→place relation |
| 15 | `data/gyeongju-official-travel-content/gyeongju-official-experience-place-relations-v1.jsonl` | data | 23 | Experience→place relation |
| 16 | `data/gyeongju-official-travel-content/gyeongju-official-application-relations-v1.jsonl` | data | 6 | Application relation (ai_scheduler_usable) |
| 17 | `data/gyeongju-official-travel-content/gyeongju-official-ai-scheduler-graph-final-v1.jsonl` | data | 350 | **AI scheduler graph** (central AI integration file) |
| 18 | `data/gyeongju-official-travel-content/_run_metadata.json` | data | — | collection_date=2026-08-08, as_of anchor |

### IMPORT_OPTIONAL (provenance/audit/reproducibility 가치)

| 경로 | 이유 |
|---|---|
| `data/gyeongju-final-release/gyeongju-final-hold-freeze-v1.jsonl` | HOLD 123건, 향후 확장 참고 |
| `data/gyeongju-final-release/gyeongju-final-quality-metrics-v3.json` | 품질 지표 요약 |
| `data/gyeongju-final-release/gyeongju-final-set-audit-v1.json` | READY 302 Set A/B/C 무결성 감사 |
| `data/gyeongju-final-release/gyeongju-final-closeout-summary-v1.json` | 최종 상태 요약 |
| `data/gyeongju-official-travel-content/gyeongju-official-course-linkage-final-v1.json` | stop 분포 요약 |
| `data/gyeongju-official-travel-content/gyeongju-official-final-closeout-qa-v1.json` | 최종 QA PASS 기록 |
| `data/gyeongju-official-travel-content/gyeongju-official-food-completeness-v1.json` | food 수집 완전성 기록 |
| `data/gyeongju-official-travel-content/gyeongju-official-event-status-audit-v1.json` | event 상태 분포 감사 |
| `data/gyeongju-official-travel-content/gyeongju-security-sanitizer-qa-v1.json` | 보안 sanitizer QA |
| `data/gyeongju-official-travel-content/gyeongju-github-alert-closeout-v1.json` | GitHub alert 종료 기록 |
| `data/gyeongju-official-travel-content/gyeongju-official-ai-scheduler-features-v2.jsonl` | AI seed 65건 |
| `data/gyeongju-official-travel-content/gyeongju-official-tour-program-info-v1.jsonl` | tour program info 133건 |
| `data/tourapi/contracts/gyeongju/gyeongju-culture-tourism-source-contract-v2.json` | KTO API contract v2 |
| `data/gyeongju-official-travel-content/gyeongju-official-image-provenance-v2.jsonl` | 이미지 provenance 1814건 |
| `docs/data-collection/gyeongju-final-main-handoff-v2.md` | Handoff 문서 v2 |
| `docs/data-collection/gyeongju-collection-lessons-v1.md` | 수집 교훈 |
| `docs/data-collection/common-city-collection-rules-v1.md` | 공통 도시 규칙 |
| `scripts/gyeongju_final_relations_handoff_v1.py` | relations 스크립트 (재현성) |
| `scripts/gyeongju_secure_content_gap_fill_v1.py` | gap fill 스크립트 (재현성) |

### DO_NOT_IMPORT (가져오지 말 것)

| 경로 | 이유 |
|---|---|
| `data/gyeongju-official-travel-content/_cache/` | Raw HTML 358개 (sanitized 포함). 내용 가치 없음 |
| `data/gyeongju-official-travel-content/gyeongju-official-course-place-links-v1.jsonl` | 중간 결과 (MANUAL_REVIEW 미해소). -final-v1로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-course-stops-v2.jsonl` | 중간 결과. -place-links-final로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-events-v2.jsonl` | 중간 결과. events-final로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-application-programs-v2.jsonl` | 중간 결과. -final-v1로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-content-place-relations-v2.jsonl` | 중간 결과 (0 relations). final 파일들로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-content-qa-v2.json` | 중간 QA. closeout-qa로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-content-summary-v2.json` | 중간 요약. closeout summary로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-course-linkage-summary-v1.json` | 중간 linkage summary. final로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-final-gap-summary-v1.json` | 내부 debug 산출물 |
| `data/gyeongju-official-travel-content/gyeongju-official-final-qa-v1.json` | closeout-qa로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-food-place-links-v1.jsonl` | 중간 food links. food-final-relations로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-food-recommendations-v2.jsonl` | V2 식당 목록 (20건). food-full/food-final로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-menu-inventory-v2.json` | 내부 메뉴 탐색 artifact |
| `data/gyeongju-official-travel-content/gyeongju-official-new-place-proposals-v2.jsonl` | V2 proposals (20건). food-final-relations (190건)으로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-tour-programs-v2.jsonl` | 중간 결과. tour-program-info-v1로 대체 |
| `data/gyeongju-official-travel-content/gyeongju-official-ai-scheduler-relations-final-v1.jsonl` | V1 AI relations (188건). graph-final (350건)으로 대체 |
| `data/gyeongju-final-release/gyeongju-final-busan-gap-check-v1.json` | 내부 프로세스 파일. BUSAN용 |
| `data/gyeongju-final-release/gyeongju-final-location-routing-v1.json` | 내부 라우팅 체크 |
| `data/gyeongju-final-release/gyeongju-final-common-rules-check-v1.json` | 내부 규칙 체크 |
| `data/gyeongju-final-release/gyeongju-main-laptop-handoff-v1.md` | v1 문서. gyeongju-final-main-handoff-v2.md로 대체 |
| `data/tourapi/gyeongju/web-raw-v3/` | 원본 웹 크롤 데이터. source artifact |
| `data/tourapi/candidates/gyeongju/gyeongju-source-facts-v1.jsonl` | 정규화 전 source facts. enriched-candidates 사용 |

---

## 3. SCHEMA SUMMARY

### READY 302 Places (2-file join)

**File 1: `gyeongju-final-ready-302-v1.jsonl`** (index)
```
candidate_id   string  NOT NULL  FACT  stable identity key (gyeongju-GJxx-xxxx, gyeongju-KTO12-xxxxx)
name_ko        string  NOT NULL  FACT  Korean name
category       string  NOT NULL  FACT  "attraction" | "restaurant"
source_tier    string  NOT NULL  DERIVED  "CORE27" | "TIER_A" | "TIER_B" | "KTO_RECOVERY" | ...
source_set     string  NOT NULL  DERIVED  "SET_A" | "SET_B" | "SET_C"
has_description bool   NOT NULL  SNAPSHOT
has_address    bool    NOT NULL  SNAPSHOT
has_coords     bool    NOT NULL  SNAPSHOT
has_images     bool    NOT NULL  SNAPSHOT
as_of          string  NOT NULL  SNAPSHOT  collection_date anchor
```

**File 2: `gyeongju-enriched-candidates-v1.jsonl`** (detail — filter by candidate_id)
```
candidate_id   string  NOT NULL  FACT   join key
title_ko       string  NULLABLE  FACT   Korean title (alternative to name_ko)
title_en       string  NULLABLE  FACT   English title if available
category       string  NOT NULL  FACT
address        string  NULLABLE  FACT
lat            float   NULLABLE  FACT   WGS84
lng            float   NULLABLE  FACT   WGS84
description_ko string  NULLABLE  FACT   only 108/831 have value
image_url      string  NULLABLE  FACT   single image URL
phone          string  NULLABLE  FACT
official_url   string  NULLABLE  FACT
opening_hours  string  NULLABLE  FACT
admission      string  NULLABLE  FACT
provenance     object  NOT NULL  DERIVED  source attribution
```

⚠️ **중요**: description_ko는 302 READY 중 일부만 보유. EN field (title_en 등)은 별도 en-coverage 파일.
⚠️ **중요**: image_url은 단일 URL만. 다중 이미지는 image-rights 파일의 has_images=True 참고.

### Events (gyeongju-official-events-final-v1.jsonl)
```
event_id       string  FACT    unique ID
title          string  FACT    행사명
category       string  FACT    행사 분류
start_date     string  FACT    "YYYY-MM-DD" | "" if DATE_INCOMPLETE
end_date       string  FACT    "YYYY-MM-DD" | ""
venue          string  FACT    행사 장소 (자유 텍스트)
address        string  FACT    주소
description    string  FACT    설명
status         string  SNAPSHOT ACTIVE|UPCOMING|PAST|DATE_INCOMPLETE
poster_image   string  FACT
provenance     object  DERIVED  source attribution
```

### Course Stop Relations (gyeongju-official-course-place-links-final-v1.jsonl)
```
course_id              string  FACT
order                  int     FACT    공식 순서 (0-based; origin preserved)
day                    string  FACT    방문 일차 if multi-day
stop_name              string  FACT    공식 원문 이름
description            string  FACT    정류 설명
existing_candidate_id  string  NULLABLE RELATION  null if MANUAL_REVIEW_FINAL/NON_PLACE/TEMPORAL
match_status           string  DERIVED  EXACT|HIGH_CONFIDENCE|RELATED_ENTITY|GROUP|TEMPORAL|NON_PLACE|PROPOSAL|MANUAL_FINAL
match_evidence         string  DERIVED  근거 설명
```

### AI Scheduler Graph (gyeongju-official-ai-scheduler-graph-final-v1.jsonl)
```
graph_type             string  DERIVED  COURSE_STOP_PLACE|EVENT_PLACE|EXPERIENCE_PLACE|APPLICATION_PROGRAM|FOOD_PLACE
source_id / source_name string FACT    원천 entity ID
target_candidate_id    string  NULLABLE RELATION  READY 302 candidate_id
confidence             string  DERIVED  HARD|SOFT|UNRESOLVED
match_status / relation_type string DERIVED
```

### Food (gyeongju-official-food-final-relations-v1.jsonl)
```
food_name     string  FACT   공식 음식 목록 원문 이름
link_status   string  DERIVED EXISTING_RESTAURANT_LINK|NEW_PLACE_PROPOSAL
candidate_id  string  NULLABLE RELATION  EXISTING only; null for proposals
address       string  FACT   (proposals: has value for all 190)
phone         string  FACT
hours         string  FACT
image         string  FACT
official_source_mnu string FACT  provenance (gyeongju.go.kr mnu_uid)
provenance    object  DERIVED
```

---

## 4. city_spots 호환성

| Field | 분류 | 비고 |
|---|---|---|
| candidate_id → spot_id | TRANSFORM | naming convention 정렬 필요 |
| name_ko | DIRECT | |
| category (attraction/restaurant) | DIRECT | |
| lat, lng | DIRECT | WGS84 |
| address | DIRECT | |
| description_ko | DIRECT | 일부 places만 보유 |
| title_en | TRANSFORM | EN field 통합 필요 |
| image_url | TRANSFORM | 다중 이미지 통합 필요 |
| phone | DIRECT | |
| opening_hours | DIRECT | |
| admission | DIRECT | |
| quality_tier | NO_CURRENT_SLOT | TIER_A/B — city_spots에 현재 slot 없음 |
| source_tier, source_set | NO_CURRENT_SLOT | 내부 분류; DB 컬럼 없음 |
| image_rights (KTO Type1/Type3/VG_OFFICIAL) | NO_CURRENT_SLOT | 권리 정보 컬럼 없음 |
| event data (87건) | DO_NOT_PUT_IN_CITY_SPOTS | 별도 테이블/구조 필요 |
| course/stop relations (57/132) | DO_NOT_PUT_IN_CITY_SPOTS | 별도 itinerary 구조 |
| AI scheduler graph (350) | DO_NOT_PUT_IN_CITY_SPOTS | 별도 relation 테이블 |
| food proposals (190) | DO_NOT_PUT_IN_CITY_SPOTS | READY가 아님 |
| HOLD places (123) | DO_NOT_PUT_IN_CITY_SPOTS | READY 아님 |

---

## 5. PROVENANCE CONTRACT

| Provenance 유형 | 설명 | source 표시 |
|---|---|---|
| OFFICIAL_KOREAN_FACT | gyeongju.go.kr/tour 공식 관광사이트 직접 수집 | provenance.source = "gyeongju.go.kr/tour" |
| KTO_FACT | KTO KorService2 API (areaCode=35, sigunguCode=2) | provenance.source = "KTO_KorService2" |
| VISITGYEONGJU_FACT | visitgyeongju.com VG 공식 페이지 | provenance.source = "VG" |
| DERIVED_INTERNAL | relation match, classification, status 판정 | match_evidence 필드 |
| MANUAL_REVIEWED_RELATION | 사람이 직접 검토한 연결 | match_status in final file |
| SNAPSHOT_STATUS | 수집 시점 상태 (event status 등) | as_of or collection_date |
| GENERATED_TRANSLATED | 0건 — 경주 데이터에 없음 | — |

**공식 EN vs Generated 구분**:
- EN data (en_coverage 파일) = KTO EngService2 API 공식 영문 (OFFICIAL_EN_FACT)
- Generated/translated EN = 0건 (경주 데이터에 없음)
- EN_SOURCE_MISSING (97건) + EN_NOT_COLLECTED (67건) = 미수집. generated로 보완 금지.

---

## 6. RIGHTS / IMAGE CONTRACT

| Source | Image Rights | Rights Evidence |
|---|---|---|
| gyeongju.go.kr/tour | VG_OFFICIAL_PUBLIC (133건) | 공공누리 제1유형 KOGL1 |
| gyeongju.go.kr/tour (restaurants) | VG_RESTAURANT_OFFICIAL (102건) | 공공누리 제1유형 |
| KTO detailImage2 Type1 | Type1 (27건) | cpyrhtDivCd=Type1 (상업이용O/변경O) |
| KTO detailImage2 Type3 | Type3 (36건) | cpyrhtDivCd=Type3 (상업이용O/변경X) |
| 감포항, 강동워터파크 | IMAGE_RIGHTS_CLEARED (2건) | 공공데이터포털 제한없음 |
| 일부 KTO 이미지 | KTO_TYPE_UNKNOWN (2건) | cpyrhtDivCd 미확인 |

⚠️ 중요:
- 이 표는 현재 파일에 **기록된 evidence만** 정리한 것
- 새로운 법적 판단 또는 "전면 허용" 결론 아님
- Source A 권리가 external linked source B로 자동 상속 금지
- KTO_TYPE_UNKNOWN (2건) = RIGHTS_UNKNOWN — 확인 전 미사용 권고
- Long description (KTO overview): KTO API contract에 따라 EXPLICITLY_ALLOWED_BY_SOURCE_CONTRACT
- VisitGyeongju VG description: 공공누리 제1유형 KOGL1 (공개 관광사이트)

---

## 7. AI SCHEDULER CONTRACT

### Relation Graph 350

```
hard=222  → official evidence 기반 확정 연결 (EXACT match, AT_PLACE with ID)
soft=32   → 지역/구역/관련 연결 (IN_AREA, NEAR_PLACE, GROUP_ENTITY)
unresolved=96 → MANUAL_REVIEW_FINAL, VENUE_NOT_IN_SET, NON_PLACE, TEMPORAL
```

**소비 규칙**:
- HARD relation: event/course/place 일정에 직접 사용 가능
- SOFT relation: 낮은 가중치; 지역 힌트로만 사용
- UNRESOLVED: 일정 사실처럼 소비 금지

### Course 57 / Stop 132 AI 사용 원칙

공식 course = AI itinerary **SEED / REFERENCE**

- 공식 course가 사용자 pick보다 우선하지 않음
- **USER PICKS FIRST** (GoKoreaMate 기본 원칙)
- 공식 course는 자연스러운 stop 순서, 지역/동선 힌트, 공식 추천 조합을 제공하는 reference

Stop 최종 분포:
- EXACT=83, HIGH_CONF=12, GROUP=3, TEMPORAL=3, NON_PLACE=6, RELATED=8, PROPOSAL=3, MANUAL_FINAL=14

### Application AI 사용

AI scheduler에서 직접 사용 가능 (`ai_scheduler_usable=True`) 2건:

| Program ID | 이름 | 장소 | 근거 |
|---|---|---|---|
| `21010bf80dda68` | 신라대종타종체험신청 | gyeongju-GJ01-0029 | GENERAL_TRAVELER_USABLE (공식 페이지 명시) |
| `0c50a9c912d680` | 스탬프투어 기념품 신청 | — | GENERAL_TRAVELER_USABLE |

나머지 4건 = ELIGIBILITY_REVIEW → 외국인 이용 가능 여부 공식 확인 필요

---

## 8. TEMPORAL CONTRACT

**분리 보장**:
- `start_date` / `end_date`: 공식 행사 일자 (YYYY-MM-DD, "" if DATE_INCOMPLETE)
- `status`: 수집 시점 snapshot (ACTIVE/UPCOMING/PAST/DATE_INCOMPLETE)
- `as_of` / `collection_date`: 2026-08-08 (재계산 기준점)

**DATE_INCOMPLETE 3건**: 임의 보완 금지. 공식 확인 전 AI 일정에 사용 금지.

서비스 시점에 status 재계산: `canonical start_date/end_date` 기준으로 가능 (DATE_INCOMPLETE 제외).

---

## 9. FOOD 190 PROPOSALS 상태

| 필드 | 가용 여부 | 비고 |
|---|---|---|
| food_name | ✅ 190건 | 공식 음식 목록 원문 |
| address | ✅ 190건 | gyeongju.go.kr 음식 목록 주소 |
| phone | ✅ 일부 | 목록 페이지 기준 |
| hours | ✅ 일부 | |
| image | ✅ 일부 | |
| provenance | ✅ 전건 | official_source_mnu |
| lat/lng | ❌ 없음 | 좌표 미수집 (JS-only 페이지에서 address만 추출) |
| READY 승격 여부 | ❌ | 이번 TASK 범위 아님. MAIN_DECISION |

---

## 10. UNRESOLVED / MANUAL_FINAL 목록

**Course stops MANUAL_REVIEW_FINAL (14건)**:
문정헌, 쪽샘유적발굴관, 경북천년숲정원, 보문콜로세움, 물향내쉼터,
동천동마애삼존불좌상, 용강동고분, 거마장 마을, 서악동3층석탑,
황복사지3층석탑, 쪽샘고분공원, 종오정, 코스믹 리조트, 관광역사공원

이유: 302 미포함 소규모 유산/시설/마을; 302 확장 시 자동 연결 가능.

**Event VENUE_NOT_IN_PLACE_SET (60건)**:
공연장(경주예술의전당 등) 또는 venue 텍스트가 특정 place와 직접 매칭 불가.
relation_type은 부여됨; 일정 사실로 소비 금지.

---

## 11. FACT / DERIVED / UNKNOWN 구분 가능 여부

| 상태 | 구분 가능 | 확인 방법 |
|---|---|---|
| FACT | ✅ | provenance 필드 + source_priority_matrix |
| DERIVED | ✅ | match_status, match_evidence, relation_type 필드 |
| SNAPSHOT | ✅ | as_of + status 필드 |
| UNKNOWN | ✅ | MANUAL_REVIEW_FINAL, ELIGIBILITY_REVIEW, DATE_INCOMPLETE, RIGHTS_UNKNOWN 등 |
| GENERATED | 해당 없음 | 0건 |

구분 불가능한 영역: **없음** (현재 schema에서 전체 구분 가능).

---

## 12. SECURITY FINAL GATE

| 항목 | 결과 |
|---|---|
| Google API key candidates (non-cache) | 0 |
| AWS-like credentials | 0 |
| OAuth/bearer token | 0 |
| Slack token | 0 |
| JWT/private key | 0 |
| Raw YouTube credential | 0 |
| Video binary dataset | 0 |
| Playlist API dataset | 0 |
| GitHub Secret Alert | CLOSED (Dismissed / Won't fix) |
| Cache sanitized files | 3 (AIza* → [REDACTED_THIRD_PARTY_GOOGLE_API_KEY]) |
| Official video policy | LINK_ONLY_REFERENCE |

---

## 13. OLD HISTORY / CLEAN IMPORT CONTRACT

**핵심 원칙**:

ancestor commit `c7bcfbe`를 포함한 data branch를 master에 일반 merge 또는 PR merge **금지**.

**기술적 이유**:
- merge / PR merge → old branch ancestry가 master history에 포함됨
- cherry-pick → 개별 commit의 parent ancestry를 master에 연결하지 않음
- 단, 이번 handoff는 여러 누적 commit의 최종 tree 상태가 중요하므로 단일 cherry-pick 방식 사용하지 않음

**권장 clean import 방법**:

```bash
# 1. master에서 안전하게 특정 파일 내용만 가져오기
git restore --source=1b7806c1494d0518d06cd31212b5acf6eba27817 -- \
  data/gyeongju-final-release/gyeongju-final-ready-302-v1.jsonl \
  data/tourapi/enriched/gyeongju/gyeongju-enriched-candidates-v1.jsonl \
  data/gyeongju-official-travel-content/gyeongju-official-events-final-v1.jsonl \
  # ... (allowlist-v1.json의 import_required 경로 전체)

# 2. IMPORT_REQUIRED 파일만 master에서 커밋
git add [explicit-paths-only]
git commit -m "feat(gyeongju): import clean handoff package from 1b7806c"
```

**절대 금지**:
- `git merge data/gyeongju-final-security-relations-handoff-v1`
- PR merge (GitHub UI)
- force push
- history rewrite / rebase
- `git add .` / `git add -A`

---

## 14. COMMON CITY RULES 검증

문서: `docs/data-collection/common-city-collection-rules-v1.md`

| 규칙 | 분류 | 포함 여부 |
|---|---|---|
| inventory-first | COMMON | ✅ |
| official source priority | COMMON | ✅ |
| BYTE_IDENTICAL | COMMON | ✅ |
| BYTE_IDENTICAL ≠ completeness | COMMON | ✅ |
| secret sanitizer / raw persistence | COMMON | ✅ (§10) |
| official video link-only | COMMON | ✅ (§10) |
| food pagination form/XHR first | COMMON | ✅ (§11) |
| temporal as_of | COMMON | ✅ (§12) |
| relation confidence | COMMON | ✅ (§13) |
| AI itinerary seed | COMMON | ✅ (§13) |
| charset detection | COMMON | ✅ |
| smoke-before-bulk | COMMON | ✅ |
| KTO HTTP400 request-contract classification | GYEONGJU_SPECIFIC | ✅ (§7-4) |
| KTO KorService2 parameter list | GYEONGJU_SPECIFIC | ✅ |
| mnu_uid pagination | GYEONGJU_SPECIFIC | ✅ (§11) |
| NOT_COLLECTED vs FIELD_MISSING 구분 | COMMON | ⚠️ 명시적 용어 없음 → SHOULD_IMPROVE |
| provenance 명시적 정의 | COMMON | ⚠️ 개념은 있으나 정의 없음 → SHOULD_IMPROVE |
| identity semantic safety | COMMON | ⚠️ 개념은 있으나 §14 체크리스트에만 → SHOULD_IMPROVE |

경주 특화 규칙을 부산/서울/제주에 무조건 강제하지 않는다.

---

## 15. 책임 분류

### MUST_FIX_AUX

없음. 현재 tree에 메인 clean import를 블로킹하는 실제 결함 없음.

### SHOULD_IMPROVE_AUX

1. **common-city-collection-rules-v1.md**: NOT_COLLECTED vs FIELD_MISSING 명시적 용어 정의 추가 권장
2. **common-city-collection-rules-v1.md**: provenance 유형 정의 섹션 추가 권장 (OFFICIAL_FACT vs DERIVED vs SNAPSHOT)
3. **Food proposals 190건**: lat/lng 미수집. 향후 geocoding/공식 좌표 확인 필요 (이번 TASK 범위 아님)
4. **EN coverage**: EN_READY=11만 완전. 나머지 164건(SOURCE_MISSING+NOT_COLLECTED)은 실질적인 EN expansion task 필요

### MAIN_DECISION

1. **Full place 재구성 방법**: READY 302의 full record는 `gyeongju-final-ready-302-v1.jsonl`(index) + `gyeongju-enriched-candidates-v1.jsonl`(detail)을 candidate_id로 JOIN해야 함. JOIN 방식, missing field 처리, city_spots DB schema 매핑은 메인이 결정.
2. **quality_tier, image_rights, en_coverage**: 현재 별도 JSONL 파일. DB 컬럼 추가 여부 메인 결정.
3. **food proposals 190건 승격**: NEW_PLACE_PROPOSAL → READY 승격 여부 메인 결정.
4. **event 60건 VENUE_NOT_IN_PLACE_SET**: AI scheduler에서 어떻게 처리할지 메인 결정.
5. **EN expansion**: EN_SOURCE_MISSING 97건 + EN_NOT_COLLECTED 67건 대응 전략 메인 결정.

### MAIN_IMPLEMENTATION

1. city_spots DB에 READY 302 import (git restore → explicit paths)
2. candidate_id JOIN 로직 구현
3. Event/Course/Experience 별도 DB 구조 설계 및 import
4. AI scheduler relation graph 소비 로직 구현
5. image 다중 URL → DB 연결 구현 (단일 image_url만 있음; 다중은 image-provenance 파일 참조)

---

## 16. ALLOWLIST MACHINE QA

| 항목 | 결과 |
|---|---|
| A. 모든 IMPORT_REQUIRED path 존재 | PASS (18/18) |
| B. category 중복 path | PASS (0건) |
| C. IMPORT_REQUIRED 내 _cache | PASS (0건) |
| D. IMPORT_REQUIRED 내 *.html.raw | PASS (0건) |
| E. IMPORT_REQUIRED 내 raw API dump | PASS (0건) |
| F. IMPORT_REQUIRED 내 secret candidate | PASS (0건) |
| G. IMPORT_REQUIRED 내 debug/temp | PASS (0건) |
| H. IMPORT_OPTIONAL path 전체 존재 | PASS (19/19) |
| **ALLOWLIST_QA_PASS** | **PASS** |

---

*파일 경로: `docs/data-collection/gyeongju-main-clean-import-manifest-v1.md`*
*Machine-readable: `docs/data-collection/gyeongju-main-clean-import-allowlist-v1.json`*
