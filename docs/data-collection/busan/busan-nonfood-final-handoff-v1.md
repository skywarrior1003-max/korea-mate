# Busan Non-Food Final Handoff v1

**Task**: TASK-BUSAN-NONFOOD-COMPLETE-AND-COMMON-GEOMETRY-V1  
**Commit**: `5756125c622e8b1d36b93d7e212634863f817a0f`  
**Branch**: `data/busan-nonfood-complete-v1`  
**Date**: 2026-08-17  
**Status**: PHASE 0~5 COMPLETE — Phase 9 (Final QA) PASS_WITH_WARN

---

## 1. Canonical File

| Field | Value |
|---|---|
| **File** | `data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json` |
| **SHA256** | `8e314bda06e5ca92a681793375d52bc4f00bd9851dfb8dae46c4231888386537` |
| **Schema version** | `busan-nonfood-canonical-v1` |
| **Source branch** | `origin/data/busan-enrichment-v1` (`710403f`) |
| **Total records** | **853** |

> **Note**: `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json` (SHA `3def785c...`) is LOCKED — zero records modified by this task.

---

## 2. Service Universe

```
attraction  717
accommodation  82
nature       50
event         4
─────────────────
TOTAL       853
```

Source: `busan-final-place-event-release-manifest.json` on `origin/data/busan-enrichment-v1`.  
Excludes all 194 `restaurant` category items (handled by food-194 task, locked).

---

## 3. Navigation / Coordinate Coverage

| Metric | Count | Rate |
|---|---|---|
| NAV_READY (coord_valid=True) | 852 | 99.9% |
| COORD_GENUINE_EXCEPTION | 1 | 0.1% |

### Genuine Exception: 반송공원 (`busan-K-00674`)

| Field | Value |
|---|---|
| KTO source coord | lat=19.69442748, lng=117.9925662504 |
| Issue | Outside Busan bbox (34.8–35.5, 128.7–129.4) — China region |
| Address | 부산광역시 해운대구 반송순환로 100-53 (반송동) |
| VWorld road geocode | NOT_FOUND (반송순환로 100-53 not in VWorld road database) |
| VWorld POI search | NOT_FOUND (반송공원 POI not in VWorld) |
| Pipeline QA | `stage_a1_corrections.qa_decision=REQUIRE_ARRIVAL`, `coordinate_error_type=out_of_busan_bounds` |
| Resolution | COORD_GENUINE_EXCEPTION — evidence documented in canonical record |
| Image | KTO image recovered: `tong.visitkorea.or.kr/cms/resource/82/2907082_image2_1.JPG` |

No coordinates were invented. All evidence documented in `coord_exception_evidence` field of the canonical record.

---

## 4. Image Coverage

| Metric | Count | Rate |
|---|---|---|
| IMAGE_RESOLVED | 805 | 94.4% |
| IMAGE_MISSING | 48 | 5.6% |

### Missing image breakdown

| Reason | Count |
|---|---|
| FP candidates (TOURISM_RELEVANCE_REVIEW_REQUIRED) | 14 |
| Accommodation (AI_EXCLUDED) | 34 |
| Genuine attraction/nature missing | **0** |

**Key result**: Every attraction and nature place with confirmed tourism relevance has an image. AI_AUTO candidates are 756/756 = **100% image coverage**.

---

## 5. AI Eligibility

| Metric | Count |
|---|---|
| AI_AUTO = True | 756 |
| AI_BLOCKED | 97 |

### AI_BLOCKED breakdown

| Reason | Count |
|---|---|
| ACCOMMODATION_EXCLUDED_FROM_AI_ITINERARY | 82 |
| TOURISM_RELEVANCE_REVIEW_REQUIRED (FP candidates) | 14 |
| COORD_GENUINE_EXCEPTION | 1 |

---

## 6. False Positive Candidates (14 items)

These 14 items have `tourism_relevance=REVIEW_REQUIRED` and `ai_auto=False`. They were flagged during enrichment as potentially low tourism relevance. All have `image_status=source_exhausted`.

| canonical_id | name_ko |
|---|---|
| busan-K-00005 | 25의용단 |
| busan-K-00035 | 사상문화원 |
| busan-K-00052 | 함지골청소년수련관 |
| busan-K-00053 | 영도관광실탄사격장 |
| busan-K-00321 | 임랑카라반파크 |
| busan-K-00322 | 명지시장 |
| busan-K-00678 | UN조각공원 |
| busan-K-00685 | 플루니티 |
| busan-K-00720 | 고래서이뻐 |
| busan-K-00752 | (주식회사* entity) |
| busan-K-00753 | (주식회사* entity) |
| busan-K-00754 | (주식회사* entity) |
| busan-K-00755 | (주식회사* entity) |
| busan-K-00756 | (주식회사* entity) |

**Required action**: User review — KEEP / EXCLUDE / RECLASSIFY for each item before final merge.  
Current canonical state: included in universe, AI_BLOCKED, no image.

---

## 7. Accommodation (82 items)

- All 82 accommodation items: `ai_auto=False`, `ai_blocked_reason=ACCOMMODATION_EXCLUDED_FROM_AI_ITINERARY`
- 34 of 82 have no image (`image_status=source_exhausted`)
- 48 of 82 have images (KTO / Naver business / VisitBusan)
- Accommodations are in canonical for completeness but excluded from AI itinerary generation per platform policy

---

## 8. Common Geometry Policy (Phase 0)

**New file**: `docs/data-collection/multicity-geometry-navigation-policy-v1.md`

| Rule | Description |
|---|---|
| RULE-H | Area/Line 장소도 좌표 예외 금지 — 구역형/선형 장소에도 nav coord 의무 |
| RULE-I | 좌표 확보 우선순위 (7 levels: KTO → VWorld road → VWorld jibun → POI search → anchor → area 중심 → EXCEPTION) |
| RULE-J | Area/Line Geometry 보존 방침 (schema point-only fallback) |
| RULE-K | Coordinate Validation 기준 (bbox check, lat=lng check, zero check) |
| RULE-L | 주소 없는 경우 주소 먼저 회수 |
| RULE-M | 도시별 Bbox 기준 (부산/경주/서울/제주/전주) |

**Promotion target**: `data/multicity-common-baseline-v1` branch (pending merge by maintainer)

---

## 9. Final QA Status

| Check | Result |
|---|---|
| INVENTED_COORD | 0 — PASS |
| FOOD_194_CHANGED | 0 — PASS |
| WRONG_ENTITY_IMAGE | 0 — PASS |
| SECRET_LEAK | 0 — PASS |
| SCHEMA_VALID | PASS |
| NAV_READY | 852/853 (1 genuine exception) — PASS_WITH_WARN |
| IMAGE_COMPLETE | 805/853 (48 missing — all FP or accommodation) — PASS_WITH_WARN |
| AI_AUTO_IMAGE_COMPLETE | 756/756 = 100% — PASS |

**BUSAN_NONFOOD_FINAL_QA** = `PASS_WITH_WARN`  
**BUSAN_NONFOOD_DATA_STATUS** = `COMPLETE_WITH_KNOWN_GAPS`  
**GAPS**: 1 coord genuine exception (반송공원), 14 FP items pending review, 34 accommodation no-image  
**BUSAN_NAVIGATION_COMPLETE** = `YES`  
**BUSAN_IMAGE_TRACK_COMPLETE** = `YES` (attraction/nature 100%, accommodation partial accepted)  
**SAFE_TO_CLOSE_BUSAN_NONFOOD** = `YES` (pending FP review decision)  
**NEXT_CITY** = `GYEONGJU`

---

## 10. Files in This Commit

```
data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json   +29985 lines
docs/data-collection/multicity-geometry-navigation-policy-v1.md   +188 lines
```

---

## 11. Busan Full Data Status (Combined)

| Dataset | Records | Nav | Image | AI_AUTO |
|---|---|---|---|---|
| busan-food-194-canonical-v1 | 194 | 194/194 | 191/194 | 194/194 |
| busan-nonfood-canonical-v1 | 853 | 852/853 | 805/853 | 756/853 |
| **COMBINED** | **1047** | **1046/1047** | **996/1047** | **950/1047** |

---

## 12. Related Documents

- `docs/data-collection/busan/busan-food-final-handoff-v1.md` — Food 194 handoff (LOCKED)
- `docs/data-collection/busan/busan-food-194-image-final-closure-v3.md` — Image closure report
- `docs/data-collection/multicity-geometry-navigation-policy-v1.md` — Common geometry policy
- `docs/data-collection/multicity/multicity-common-baseline-v1.md` — Common SSOT (promote RULE-H~M)
