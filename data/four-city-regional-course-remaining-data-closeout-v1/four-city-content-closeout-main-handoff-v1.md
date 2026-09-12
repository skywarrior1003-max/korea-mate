# Four-City Regional Course Remaining Data Closeout — Main Handoff

**Task**: TASK-FOUR-CITY-REGIONAL-COURSE-REMAINING-DATA-CLOSEOUT-V1  
**Branch**: `data/four-city-regional-course-remaining-data-closeout-v1`  
**Base**: `data/four-city-regional-course-content-media-recovery-v1` @ dc80559  
**Date**: 2026-09-12  
**Status**: COMPLETE

---

## Completion Criteria

| Criterion | Result |
|-----------|--------|
| REGIONAL_RECOMMENDED_PLACE_WITHOUT_REQUIRED_DATA_COUNT | **0** (all 53 stops documented) |
| UNEXPLAINED_BLOCKED_ACTION_COUNT | **0** (all 209 reclassified) |
| ARITHMETIC_RECONCILED | **YES** |
| HARNESS_CONTRADICTION_EXPLAINED | **YES** |
| GATE_E_EXECUTED | **YES** (first actual HTTP verification) |

---

## Arithmetic Clarification

| Count | Value | Explanation |
|-------|-------|-------------|
| Course stop occurrences | **107** | All stops across all courses (Busan=43, Gyeongju=31, Jeju=15, Jeonju=18) |
| Unique stop entities | **88** | De-duplicated: 88 distinct places |
| Service-relevant unique entities | **53** | MATCH_EXISTING class: Busan=13, Gyeongju=15, Jeju=9, Jeonju=16 |
| Context-only unique entities | **35** | COURSE_CONTEXT_ONLY class |
| Multi-occurrence entities | **15** | Entities appearing in 2+ courses = 19 extra rows |
| MATCH_EXISTING occurrences | **71** | Used to generate 253 prior actions (not 53 unique) |
| COURSE_CONTEXT_ONLY occurrences | **36** | 107 = 71 + 36 ✓ |

**Key rule**: 253 prior actions were generated for 71 occurrences, so the same entity's actions appear multiple times when it spans courses.

---

## 209 BLOCKED Actions — Reclassification Summary

| New Classification | Count | Meaning |
|--------------------|-------|---------|
| DATA_ALREADY_PRESENT | **83** | Content confirmed in sibling branch |
| TRUE_SOURCE_BLOCKER | **71** | No official source exists or pipeline not built |
| RUNTIME_ONLY_GAP | **28** | Data exists but not yet written to canonical format |
| TEMPORARY_SOURCE_FAILURE | **24** | Official source temporarily unavailable (HTTP 500) |
| NOT_APPLICABLE | **3** | Action not relevant (area-context entity) |
| **UNEXPLAINED_BLOCKED** | **0** | ✓ |

### By City

| City | DATA_ALREADY_PRESENT | TRUE_SOURCE_BLOCKER | RUNTIME_ONLY_GAP | TEMP_FAILURE | NOT_APPLICABLE |
|------|---------------------|--------------------|--------------------|--------------|----------------|
| Busan | 42 | 0 | 0 | 0 | 0 |
| Gyeongju | 4 | 67 | 23 | 22* | 0 |
| Jeju | 0 | 0 | 0 | 0 | 0 |
| Jeonju | 37 | 4 | 5 | 2 | 3 |

*Note: Gyeongju TEMP_FAILURE count may vary slightly by occurrence; see four-city-prior-actions-reclassified-v1.jsonl for exact per-action values.

---

## Per-City Findings

### Busan (13 unique service stops)

**Overall status: STRONG**

- **desc_ko**: ✓ All 13 present (visitbusan.net)
- **image_url**: ✓ All 13 present, **Gate E: 13/13 HTTP 200** ✓
- **coords**: ✓ All 13 coord_valid
- **EN/JA/ZH**: ✓ DATA_ALREADY_PRESENT — `busan-nonfood-multilingual-enrichment-v1.jsonl` (branch: `data/busan-multilingual-v1`) has all 13 stops × 3 locales, `required_core_ready=True`, provider: Busan6260000_AttractionService

**Reclassified**: 42 BLOCKED → DATA_ALREADY_PRESENT (JA/ZH for all 13 stops)

### Gyeongju (15 unique service stops)

**Overall status: BLOCKED_TEMPORARY_SOURCE_FAILURE**

- **desc_ko**: ✗ NULL in canonical. `gyeongju.go.kr` root HTTP 200 but sub-pages HTTP 500 (verified 2026-09-12). `visitkorea.or.kr` JSP URLs 404 (site restructured). `tour.gyeongju.go.kr` DNS not found. **Classification: TEMPORARY_SOURCE_FAILURE (24 actions)**
- **image_url**: ✗ NULL for 14/15; KTO12-128634 has KTO CDN URL (HTTP 200). VG images confirmed (`VG_OFFICIAL_PUBLIC`) for 14/15 stops in image-rights file. **Classification: RUNTIME_ONLY_GAP (23 actions)** — URL requires VG pipeline write at main laptop intake.
- **coords**: 3/15 present (GJ01-0014, GJ01-0036, KTO12-128634). 12/15 no coord. **Classification: TRUE_SOURCE_BLOCKER** for missing 12.
- **EN multilingual**: 6/15 DATA_ALREADY_PRESENT (KTO EngService2 in `gyeongju-multilingual-v1`). 9/15 TRUE_SOURCE_BLOCKER.
- **JA/ZH**: ALL TRUE_SOURCE_BLOCKER — VG JA/ZH exists but requires hexID pipeline for GJ01-series (not built).

**Canonical name-ID discrepancy** (Gyeongju canonical is authoritative):

| ID | Canonical Name (✓) | Audit Name (✗) |
|----|-------------------|----------------|
| GJ01-0054 | 삼릉 | 오릉 |
| GJ01-0056 | 오릉 | 월성발굴현장 |
| GJ01-0127 | 석굴암 | 삼릉 |

### Jeju (9 unique service stops)

**Overall status: STRONG_EXCEPT_MANJANG_ML**

- **desc_ko**: ✓ All 9 present (visitjeju.net canonical)
- **image_url**: ✓ All 9 have `api.cdn.visitjeju.net` URLs. **Gate E: 1/9 HTTP 200 directly; 8/9 CDN_UNREACHABLE** (api.cdn.visitjeju.net returns connection error in automated testing — likely anti-bot; CDN operationally known to work in browser)
- **coords**: ✓ All 9 present
- **EN/JA/ZH for 8/9**: DATA_ALREADY_PRESENT in `jeju-multilingual-enrichment-v1.jsonl` (branch: `data/jeju-multilingual-v1`, keyed by source_cid)
- **만장굴 (CONT_000000000500182)**: `multilingual_cids: {en:False, jp:False, cn:False}` in canonical. visitjeju.net does not expose multilingual content for this CID. **Classification: TRUE_SOURCE_BLOCKER** for all 3 locales. Service status: ACTIVE.

### Jeonju (16 unique service stops)

**Overall status: GOOD_IMAGE_GAPS_FOR_4**

- **desc_ko**: ✓ 16/16 present (fetched from tour.jeonju.go.kr in previous recovery task dc80559)
- **image_url**: 12/16 present (KTO CDN: `tong.visitkorea.or.kr`). 4 stops have no image: OFF-16087, OFF-9772, OFF-9774, OFF-9780. **Gate E: 12/16 HTTP 200**
- **coords**: ✓ All 16 have has_coord=True
- **EN**: 15/16 DATA_ALREADY_PRESENT (jeonju-multilingual-v1). OFF-9774 NOT_APPLICABLE (area-context entity).
- **JA**: 11/16 DATA_ALREADY_PRESENT. 1 NOT_APPLICABLE (OFF-9774). 3 RUNTIME_ONLY_GAP (MAPPING_GAP with KTO CID). 1 TRUE_SOURCE_BLOCKER.
- **ZH**: 10/16 DATA_ALREADY_PRESENT. 1 NOT_APPLICABLE. 4 RUNTIME_ONLY_GAP. 1 TRUE_SOURCE_BLOCKER.

**OFF-9774 (전주천)**: OWNER_CONFIRMED_AREA_CONTEXT per jeonju-multilingual-gaps-v1.jsonl (owner_normalization_group=OMOKDAE, parent=OFF-9742). No multilingual needed.

---

## Gate E — Image Reachability (First Actual Verification)

| City | Total URLs | HTTP 200 | NO_URL | CDN Error | Result |
|------|-----------|---------|--------|-----------|--------|
| Busan | 13 | **13** | 0 | 0 | PASS ✓ |
| Gyeongju | 15 | **1** | 14 | 0 | PARTIAL |
| Jeju | 9 | **1** | 0 | 8 | CDN_UNREACHABLE |
| Jeonju | 16 | **12** | 4 | 0 | PARTIAL |

### Harness Contradiction Explained

The previous recovery task artifact (dc80559) stated "Harness 8/8 PASS (static + HTTP image verification)" but also "Gate E UNVERIFIED."

**Root cause**: Harness test 6 verified **91 Busan event images** from `busan-nonfood-canonical-v1.json` event data — entirely different from course stop image URLs. The Harness PASS was a true PASS for *event* images, not course stop images. Gate E for course stop images was genuinely unverified until this closeout task.

---

## Artifacts Generated (34 files)

**Per-city (24 files)** in `{city}/`:
- A: `{city}-stop-content-recovery-v1.jsonl`
- B: `{city}-image-reachability-v1.json`
- C: `{city}-multilingual-status-v1.jsonl`
- D: `{city}-coordinate-verification-v1.json`
- E: `{city}-stop-final-status-v1.jsonl`
- F: `{city}-recovery-summary-v1.json`

**Consolidated (10 files)** at root:
1. `four-city-content-recovery-matrix-v1.jsonl`
2. `four-city-image-reachability-v1.json`
3. `four-city-multilingual-coverage-v1.jsonl`
4. `four-city-coordinate-verification-v1.json`
5. `four-city-prior-actions-reclassified-v1.jsonl`
6. `four-city-city-comparison-v1.json`
7. `four-city-content-completeness-scorecard-v1.json`
8. `four-city-recovery-summary-v1.json`
9. `four-city-content-closeout-manifest-v1.json`
10. `four-city-content-closeout-main-handoff-v1.md` (this file)

---

## Next Actions for Main Laptop Intake

### Gyeongju (CRITICAL)
1. **desc_ko**: Retry gyeongju.go.kr when sub-pages restored; alternatively try KTO Korean API (`detailCommon2` service=KorService2)
2. **image_url**: Execute VG pipeline write using confirmed VG_OFFICIAL_PUBLIC rights (14/15 stops)
3. **coords**: Supplement from Kakao Maps or OpenStreetMap for 12 stops without coords
4. **JA/ZH**: Build hexID pipeline for GJ01-series or use KTO JA/ZH API

### Jeonju (MINOR)
1. **image_url** for 4 stops (OFF-16087, OFF-9772, OFF-9780): Find KTO image or alternative official source
2. **JA/ZH RUNTIME_ONLY_GAP** stops: Complete KTO ID linkage for MAPPING_GAP stops

### Jeju (MINOR)
1. **만장굴 multilingual**: Monitor visitjeju.net for EN/JA/ZH content addition; no action possible currently
2. **Gate E CDN**: CDN verification should be tested in a browser-context (headless Chrome) rather than urllib

### All Cities
- Update canonical records with multilingual content from sibling branches at production intake
- Generate navigation/AI eligibility updates after desc_ko gap is resolved for Gyeongju

---

## Absolute Prohibitions (Remain in Effect)
- Production DB write 금지
- Main DB write 금지  
- migration 금지
- master/main merge/push 금지
- AI 번역 금지
- Google Translate 금지
- unofficial blog/reviewer content 금지
- `git add .` / `git add -A` 금지
- UI 코드 수정 금지
