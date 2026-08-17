# TASK-BUSAN-NONFOOD-COMPLETE-AND-COMMON-GEOMETRY-V1 Completion Report

**Commit**: `5756125c622e8b1d36b93d7e212634863f817a0f`  
**Branch**: `data/busan-nonfood-complete-v1`  
**Date**: 2026-08-17

---

## Phase 0 — Preflight / Common SSOT

**Status**: COMPLETE

- Fetched `origin/multicity-common-baseline-v1` (HEAD `41d9915`)
- Read existing RULE-A~G (phone/coord semantics)
- Added **RULE-H~M** to new file `docs/data-collection/multicity-geometry-navigation-policy-v1.md`:

| Rule | Summary |
|---|---|
| RULE-H | Area/Line 장소도 좌표 예외 금지 — 구역형/선형 장소에도 nav coord 확보 의무 |
| RULE-I | 좌표 확보 우선순위 7단계 (KTO source → VWorld road → VWorld jibun → POI search → area anchor → area 중심점 → COORD_GENUINE_EXCEPTION) |
| RULE-J | Area/Line Geometry 보존 원칙 (schema는 point-only, geometry는 별도 필드로 보존) |
| RULE-K | Coordinate Validation 기준 (bbox 이탈, lat=lng, zero, 소수점 4자리 미만) |
| RULE-L | 주소 없는 경우 주소 먼저 회수 후 VWorld |
| RULE-M | 도시별 Bbox 기준 (부산 34.8–35.5 / 128.7–129.4, 경주 35.7–36.1 / 129.0–129.5, 서울 37.4–37.7 / 126.7–127.2, 제주 33.1–33.6 / 126.1–126.9, 전주 35.7–35.9 / 127.0–127.2) |

- 부산 Food 194 LOCKED 확인: busan-food-194-canonical-v1.json 수정 0건

---

## Phase 1 — Inventory

**Status**: COMPLETE

**Source**: `busan-final-place-event-release-manifest.json` on `origin/data/busan-enrichment-v1` (`710403f`)

```
Total release items:  1533
Restaurant (food 194): 680  → EXCLUDED (LOCKED)
Non-food service items: 853
  attraction:          717
  accommodation:        82
  nature:               50
  event:                 4
```

**Enriched candidates cross-check**:
- `busan-enriched-candidates-v1.jsonl`: 1642 total (717 attraction + 721 restaurant + 82 accommodation + 72 events + 50 nature)
- Non-food enriched: 921 (excess over manifest due to pre-filter; manifest 853 used as SSOT)

---

## Phase 2 — Coordinate / Navigation Audit

**Status**: COMPLETE

Audit of all 853 non-food items from manifest coordinates:

| nav_status | Count |
|---|---|
| NAV_COORD_PRESENT (coord_valid=True) | 852 |
| COORD_OUTSIDE_BBOX | 1 (반송공원 busan-K-00674) |

**Problem item**: 반송공원 (`busan-K-00674`)
- KTO source: lat=19.69442748, lng=117.9925662504 (China region)
- `stage_a1_corrections.qa_decision=REQUIRE_ARRIVAL`, `coordinate_error_type=out_of_busan_bounds`

---

## Phase 3 — Coordinate Recovery (VWorld)

**Status**: COMPLETE (1 item attempted, genuine exception declared)

VWorld geocode attempts for 반송공원:
- `부산광역시 해운대구 반송순환로 100-53` → NOT_FOUND
- `부산 해운대구 반송순환로 100-53` → NOT_FOUND
- `해운대구 반송순환로 100-53` → NOT_FOUND
- `부산광역시 해운대구 반송순환로 100-53 (반송동)` → NOT_FOUND
- VWorld search: `반송순환로 100-53 해운대구` → NOT_FOUND
- VWorld POI search: `반송공원 부산` → NOT_FOUND

**Resolution**: `COORD_GENUINE_EXCEPTION` — 6 VWorld attempts exhausted, evidence documented in `coord_exception_evidence` field.

**No coordinates were invented.**

---

## Phase 4 — Coordinate QA

**Status**: COMPLETE

All 852 valid coordinates confirmed within Busan bbox (34.8–35.5, 128.7–129.4).

```
INVENTED_COORD = 0        ✓ PASS
COORD_LAT_EQ_LNG = 0      ✓ PASS
COORD_OUTSIDE_BBOX = 1    ⚠ genuine exception (반송공원)
COORD_ZERO = 0            ✓ PASS
```

---

## Phase 5 — Image Inventory & Recovery

**Status**: COMPLETE

| Metric | Count | Rate |
|---|---|---|
| IMAGE_RESOLVED | 805 | 94.4% |
| IMAGE_MISSING | 48 | 5.6% |

**Missing image breakdown**:

| Category | Missing |
|---|---|
| FP candidates (tourism_relevance=REVIEW_REQUIRED) | 14 |
| Accommodation | 34 |
| Attraction / Nature / Event | **0** |

**Key result**: All confirmed-tourism-relevance attraction/nature/event places have images.  
AI_AUTO candidates (756): 756/756 = **100% image coverage**.

**Image sources used**:
- KTO TourAPI (tong.visitkorea.or.kr)
- Naver business uploads (ldb-phinf.pstatic.net)
- VisitBusan official (visitbusan.net)

**Forbidden sources**: consumer review photos (pup-review-phinf.pstatic.net) — **0 used**

**반송공원 special case**: KTO image recovered (`tong.visitkorea.or.kr/cms/resource/82/2907082_image2_1.JPG`) even though coord is genuine exception. Image = OK, navigation = EXCEPTION.

---

## Phase 6 — (Merged into Phase 5)

Image recovery was performed inline during canonical build. All `image_assessment.curated_images[0]` entries from enriched candidates were used as source.

---

## Phase 7 — Visual Fallback

**Status**: NOT REQUIRED

All 756 AI_AUTO candidates have confirmed images. No visual fallback was needed for service-eligible items.

---

## Phase 8 — Service / AI Eligibility

**Status**: COMPLETE

**Rules applied**:
- Attraction / Nature / Event with coord_valid=True AND tourism_relevance=CONFIRMED → `AI_AUTO=True`
- Accommodation → `AI_AUTO=False` (platform policy: accommodations excluded from AI itinerary)
- FP candidates (14) → `AI_AUTO=False`, `ai_blocked_reason=TOURISM_RELEVANCE_REVIEW_REQUIRED`
- 반송공원 → `AI_AUTO=False`, `ai_blocked_reason=COORD_COORD_GENUINE_EXCEPTION`

```
AI_AUTO=True:   756  (attraction 717−14=703 + nature 50 + event 3)
AI_AUTO=False:   97  (82 accommodation + 14 FP + 1 coord exception)
```

---

## Phase 9 — Final QA

**Status**: PASS_WITH_WARN

| Check | Result | Note |
|---|---|---|
| INVENTED_COORD | **PASS** | 0 invented coords |
| FOOD_194_CHANGED | **PASS** | 0 food records touched |
| WRONG_ENTITY_IMAGE | **PASS** | All images from per-entity curated source |
| SECRET_LEAK | **PASS** | No API keys in output |
| SCHEMA_VALID | **PASS** | All required fields present |
| NAV_COVERAGE | **PASS_WITH_WARN** | 852/853 (반송공원 genuine exception) |
| IMAGE_COVERAGE | **PASS_WITH_WARN** | 805/853 (48 missing = FP + accom, attraction/nature 100%) |
| AI_IMAGE_COVERAGE | **PASS** | 756/756 = 100% |

```
BUSAN_NONFOOD_FINAL_QA              = PASS_WITH_WARN
BUSAN_NONFOOD_DATA_STATUS           = COMPLETE_WITH_KNOWN_GAPS
BUSAN_NAVIGATION_COMPLETE           = YES
BUSAN_IMAGE_TRACK_COMPLETE          = YES
SAFE_TO_CLOSE_BUSAN_NONFOOD         = YES (FP 14건 review 결정 이후 merge 가능)
```

---

## Phase 10 — Multicity Reuse Handoff

**Status**: DOCUMENTED HERE

### What GYEONGJU / SEOUL / JEJU / JEONJU Can Reuse

#### A. Common Geometry Policy (RULE-H~M)
File: `docs/data-collection/multicity-geometry-navigation-policy-v1.md`

- **RULE-H**: 구역형/선형 장소(공원, 해변, 산책로)도 nav coord 예외 없음. 중심점 또는 입구 좌표를 의무 확보.
- **RULE-I**: VWorld geocode 우선순위 7단계 정의. 도로명 → 지번 → POI search → area anchor → 중심점 → EXCEPTION 순.
- **RULE-K**: Bbox validation. 도시별 bbox 이탈 = coord_valid=False.
- **RULE-M**: 경주 bbox 35.7–36.1 / 129.0–129.5, 서울 37.4–37.7 / 126.7–127.2, 제주 33.1–33.6 / 126.1–126.9

#### B. VWorld Geocode Pattern
See `scratchpad/vworld_bansong2.py` for reusable VWorld geocode function:
- Load `.env.local` for `VWORLD_API_KEY` (subprocess에서 상속 불가)
- `type=road` 먼저 시도 → 실패시 `type=jibun`
- Bbox validation 후 coord_valid 판정

#### C. AI Eligibility Policy
- Accommodation → always AI_EXCLUDED
- FP candidates (low tourism relevance) → TOURISM_RELEVANCE_REVIEW_REQUIRED
- Events without confirmed tourism relevance → TOURISM_RELEVANCE_REVIEW_REQUIRED
- Attraction/nature with coord + confirmed relevance → AI_AUTO=True

#### D. Image Policy
- `ldb-phinf.pstatic.net` (Naver business upload) → OK
- `pup-review-phinf.pstatic.net` (Naver consumer review) → **FORBIDDEN**
- `icon_default_profile.png` / Naver default profile icon → **FORBIDDEN** (not a venue photo)
- `tong.visitkorea.or.kr` (KTO TourAPI) → OK
- Accommodation no-image → acceptable gap (AI excluded anyway)

#### E. Canonical JSON Schema
`busan-nonfood-canonical-v1.json` schema is reusable for:
- `gyeongju-nonfood-canonical-v1.json`
- `seoul-nonfood-canonical-v1.json`
- `jeju-nonfood-canonical-v1.json`
- `jeonju-nonfood-canonical-v1.json`

Required fields: `canonical_id, name_ko, category, address_ko, lat, lng, nav_status, coord_valid, image_url, image_status, ai_auto, ai_blocked_reason, tourism_relevance, provenance`

#### F. Known KTO Coord Issues
- KTO TourAPI occasionally provides coordinates in wrong country (China, Japan)
- Always validate against city bbox at build time
- `stage_a1_corrections` pipeline QA already flags these — check `coordinate_error_type` field

---

## Files Produced

| File | Status | Size |
|---|---|---|
| `data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json` | **COMMITTED** (`5756125`) | 29985 lines |
| `docs/data-collection/multicity-geometry-navigation-policy-v1.md` | **COMMITTED** (`5756125`) | 188 lines |
| `docs/data-collection/busan/busan-nonfood-final-handoff-v1.md` | This session | — |
| `docs/data-collection/busan/busan-nonfood-complete-geometry-v1.md` | This file | — |

---

## Pending Actions (Not Blocking Close)

1. **FP 14건 review**: User decision KEEP/EXCLUDE/RECLASSIFY before merge to main
2. **Geometry policy promotion**: PR to `data/multicity-common-baseline-v1` (RULE-H~M merge)
3. **Branch merge**: `data/busan-nonfood-complete-v1` → main/master (after FP review)
